package expo.modules.studytimernotification

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * 자바스크립트에서 호출하는 공부 타이머 실시간 알림 모듈.
 * - show(startedAtMs, subjectName, accentColor): 실시간 경과 시간 알림 표시/갱신
 * - dismiss(): 알림 내리기
 * - consumePendingAction(): 백그라운드에서 눌린 취소/멈춤 동작 꺼내기
 */
class StudyTimerNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("StudyTimerNotification")

    Events("onTimerAction")

    OnCreate {
      activeInstance = WeakReference(this@StudyTimerNotificationModule)
    }

    OnDestroy {
      if (activeInstance?.get() === this@StudyTimerNotificationModule) {
        activeInstance = null
      }
    }

    Function("show") { startedAtMs: Double, subjectName: String?, accentColor: String? ->
      StudyTimerNotificationHelper.show(
        context = context,
        startedAtMs = startedAtMs.toLong(),
        subjectName = subjectName,
        accentColor = accentColor,
      )
    }

    Function("dismiss") {
      StudyTimerNotificationHelper.dismiss(context)
    }

    Function("consumePendingAction") {
      val pending = StudyTimerNotificationHelper.consumePendingAction(context)
        ?: return@Function null
      mapOf(
        "action" to pending.first,
        "atMs" to pending.second.toDouble(),
      )
    }
  }

  private fun emitTimerAction(action: String, atMs: Long) {
    runCatching {
      sendEvent(
        "onTimerAction",
        mapOf(
          "action" to action,
          "atMs" to atMs.toDouble(),
        ),
      )
    }
  }

  companion object {
    @Volatile
    private var activeInstance: WeakReference<StudyTimerNotificationModule>? = null

    fun notifyActionAvailable(action: String, atMs: Long) {
      activeInstance?.get()?.emitTimerAction(action, atMs)
    }
  }
}
