import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { flushPendingHabitLogToggles } from '@/hooks/use-habits';
import { flushPendingTodoToggles } from '@/hooks/use-todos';
import { useAuth } from '@/lib/auth';
import { hasNotificationPermission, requestNotificationPermission } from '@/lib/notifications';
import {
  cancelStudy,
  flushPendingStudy,
  forgetStudyTimerFor,
  loadStudyTimer,
  markStudyLeft,
  pauseStudy,
  resumeStudy,
  stopStudy,
  useStudyTimer,
} from '@/lib/study-timer';

import { StudyTimerNotification } from '../../modules/study-timer-notification';

const KEEP_AWAKE_TAG = 'study-timer';

/** 이번 앱 실행 중 타이머 알림 권한을 이미 물어봤는지 (거절 시 반복 요청 방지) */
let askedTimerNotificationPermission = false;

async function drainNotificationActions(): Promise<void> {
  if (!StudyTimerNotification) return;
  const actions = StudyTimerNotification.consumePendingActions();
  for (const item of actions) {
    const atMs = item.atMs > 0 ? item.atMs : undefined;
    if (item.action === 'pause') {
      await pauseStudy(atMs);
    } else if (item.action === 'resume') {
      await resumeStudy(atMs);
    } else if (item.action === 'save') {
      await stopStudy(atMs);
    } else if (item.action === 'cancel') {
      await cancelStudy('알림에서 타이머를 취소했어요.');
    }
  }
}

/**
 * 화면에는 아무것도 그리지 않고, 공부 타이머를 뒤에서 돌봐 주는 부품.
 * 로그인해 있는 동안 src/app/_layout.tsx 에 놓여 있다.
 *
 * - 앱을 열 때·다시 돌아올 때: 못 보낸 기록을 서버로 보내고, 알림에서 누른 취소/멈춤을 반영한다.
 * - "다른 앱으로 나가면 멈춤"이 켜져 있으면, 앱을 벗어나는 순간 타이머를 멈추고 기록한다.
 * - 타이머가 도는 동안에는 화면이 꺼지지 않게 하고, 안드로이드 실시간 타이머 알림을 띄운다.
 */
export function StudyTimerSync() {
  const { userId } = useAuth();
  const timer = useStudyTimer();
  const signedIn = userId !== null;

  // 처음: 저장된 상태를 읽고, 다른 계정의 타이머는 치우고, 알림 버튼 동작·못 보낸 기록을 처리한다.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    (async () => {
      await loadStudyTimer();
      await forgetStudyTimerFor(userId);
      await drainNotificationActions();
      if (!active) return;
      await flushPendingStudy(userId);
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn, userId]);

  // 안드로이드 실시간 타이머 알림의 "저장" / "일시정지·재개" / "취소" 버튼 이벤트 구독
  useEffect(() => {
    if (!signedIn || !StudyTimerNotification) return;
    const subscription = StudyTimerNotification.addListener('onTimerAction', () => {
      void drainNotificationActions();
    });
    return () => subscription.remove();
  }, [signedIn]);

  // 앱을 벗어났다가 다시 돌아온 경우 처리.
  const running = timer.running;
  const pauseOnLeave = timer.pauseOnLeave;
  useEffect(() => {
    if (!signedIn || !userId) return;

    function flushPendingEdits() {
      void flushPendingTodoToggles();
      void flushPendingHabitLogToggles();
    }
    function onLeave() {
      flushPendingEdits();
      if (pauseOnLeave && running && !running.pausedAt) void markStudyLeft();
    }
    function onReturn() {
      void (async () => {
        await drainNotificationActions();
        // 앱이 꺼져 있던 사이 "나간 시각"만 적어 두고 멈추지 못했으면, 지금 마저 멈춘다.
        if (running?.leftAt) await stopStudy(running.leftAt);
        await flushPendingStudy(userId!);
      })();
    }

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisibility = () => (document.visibilityState === 'hidden' ? onLeave() : onReturn());
      const onPageHide = () => flushPendingEdits();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      };
    }

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'inactive') flushPendingEdits();
      else if (next === 'background') onLeave();
      else if (next === 'active') onReturn();
    });
    return () => subscription.remove();
  }, [signedIn, userId, running, pauseOnLeave]);

  // 타이머가 도는 동안(일시정지 제외) 화면 꺼짐 막기
  const hasTimer = running !== null && !running.leftAt;
  const isActivelyRunning = hasTimer && !running.pausedAt;
  useEffect(() => {
    if (!isActivelyRunning) return;
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
  }, [isActivelyRunning]);

  // 타이머가 돌거나 일시정지 중일 때 안드로이드 알림에 현재 타이머(저장/일시정지·재개/취소)를 표시한다.
  const startedAt = running?.startedAt ?? null;
  const pausedAt = running?.pausedAt ?? null;
  const subjectName = running?.subjectName ?? null;
  const subjectColor = running?.subjectColor ?? null;
  useEffect(() => {
    if (!StudyTimerNotification) return;
    if (!signedIn || !hasTimer || startedAt === null) {
      try {
        StudyTimerNotification.dismiss();
      } catch {
        // 알림이 이미 없으면 무시한다.
      }
      return;
    }

    let cancelled = false;
    (async () => {
      let granted = await hasNotificationPermission();
      if (!granted && !askedTimerNotificationPermission) {
        askedTimerNotificationPermission = true;
        granted = await requestNotificationPermission();
      }
      if (!granted || cancelled) return;
      StudyTimerNotification.show(startedAt, pausedAt, subjectName, subjectColor);
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [signedIn, hasTimer, startedAt, pausedAt, subjectName, subjectColor]);

  // 로그아웃 등으로 부품이 사라질 때 진행 중 알림을 정리한다.
  useEffect(() => {
    return () => {
      try {
        StudyTimerNotification?.dismiss();
      } catch {
        // 무시
      }
    };
  }, []);

  return null;
}
