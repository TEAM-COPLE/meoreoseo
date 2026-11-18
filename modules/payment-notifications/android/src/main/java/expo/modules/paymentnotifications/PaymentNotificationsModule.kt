package expo.modules.paymentnotifications

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 자바스크립트에서 부르는 결제 알림 기능.
 * - isPermissionGranted: "알림 접근 허용"이 켜져 있는지
 * - openPermissionSettings: 휴대폰의 "알림 접근 허용" 설정 화면 열기
 * - getPending: 모아 둔 결제 알림 꺼내 보기
 * - removePending: 가계부에 기록한 알림을 대기열에서 지우기
 */
class PaymentNotificationsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PaymentNotifications")

    Function("isPermissionGranted") {
      // 휴대폰 설정에 "알림 접근 허용"으로 켜 둔 서비스 목록에 우리 서비스가 있는지 본다.
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      val ours = ComponentName(context, PaymentNotificationListener::class.java)
      enabled.split(":").any { ComponentName.unflattenFromString(it) == ours }
    }

    Function("openPermissionSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("getPending") {
      PaymentQueue.list(context).map { item ->
        mapOf(
          "id" to item.id,
          "packageName" to item.packageName,
          "title" to item.title,
          "text" to item.text,
          // 자바스크립트 숫자로 정확히 넘기려고 Double 로 바꾼다(밀리초).
          "postTime" to item.postTime.toDouble(),
        )
      }
    }

    AsyncFunction("removePending") { ids: List<String> ->
      PaymentQueue.remove(context, ids)
    }
  }
}
