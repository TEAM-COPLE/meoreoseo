import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export type StudyTimerNotificationAction = {
  action: 'save' | 'pause' | 'resume' | 'cancel';
  /** 사용자가 알림 버튼을 누른 시각 (밀리초) */
  atMs: number;
};

type NativeModule = {
  show(
    startedAtMs: number,
    pausedAtMs: number | null,
    subjectName: string | null,
    accentColor: string | null,
  ): void;
  dismiss(): void;
  consumePendingActions(): StudyTimerNotificationAction[];
  addListener(
    eventName: 'onTimerAction',
    listener: (event: StudyTimerNotificationAction) => void,
  ): EventSubscription;
};

/**
 * 안드로이드 진행 중 공부 타이머 알림(실시간 경과 시간 + 저장/일시정지·재개/취소 버튼).
 * 웹·아이폰, 그리고 이 네이티브 모듈이 없는 이전 APK 에서는 null 이다.
 */
export const StudyTimerNotification =
  requireOptionalNativeModule<NativeModule>('StudyTimerNotification');
