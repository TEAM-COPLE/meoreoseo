import { requireOptionalNativeModule } from 'expo';

/** 휴대폰에 온 결제 알림 하나 (안드로이드 앱이 모아 둔 것) */
export type PendingPaymentNotification = {
  id: string;
  /** 알림을 보낸 앱 (예: 토스 'viva.republica.toss') */
  packageName: string;
  title: string;
  text: string;
  /** 알림이 온 시각 (밀리초) */
  postTime: number;
};

type NativeModule = {
  isPermissionGranted(): boolean;
  openPermissionSettings(): void;
  getPending(): Promise<PendingPaymentNotification[]>;
  removePending(ids: string[]): Promise<void>;
};

/**
 * 안드로이드 앱에만 있는 기능이다.
 * 웹·아이폰, 그리고 이 기능이 들어가기 전에 만든 APK 에서는 null 이다.
 */
export const PaymentNotifications = requireOptionalNativeModule<NativeModule>('PaymentNotifications');
