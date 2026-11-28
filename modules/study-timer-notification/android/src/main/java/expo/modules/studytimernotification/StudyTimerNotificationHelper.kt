package expo.modules.studytimernotification

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal object StudyTimerNotificationHelper {
  const val CHANNEL_ID = "study-timer-live"
  const val NOTIFICATION_ID = 41021

  const val ACTION_STOP = "expo.modules.studytimernotification.ACTION_STOP"
  const val ACTION_CANCEL = "expo.modules.studytimernotification.ACTION_CANCEL"

  private const val DEFAULT_BADGE_COLOR = "#5B5CE6"
  private const val PREFS_NAME = "study_timer_notification_prefs"
  private const val KEY_PENDING_ACTION = "pending_action"
  private const val KEY_PENDING_AT_MS = "pending_at_ms"

  private val lock = Any()

  fun savePendingAction(context: Context, action: String, atMs: Long) {
    synchronized(lock) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_PENDING_ACTION, action)
        .putLong(KEY_PENDING_AT_MS, atMs)
        .apply()
    }
  }

  fun consumePendingAction(context: Context): Pair<String, Long>? {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val action = prefs.getString(KEY_PENDING_ACTION, null) ?: return null
      val atMs = prefs.getLong(KEY_PENDING_AT_MS, 0L)
      prefs.edit().remove(KEY_PENDING_ACTION).remove(KEY_PENDING_AT_MS).apply()
      return action to atMs
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "공부 타이머",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "공부 타이머가 실행 중일 때 경과 시간과 제어 버튼을 표시합니다."
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun hasPostPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS,
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) return false
    }
    return NotificationManagerCompat.from(context).areNotificationsEnabled()
  }

  private fun formatStartTime(startedAtMs: Long): String {
    val formatter = SimpleDateFormat("a h:mm", Locale.KOREAN)
    return formatter.format(Date(startedAtMs))
  }

  private fun openStudyIntent(context: Context): PendingIntent {
    val deepLink = Intent(Intent.ACTION_VIEW, Uri.parse("meoreoseo://study")).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val intent = if (deepLink.resolveActivity(context.packageManager) != null) {
      deepLink
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      } ?: deepLink
    }
    return PendingIntent.getActivity(
      context,
      100,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun actionIntent(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, StudyTimerNotificationReceiver::class.java).apply {
      this.action = action
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun parseColor(hex: String?): Int {
    if (hex.isNullOrBlank()) return Color.parseColor(DEFAULT_BADGE_COLOR)
    return runCatching { Color.parseColor(hex) }
      .getOrElse { Color.parseColor(DEFAULT_BADGE_COLOR) }
  }

  @SuppressLint("MissingPermission")
  fun show(
    context: Context,
    startedAtMs: Long,
    subjectName: String?,
    accentColor: String?,
  ) {
    ensureChannel(context)
    if (!hasPostPermission(context)) return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val cleanSubject = subjectName?.trim()?.takeIf { it.isNotEmpty() }
    val startTimeText = formatStartTime(startedAtMs)
    val title = if (cleanSubject != null) "$cleanSubject 공부 중" else "공부 타이머"
    val subtitle = if (cleanSubject != null) {
      "$cleanSubject / $startTimeText 시작"
    } else {
      "공부 중 / $startTimeText 시작"
    }

    val openIntent = openStudyIntent(context)
    val cancelIntent = actionIntent(context, ACTION_CANCEL, 101)
    val stopIntent = actionIntent(context, ACTION_STOP, 102)

    val notification: Notification =
      if (Build.VERSION.SDK_INT >= 36 && manager.canPostPromotedNotifications()) {
        // Android 16+ Live Updates (Now Bar / 잠금화면 실시간 카드 / 상태바 칩)
        val shortLabel = (cleanSubject ?: "공부 중").take(8)
        Notification.Builder(context, CHANNEL_ID)
          .setSmallIcon(R.drawable.ic_timer_hourglass)
          .setContentTitle(title)
          .setContentText("$startTimeText 시작")
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setUsesChronometer(true)
          .setWhen(startedAtMs)
          .setShowWhen(true)
          .setCategory(Notification.CATEGORY_STOPWATCH)
          .setVisibility(Notification.VISIBILITY_PUBLIC)
          .setContentIntent(openIntent)
          .addAction(Notification.Action.Builder(null, "취소", cancelIntent).build())
          .addAction(Notification.Action.Builder(null, "멈춤", stopIntent).build())
          .setRequestPromotedOngoing(true)
          .setShortCriticalText(shortLabel)
          .build()
      } else {
        // Android 15 (One UI 7) 이하 또는 실시간 알림 꺼짐:
        // 대형 실시간 Chronometer + 과목/시작시각 + 취소|멈춤 버튼 카드
        val elapsedMs = (System.currentTimeMillis() - startedAtMs).coerceAtLeast(0L)
        val chronometerBase = SystemClock.elapsedRealtime() - elapsedMs
        val badgeColor = parseColor(accentColor)

        val collapsed = RemoteViews(
          context.packageName,
          R.layout.notification_study_timer_collapsed,
        ).apply {
          setInt(R.id.timer_icon_bg, "setColorFilter", badgeColor)
          setChronometer(R.id.timer_chronometer, chronometerBase, null, true)
          setTextViewText(R.id.timer_subtitle, subtitle)
        }

        val expanded = RemoteViews(
          context.packageName,
          R.layout.notification_study_timer_expanded,
        ).apply {
          setInt(R.id.timer_icon_bg, "setColorFilter", badgeColor)
          setChronometer(R.id.timer_chronometer, chronometerBase, null, true)
          setTextViewText(R.id.timer_subtitle, subtitle)
          setOnClickPendingIntent(R.id.timer_action_cancel, cancelIntent)
          setOnClickPendingIntent(R.id.timer_action_stop, stopIntent)
        }

        NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(R.drawable.ic_timer_hourglass)
          .setContentTitle(title)
          .setContentText(subtitle)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setUsesChronometer(true)
          .setWhen(startedAtMs)
          .setShowWhen(true)
          .setSilent(true)
          .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
          .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
          .setPriority(NotificationCompat.PRIORITY_DEFAULT)
          .setContentIntent(openIntent)
          .setStyle(NotificationCompat.DecoratedCustomViewStyle())
          .setCustomContentView(collapsed)
          .setCustomBigContentView(expanded)
          .build()
      }

    manager.notify(NOTIFICATION_ID, notification)
  }

  fun dismiss(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }
}
