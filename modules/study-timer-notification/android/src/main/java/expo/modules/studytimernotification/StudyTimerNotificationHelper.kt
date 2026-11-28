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
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal object StudyTimerNotificationHelper {
  const val CHANNEL_ID = "study-timer-live"
  const val NOTIFICATION_ID = 41021

  const val ACTION_SAVE = "expo.modules.studytimernotification.ACTION_SAVE"
  const val ACTION_PAUSE = "expo.modules.studytimernotification.ACTION_PAUSE"
  const val ACTION_RESUME = "expo.modules.studytimernotification.ACTION_RESUME"
  const val ACTION_CANCEL = "expo.modules.studytimernotification.ACTION_CANCEL"

  private const val DEFAULT_BADGE_COLOR = "#5B5CE6"
  private const val PREFS_NAME = "study_timer_notification_prefs"
  private const val KEY_PENDING_ACTIONS = "pending_actions"
  private const val KEY_STATE_STARTED_AT = "state_started_at"
  private const val KEY_STATE_PAUSED_AT = "state_paused_at"
  private const val KEY_STATE_SUBJECT = "state_subject"
  private const val KEY_STATE_COLOR = "state_color"

  private val lock = Any()

  fun appendPendingAction(context: Context, action: String, atMs: Long) {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val arr = runCatching {
        JSONArray(prefs.getString(KEY_PENDING_ACTIONS, "[]") ?: "[]")
      }.getOrElse { JSONArray() }
      arr.put(JSONObject().put("action", action).put("atMs", atMs))
      prefs.edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply()
    }
  }

  fun consumePendingActions(context: Context): List<Pair<String, Long>> {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_PENDING_ACTIONS, null) ?: return emptyList()
      prefs.edit().remove(KEY_PENDING_ACTIONS).apply()
      val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
      val list = mutableListOf<Pair<String, Long>>()
      for (i in 0 until arr.length()) {
        val obj = arr.optJSONObject(i) ?: continue
        val action = obj.optString("action", "")
        val atMs = obj.optLong("atMs", 0L)
        if (action.isNotEmpty()) list.add(action to atMs)
      }
      return list
    }
  }

  private fun saveState(
    context: Context,
    startedAtMs: Long,
    pausedAtMs: Long?,
    subjectName: String?,
    accentColor: String?,
  ) {
    synchronized(lock) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putLong(KEY_STATE_STARTED_AT, startedAtMs)
        .putLong(KEY_STATE_PAUSED_AT, pausedAtMs ?: -1L)
        .putString(KEY_STATE_SUBJECT, subjectName)
        .putString(KEY_STATE_COLOR, accentColor)
        .apply()
    }
  }

  private fun clearState(context: Context) {
    synchronized(lock) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_STATE_STARTED_AT)
        .remove(KEY_STATE_PAUSED_AT)
        .remove(KEY_STATE_SUBJECT)
        .remove(KEY_STATE_COLOR)
        .apply()
    }
  }

  /** 백그라운드에서 일시정지 버튼을 눌렀을 때 즉시 알림을 일시정지 상태로 갱신한다. */
  fun handleNativePause(context: Context, nowMs: Long) {
    val (startedAt, pausedAt, subject, color) = synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val s = prefs.getLong(KEY_STATE_STARTED_AT, -1L)
      val p = prefs.getLong(KEY_STATE_PAUSED_AT, -1L)
      Quad(s, p, prefs.getString(KEY_STATE_SUBJECT, null), prefs.getString(KEY_STATE_COLOR, null))
    }
    if (startedAt <= 0L || pausedAt > 0L) return
    show(context, startedAt, nowMs, subject, color)
  }

  /** 백그라운드에서 재개 버튼을 눌렀을 때 즉시 알림을 실행 상태로 갱신한다. */
  fun handleNativeResume(context: Context, nowMs: Long) {
    val (startedAt, pausedAt, subject, color) = synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val s = prefs.getLong(KEY_STATE_STARTED_AT, -1L)
      val p = prefs.getLong(KEY_STATE_PAUSED_AT, -1L)
      Quad(s, p, prefs.getString(KEY_STATE_SUBJECT, null), prefs.getString(KEY_STATE_COLOR, null))
    }
    if (startedAt <= 0L || pausedAt <= 0L) return
    val pausedDuration = (nowMs - pausedAt).coerceAtLeast(0L)
    show(context, startedAt + pausedDuration, null, subject, color)
  }

  private data class Quad(val a: Long, val b: Long, val c: String?, val d: String?)

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
    pausedAtMs: Long?,
    subjectName: String?,
    accentColor: String?,
  ) {
    ensureChannel(context)
    saveState(context, startedAtMs, pausedAtMs, subjectName, accentColor)
    if (!hasPostPermission(context)) return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val isPaused = pausedAtMs != null && pausedAtMs > 0L
    val cleanSubject = subjectName?.trim()?.takeIf { it.isNotEmpty() }
    val startTimeText = formatStartTime(startedAtMs)
    val title = if (cleanSubject != null) "$cleanSubject 공부 중" else "공부 타이머"
    val subtitle = when {
      isPaused && cleanSubject != null -> "$cleanSubject · 일시정지됨"
      isPaused -> "일시정지됨"
      cleanSubject != null -> "$cleanSubject · $startTimeText 시작"
      else -> "공부 중 · $startTimeText 시작"
    }

    val openIntent = openStudyIntent(context)
    val saveIntent = actionIntent(context, ACTION_SAVE, 102)
    val pauseOrResumeIntent = if (isPaused) {
      actionIntent(context, ACTION_RESUME, 103)
    } else {
      actionIntent(context, ACTION_PAUSE, 104)
    }
    val cancelIntent = actionIntent(context, ACTION_CANCEL, 101)
    val pauseOrResumeLabel = if (isPaused) "재개" else "일시정지"

    val referenceMs = if (isPaused) pausedAtMs!! else System.currentTimeMillis()
    val elapsedMs = (referenceMs - startedAtMs).coerceAtLeast(0L)
    val chronometerBase = SystemClock.elapsedRealtime() - elapsedMs
    val badgeColor = parseColor(accentColor)

    val collapsed = RemoteViews(
      context.packageName,
      R.layout.notification_study_timer_collapsed,
    ).apply {
      setInt(R.id.timer_subject_dot, "setColorFilter", badgeColor)
      setChronometer(R.id.timer_chronometer, chronometerBase, null, !isPaused)
      setTextViewText(R.id.timer_subtitle, subtitle)
      setTextViewText(R.id.timer_action_pause_resume, pauseOrResumeLabel)
      setOnClickPendingIntent(R.id.timer_action_pause_resume, pauseOrResumeIntent)
    }

    val expanded = RemoteViews(
      context.packageName,
      R.layout.notification_study_timer_expanded,
    ).apply {
      setInt(R.id.timer_subject_dot, "setColorFilter", badgeColor)
      setChronometer(R.id.timer_chronometer, chronometerBase, null, !isPaused)
      setTextViewText(R.id.timer_subtitle, subtitle)
      setTextViewText(R.id.timer_action_pause_resume, pauseOrResumeLabel)
      setOnClickPendingIntent(R.id.timer_action_save, saveIntent)
      setOnClickPendingIntent(R.id.timer_action_pause_resume, pauseOrResumeIntent)
      setOnClickPendingIntent(R.id.timer_action_cancel, cancelIntent)
    }

    val notification: Notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_timer_hourglass)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setContentIntent(openIntent)
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .build()

    manager.notify(NOTIFICATION_ID, notification)
  }

  fun dismiss(context: Context) {
    clearState(context)
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }
}
