import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import {
  flushPendingStudy,
  forgetStudyTimerFor,
  loadStudyTimer,
  markStudyLeft,
  stopStudy,
  useStudyTimer,
} from '@/lib/study-timer';

const KEEP_AWAKE_TAG = 'study-timer';

/**
 * 화면에는 아무것도 그리지 않고, 공부 타이머를 뒤에서 돌봐 주는 부품.
 * 로그인해 있는 동안 src/app/_layout.tsx 에 놓여 있다.
 *
 * - 앱을 열 때·다시 돌아올 때: 못 보낸 기록을 서버로 보낸다.
 * - "다른 앱으로 나가면 멈춤"이 켜져 있으면, 앱을 벗어나는 순간 타이머를 멈추고 기록한다.
 * - 타이머가 도는 동안에는 화면이 저절로 꺼지지 않게 한다 (화면이 꺼지면 "나간 것"이 되기 때문).
 */
export function StudyTimerSync() {
  const { userId, session } = useAuth();
  const timer = useStudyTimer();
  const signedIn = session !== null && userId !== null;

  // 처음: 저장된 상태를 읽고, 다른 계정의 타이머는 치우고, 못 보낸 기록을 보낸다.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    (async () => {
      await loadStudyTimer();
      await forgetStudyTimerFor(userId);
      if (!active) return;
      await flushPendingStudy(userId);
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn, userId]);

  // 앱을 벗어났다가 다시 돌아온 경우 처리.
  const running = timer.running;
  const pauseOnLeave = timer.pauseOnLeave;
  useEffect(() => {
    if (!signedIn || !userId) return;

    function onLeave() {
      if (pauseOnLeave && running) void markStudyLeft();
    }
    function onReturn() {
      // 앱이 꺼져 있던 사이 "나간 시각"만 적어 두고 멈추지 못했으면, 지금 마저 멈춘다.
      if (running?.leftAt) void stopStudy(running.leftAt);
      void flushPendingStudy(userId!);
    }

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisibility = () => (document.visibilityState === 'hidden' ? onLeave() : onReturn());
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') onLeave();
      else if (next === 'active') onReturn();
    });
    return () => subscription.remove();
  }, [signedIn, userId, running, pauseOnLeave]);

  // 타이머가 도는 동안 화면 꺼짐 막기
  const isRunning = running !== null && !running.leftAt;
  useEffect(() => {
    if (!isRunning) return;
    // 켜기가 실제로 성공했을 때만 끈다. (웹에서는 켜기가 실패하거나 늦을 수 있고,
    // 켜지지 않은 것을 끄려고 하면 오류가 난다.)
    const activation = activateKeepAwakeAsync(KEEP_AWAKE_TAG).then(
      () => true,
      () => false,
    );
    return () => {
      void activation.then(async (activated) => {
        if (!activated) return;
        try {
          await deactivateKeepAwake(KEEP_AWAKE_TAG);
        } catch {
          // 웹 등에서 지원하지 않으면 무시한다.
        }
      });
    };
  }, [isRunning]);

  return null;
}
