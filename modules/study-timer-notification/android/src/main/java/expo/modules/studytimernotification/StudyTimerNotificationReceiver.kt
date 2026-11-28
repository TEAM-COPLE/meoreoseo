package expo.modules.studytimernotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 진행 중 타이머 알림의 "취소" 또는 "멈춤" 버튼을 눌렀을 때 받는다.
 * 알림을 즉시 내리고, 눌린 시각을 저장한 뒤 JS 쪽이 살아 있으면 바로 알려 준다.
 */
class StudyTimerNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val actionName = when (intent.action) {
      StudyTimerNotificationHelper.ACTION_STOP -> "stop"
      StudyTimerNotificationHelper.ACTION_CANCEL -> "cancel"
      else -> return
    }
    val nowMs = System.currentTimeMillis()
    StudyTimerNotificationHelper.dismiss(context)
    StudyTimerNotificationHelper.savePendingAction(context, actionName, nowMs)
    StudyTimerNotificationModule.notifyActionAvailable(actionName, nowMs)
  }
}
