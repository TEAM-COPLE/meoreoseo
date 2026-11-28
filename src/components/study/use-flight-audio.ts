import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

const AIRPLANE_SIGN_SOUND = require('@/assets/sounds/Airplane_Sign.wav');
const AIRPLANE_FLY_SOUND = require('@/assets/sounds/Airplane_Fly.wav');

const SETTINGS_KEY = 'meoreoseo:flight-audio-settings';

export type FlightAudioSettings = {
  /** 전체 오디오 재생 ON/OFF */
  enabled: boolean;
  /** 시작·종료 기내 사인음(Airplane_Sign.wav) ON/OFF */
  signEnabled: boolean;
  /** 비행 중 백색소음(Airplane_Fly.wav) ON/OFF */
  flyEnabled: boolean;
  /** 기내 사인음 볼륨 (0.0 ~ 1.0) */
  signVolume: number;
  /** 비행 백색소음 볼륨 (0.0 ~ 1.0) */
  flyVolume: number;
};

export const DEFAULT_FLIGHT_AUDIO_SETTINGS: FlightAudioSettings = {
  enabled: true,
  signEnabled: true,
  flyEnabled: true,
  signVolume: 1,
  flyVolume: 1,
};

/** 이륙 사인("딩" 0.0s, "동" 1.0s, 잔향 ~2.6s)이 끝난 뒤 기내 주행음을 페이드인할 간격(ms) */
const SIGN_TO_FLY_DELAY_MS = 2700;
/** 비행 시작 시 주행음 페이드인 길이(ms) */
const FADE_IN_DURATION_MS = 3200;
/** 도착 몇 초 전부터 주행음 페이드아웃을 시작할지(초) — 딩동 시작(1초 전) 이전에 조용해지도록 여유를 둔다 */
const FADE_OUT_LEAD_SECONDS = 6;
/** "딩"(0초) 후 "동"(1.0초)에 맞춰 도착 블루 화면이 뜨도록 도착 1초 전에 사인을 시작한다 */
const SIGN_PRE_ARRIVAL_SECONDS = 1;
/** 사용자가 직접 비행을 중단할 때 주행음 페이드아웃 길이(ms) */
const MANUAL_FADE_OUT_MS = 900;
const FADE_STEP_MS = 50;

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export function useFlightAudioSettings() {
  const [settings, setSettings] = useState<FlightAudioSettings>(DEFAULT_FLIGHT_AUDIO_SETTINGS);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<FlightAudioSettings>;
        setSettings({
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
          signEnabled: typeof parsed.signEnabled === 'boolean' ? parsed.signEnabled : true,
          flyEnabled: typeof parsed.flyEnabled === 'boolean' ? parsed.flyEnabled : true,
          signVolume: clampVolume(parsed.signVolume, 1),
          flyVolume: clampVolume(parsed.flyVolume, 1),
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<FlightAudioSettings>) => {
    setSettings((prev) => {
      const next: FlightAudioSettings = {
        ...prev,
        ...patch,
        signVolume: clampVolume(patch.signVolume ?? prev.signVolume, prev.signVolume),
        flyVolume: clampVolume(patch.flyVolume ?? prev.flyVolume, prev.flyVolume),
      };
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}

type Params = {
  visible: boolean;
  running: boolean;
  arrived: boolean;
  remainingSeconds: number;
  arrivalKey: string;
  settings: FlightAudioSettings;
};

/**
 * 비행 타이머 오디오 제어 훅:
 * - 전체 ON/OFF 및 사인음·백색소음 개별 ON/OFF·볼륨 설정 지원
 * - 비행 시작: Airplane_Sign.wav 재생 → 잔향 종료 후 Airplane_Fly.wav 페이드인 + 무한 반복
 * - 비행 종료(도착): 도착 6초 전 Airplane_Fly.wav 페이드아웃 → 도착 1초 전 "딩" 시작 → 0초 "동"과 동시에 도착 화면
 * - 비행 종료(중단): Airplane_Fly.wav 빠르게 페이드아웃 → Airplane_Sign.wav 재생
 */
export function useFlightAudio({
  visible,
  running,
  arrived,
  remainingSeconds,
  arrivalKey,
  settings,
}: Params) {
  const signActive = settings.enabled && settings.signEnabled;
  const flyAllowed = settings.enabled && settings.flyEnabled;
  const signVolume = settings.signVolume;
  const flyTargetVolume = settings.flyVolume;

  const signPlayerRef = useRef<AudioPlayer | null>(null);
  const flyPlayerRef = useRef<AudioPlayer | null>(null);
  const signActiveRef = useRef(signActive);
  const flyAllowedRef = useRef(flyAllowed);
  const signVolumeRef = useRef(signVolume);
  const flyTargetVolumeRef = useRef(flyTargetVolume);

  useEffect(() => {
    signActiveRef.current = signActive;
    flyAllowedRef.current = flyAllowed;
    signVolumeRef.current = signVolume;
    flyTargetVolumeRef.current = flyTargetVolume;
  }, [signActive, flyAllowed, signVolume, flyTargetVolume]);

  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef(0);
  const flyVolumeRef = useRef(0);
  const flyActiveRef = useRef(false);
  const fadingOutKeyRef = useRef<string | null>(null);
  const endedKeyRef = useRef<string | null>(null);
  const manualStoppingRef = useRef(false);
  const startingPendingRef = useRef(false);
  const previewingFlyRef = useRef(false);
  const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPreviewTimer = useCallback(() => {
    if (previewStopTimerRef.current !== null) {
      clearTimeout(previewStopTimerRef.current);
      previewStopTimerRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  const setFlyVolumeSafe = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    flyVolumeRef.current = clamped;
    const player = flyPlayerRef.current;
    if (!player) return;
    try {
      player.volume = clamped;
    } catch {
      // 플레이어가 아직 준비되지 않았거나 해제된 경우 무시한다.
    }
  }, []);

  const stopFlyImmediate = useCallback(() => {
    sessionTokenRef.current += 1;
    clearTimers();
    clearPreviewTimer();
    previewingFlyRef.current = false;
    flyActiveRef.current = false;
    setFlyVolumeSafe(0);
    try {
      flyPlayerRef.current?.pause();
    } catch {
      // 무시
    }
  }, [clearTimers, clearPreviewTimer, setFlyVolumeSafe]);

  const playSign = useCallback(() => {
    if (!signActiveRef.current) return;
    void (async () => {
      const player = signPlayerRef.current;
      if (!player) return;
      try {
        player.volume = signVolumeRef.current;
        await player.seekTo(0);
      } catch {
        // seekTo 실패해도 재생 시도
      }
      try {
        player.play();
      } catch {
        // 오디오 재생이 실패해도 타이머 동작은 계속한다.
      }
    })();
  }, []);

  const fadeFlyTo = useCallback(
    (
      fromVolume: number,
      targetVolume: number,
      durationMs: number,
      curve: 'easeIn' | 'easeOut',
      onComplete?: () => void,
    ) => {
      if (fadeTimerRef.current !== null) {
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setFlyVolumeSafe(fromVolume);
      if (durationMs <= 0 || Math.abs(targetVolume - fromVolume) < 0.005) {
        setFlyVolumeSafe(targetVolume);
        onComplete?.();
        return;
      }
      const startedAt = Date.now();
      const token = sessionTokenRef.current;
      fadeTimerRef.current = setInterval(() => {
        if (sessionTokenRef.current !== token) {
          if (fadeTimerRef.current !== null) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
          return;
        }
        const raw = Math.min(1, (Date.now() - startedAt) / durationMs);
        const eased = curve === 'easeIn' ? raw * raw : 1 - (1 - raw) * (1 - raw);
        setFlyVolumeSafe(fromVolume + (targetVolume - fromVolume) * eased);
        if (raw >= 1) {
          if (fadeTimerRef.current !== null) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
          onComplete?.();
        }
      }, FADE_STEP_MS);
    },
    [setFlyVolumeSafe],
  );

  const startFlyFadeIn = useCallback(() => {
    if (!flyAllowedRef.current) return;
    const player = flyPlayerRef.current;
    if (!player) return;
    const token = sessionTokenRef.current;
    flyActiveRef.current = true;
    void (async () => {
      try {
        player.loop = true;
        setFlyVolumeSafe(0);
        if (player.currentTime > 0.1) {
          try {
            await player.seekTo(0);
          } catch {
            // 무시
          }
        }
        if (sessionTokenRef.current !== token || !flyAllowedRef.current) return;
        setFlyVolumeSafe(0);
        player.play();
        setFlyVolumeSafe(0);
        fadeFlyTo(0, flyTargetVolumeRef.current, FADE_IN_DURATION_MS, 'easeIn');
      } catch {
        if (sessionTokenRef.current === token) {
          flyActiveRef.current = false;
        }
      }
    })();
  }, [setFlyVolumeSafe, fadeFlyTo]);

  // 플레이어 생성 및 언마운트 시 정리
  useEffect(() => {
    let sign: AudioPlayer | null = null;
    let fly: AudioPlayer | null = null;
    try {
      sign = createAudioPlayer(AIRPLANE_SIGN_SOUND);
      fly = createAudioPlayer(AIRPLANE_FLY_SOUND);
      fly.loop = true;
      fly.volume = 0;
    } catch {
      // 오디오 모듈이 없는 환경(이전 APK 등)에서는 조용히 무시한다.
    }
    signPlayerRef.current = sign;
    flyPlayerRef.current = fly;

    return () => {
      manualStoppingRef.current = false;
      startingPendingRef.current = false;
      stopFlyImmediate();
      signPlayerRef.current = null;
      flyPlayerRef.current = null;
      try {
        sign?.remove();
      } catch {
        // 무시
      }
      try {
        fly?.remove();
      } catch {
        // 무시
      }
    };
  }, [stopFlyImmediate]);

  useEffect(() => {
    if (running) {
      startingPendingRef.current = false;
    }
  }, [running]);

  // 비행 중 백색소음 ON/OFF 또는 볼륨 변경 즉시 반영
  useEffect(() => {
    if (!flyAllowed) {
      if (flyActiveRef.current || delayTimerRef.current !== null) {
        stopFlyImmediate();
      }
      return;
    }
    if (!visible || !running || arrived) return;
    if (remainingSeconds <= FADE_OUT_LEAD_SECONDS) return;

    if (flyActiveRef.current && fadeTimerRef.current === null) {
      setFlyVolumeSafe(flyTargetVolume);
    } else if (!flyActiveRef.current && delayTimerRef.current === null) {
      startFlyFadeIn();
    }
  }, [
    flyAllowed,
    flyTargetVolume,
    visible,
    running,
    arrived,
    remainingSeconds,
    stopFlyImmediate,
    setFlyVolumeSafe,
    startFlyFadeIn,
  ]);

  /** 비행 시작 시 호출: 사인 재생 후 페이드인으로 비행음 반복 시작 */
  const onFlightStart = useCallback(() => {
    sessionTokenRef.current += 1;
    clearTimers();
    manualStoppingRef.current = false;
    startingPendingRef.current = true;
    fadingOutKeyRef.current = null;
    endedKeyRef.current = null;
    flyActiveRef.current = false;
    setFlyVolumeSafe(0);
    try {
      flyPlayerRef.current?.pause();
    } catch {
      // 무시
    }

    const token = sessionTokenRef.current;
    const willPlaySign = signActiveRef.current;
    if (willPlaySign) {
      playSign();
    }
    if (!flyAllowedRef.current) return;

    if (willPlaySign) {
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        if (sessionTokenRef.current !== token) return;
        startFlyFadeIn();
      }, SIGN_TO_FLY_DELAY_MS);
    } else {
      startFlyFadeIn();
    }
  }, [clearTimers, setFlyVolumeSafe, playSign, startFlyFadeIn]);

  /** 사용자가 비행 중단/종료 버튼을 눌렀을 때 호출 */
  const onFlightStop = useCallback(() => {
    startingPendingRef.current = false;
    if (endedKeyRef.current === arrivalKey) {
      stopFlyImmediate();
      return;
    }
    endedKeyRef.current = arrivalKey;
    fadingOutKeyRef.current = arrivalKey;

    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    if (flyActiveRef.current && flyVolumeRef.current > 0.01) {
      manualStoppingRef.current = true;
      fadeFlyTo(flyVolumeRef.current, 0, MANUAL_FADE_OUT_MS, 'easeOut', () => {
        manualStoppingRef.current = false;
        flyActiveRef.current = false;
        try {
          flyPlayerRef.current?.pause();
        } catch {
          // 무시
        }
        playSign();
      });
    } else {
      stopFlyImmediate();
      playSign();
    }
  }, [arrivalKey, fadeFlyTo, playSign, stopFlyImmediate]);

  // 도착 몇 초 전부터 주행음을 부드럽게 페이드아웃한다(도착 사인이 울리기 전에 조용해지도록).
  useEffect(() => {
    if (!visible || !running || arrived) return;
    if (remainingSeconds <= 0 || remainingSeconds > FADE_OUT_LEAD_SECONDS) return;
    if (fadingOutKeyRef.current === arrivalKey) return;
    fadingOutKeyRef.current = arrivalKey;

    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (!flyActiveRef.current) return;

    const fadeMs = Math.max(400, (remainingSeconds - SIGN_PRE_ARRIVAL_SECONDS - 0.2) * 1000);
    fadeFlyTo(flyVolumeRef.current, 0, fadeMs, 'easeOut', () => {
      flyActiveRef.current = false;
      try {
        flyPlayerRef.current?.pause();
      } catch {
        // 무시
      }
    });
  }, [visible, running, arrived, remainingSeconds, arrivalKey, fadeFlyTo]);

  // 도착 1초 전에 "딩"을 시작해, 1초 뒤 "동" 타이밍과 동시에 도착 블루 화면이 뜨게 맞춘다.
  useEffect(() => {
    if (!visible || !running || arrived) return;
    if (remainingSeconds <= 0 || remainingSeconds > SIGN_PRE_ARRIVAL_SECONDS) return;
    if (endedKeyRef.current === arrivalKey) return;
    endedKeyRef.current = arrivalKey;
    stopFlyImmediate();
    playSign();
  }, [visible, running, arrived, remainingSeconds, arrivalKey, stopFlyImmediate, playSign]);

  // 도착 직전 구간을 건너뛰고 이미 도착한 상태로 열린 경우의 안전장치
  useEffect(() => {
    if (!visible || !arrived) return;
    stopFlyImmediate();
    if (endedKeyRef.current === arrivalKey) return;
    endedKeyRef.current = arrivalKey;
    playSign();
  }, [visible, arrived, arrivalKey, stopFlyImmediate, playSign]);

  // 외부에서 타이머가 멈췄거나 모달이 닫혔을 때 주행음을 정리한다.
  useEffect(() => {
    if (!visible) {
      manualStoppingRef.current = false;
      startingPendingRef.current = false;
      stopFlyImmediate();
      return;
    }
    if (!running && !manualStoppingRef.current && !startingPendingRef.current && !previewingFlyRef.current) {
      stopFlyImmediate();
    }
  }, [visible, running, stopFlyImmediate]);

  /** 기내 사인음 슬라이더 드래그 중 실시간 볼륨 반영 */
  const previewSignVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    signVolumeRef.current = clamped;
    try {
      if (signPlayerRef.current) {
        signPlayerRef.current.volume = clamped;
      }
    } catch {
      // 무시
    }
  }, []);

  /** 기내 사인음 슬라이더 조작 완료(탭/손 뗌) 시 해당 볼륨으로 미리듣기 1회 재생 */
  const previewSignPlay = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    signVolumeRef.current = clamped;
    const player = signPlayerRef.current;
    if (!player || clamped <= 0) return;
    void (async () => {
      try {
        player.volume = clamped;
        await player.seekTo(0);
      } catch {
        // 무시
      }
      try {
        player.play();
      } catch {
        // 무시
      }
    })();
  }, []);

  /** 비행 백색소음 슬라이더 드래그 중 실시간 미리듣기 (비행 중이면 즉시 볼륨만 변경) */
  const previewFlyVolume = useCallback(
    (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      flyTargetVolumeRef.current = clamped;
      clearPreviewTimer();

      if (flyActiveRef.current) {
        // 이미 비행 중이면 현재 재생 중인 주행음 볼륨을 즉시 반영한다.
        if (fadeTimerRef.current !== null) {
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        setFlyVolumeSafe(clamped);
        return;
      }

      const player = flyPlayerRef.current;
      if (!player) return;
      previewingFlyRef.current = true;
      try {
        player.loop = true;
        setFlyVolumeSafe(clamped);
        if (!player.playing) {
          player.play();
          setFlyVolumeSafe(clamped);
        }
      } catch {
        // 무시
      }
    },
    [clearPreviewTimer, setFlyVolumeSafe],
  );

  /** 비행 백색소음 슬라이더에서 손을 떼면 잠시 뒤 미리듣기를 부드럽게 멈춘다(비행 중이 아닐 때만). */
  const previewFlyRelease = useCallback(() => {
    if (!previewingFlyRef.current || flyActiveRef.current) return;
    clearPreviewTimer();
    previewStopTimerRef.current = setTimeout(() => {
      previewStopTimerRef.current = null;
      if (!previewingFlyRef.current || flyActiveRef.current) return;
      fadeFlyTo(flyVolumeRef.current, 0, 450, 'easeOut', () => {
        if (!previewingFlyRef.current || flyActiveRef.current) return;
        previewingFlyRef.current = false;
        try {
          flyPlayerRef.current?.pause();
        } catch {
          // 무시
        }
      });
    }, 1000);
  }, [clearPreviewTimer, fadeFlyTo]);

  /** 오디오 팝업을 닫을 때 비행 중이 아닌 미리듣기 소리를 즉시 정리한다. */
  const stopAudioPreview = useCallback(() => {
    clearPreviewTimer();
    if (previewingFlyRef.current && !flyActiveRef.current) {
      previewingFlyRef.current = false;
      setFlyVolumeSafe(0);
      try {
        flyPlayerRef.current?.pause();
      } catch {
        // 무시
      }
    }
  }, [clearPreviewTimer, setFlyVolumeSafe]);

  return {
    onFlightStart,
    onFlightStop,
    previewSignVolume,
    previewSignPlay,
    previewFlyVolume,
    previewFlyRelease,
    stopAudioPreview,
  };
}
