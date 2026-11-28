package expo.modules.studytimernotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 진행 중 타이머 알림의 "저장" / "일시정지·재개" / "취소" 버튼을 눌렀을 때 받는다.
 */
class StudyTimerNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val nowMs = System.currentTimeMillis()
    val actionName = when (intent.action) {
      StudyTimerNotificationHelper.ACTION_SAVE -> {
        StudyTimerNotificationHelper.dismiss(context)
        "save"
      }
      StudyTimerNotificationHelper.ACTION_CANCEL -> {
        StudyTimerNotificationHelper.dismiss(context)
        "cancel"
      }
      StudyTimerNotificationHelper.ACTION_PAUSE -> {
        StudyTimerNotificationHelper.handleNativePause(context, nowMs)
        "pause"
      }
      StudyTimerNotificationHelper.ACTION_RESUME -> {
        StudyTimerNotificationHelper.handleNativeResume(context, nowMs)
        "resume"
      }
      else -> return
    }
    StudyTimerNotificationHelper.appendPendingAction(context, actionName, nowMs)
    StudyTimerNotificationModule.notifyActionAvailable(actionName, nowMs)
  }
}
