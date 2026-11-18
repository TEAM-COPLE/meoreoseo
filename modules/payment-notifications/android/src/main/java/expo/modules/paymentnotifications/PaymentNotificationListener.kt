package expo.modules.paymentnotifications

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * 휴대폰에 새 알림이 오면 불리는 서비스.
 * 결제·입금처럼 보이는 알림만 골라 휴대폰 안의 대기열(PaymentQueue)에 넣어 둔다.
 * 앱을 열면 자바스크립트 쪽에서 대기열을 꺼내 가계부에 기록한다.
 * (앱이 꺼져 있어도 알림은 모아 두었다가, 다음에 앱을 열 때 한꺼번에 기록된다.)
 */
class PaymentNotificationListener : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try {
      val packageName = sbn.packageName ?: return
      // 우리 앱 알림, 메신저 알림은 읽지 않는다(대화 내용에 금액이 있어도 결제가 아니다).
      if (packageName == applicationContext.packageName) return
      if (IGNORED_PACKAGES.contains(packageName)) return

      val notification = sbn.notification ?: return
      // 여러 알림을 묶어 보여주는 "요약" 알림은 같은 내용이 겹치므로 건너뛴다.
      if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

      val extras = notification.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
      val text = bigText ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
      val joined = "$title\n$text"

      // 금액(예: 12,000원)과 결제 관련 낱말이 함께 있는 알림만 모은다.
      if (!AMOUNT_REGEX.containsMatchIn(joined)) return
      if (!KEYWORD_REGEX.containsMatchIn(joined)) return

      PaymentQueue.add(
        applicationContext,
        PaymentQueue.Item(
          id = "${packageName}:${sbn.postTime}:${joined.hashCode()}",
          packageName = packageName,
          title = title.take(200),
          text = text.take(500),
          postTime = sbn.postTime,
        ),
      )
    } catch (e: Exception) {
      // 알림 하나를 못 읽어도 휴대폰 알림 전체에 영향을 주지 않도록 조용히 넘어간다.
    }
  }

  companion object {
    private val AMOUNT_REGEX = Regex("[0-9][0-9,]*\\s*원")
    private val KEYWORD_REGEX = Regex("결제|승인|출금|입금|송금|이체|환불|취소|받았|보냈|사용|납부")

    /** 메신저 앱: 대화에 금액이 나와도 결제 알림이 아니다. */
    private val IGNORED_PACKAGES = setOf(
      "com.kakao.talk",
      "jp.naver.line.android",
      "org.telegram.messenger",
      "com.facebook.orca",
      "com.instagram.android",
      "com.discord",
      "com.whatsapp",
    )
  }
}
