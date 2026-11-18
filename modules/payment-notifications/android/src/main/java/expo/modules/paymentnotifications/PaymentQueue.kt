package expo.modules.paymentnotifications

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 아직 가계부에 기록하지 않은 결제 알림을 휴대폰 안(SharedPreferences)에 모아 두는 대기열.
 * 인터넷으로 보내지 않고, 앱이 꺼내 간 뒤에는 지운다.
 */
object PaymentQueue {
  private const val PREFS = "meoreoseo_payment_notifications"
  private const val KEY = "queue"
  private const val MAX_ITEMS = 300

  data class Item(
    val id: String,
    val packageName: String,
    val title: String,
    val text: String,
    val postTime: Long,
  )

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun add(context: Context, item: Item) {
    val items = read(context)
    // 같은 알림이 고쳐져서 다시 올라오면 한 번만 둔다.
    if (items.any { it.id == item.id }) return
    items.add(item)
    // 너무 많이 쌓이면 오래된 것부터 버린다.
    while (items.size > MAX_ITEMS) items.removeAt(0)
    write(context, items)
  }

  @Synchronized
  fun list(context: Context): List<Item> = read(context)

  @Synchronized
  fun remove(context: Context, ids: Collection<String>) {
    val idSet = ids.toSet()
    write(context, read(context).filterNot { idSet.contains(it.id) })
  }

  private fun read(context: Context): MutableList<Item> {
    val raw = prefs(context).getString(KEY, null) ?: return mutableListOf()
    return try {
      val array = JSONArray(raw)
      MutableList(array.length()) { index ->
        val obj = array.getJSONObject(index)
        Item(
          id = obj.getString("id"),
          packageName = obj.getString("packageName"),
          title = obj.optString("title", ""),
          text = obj.optString("text", ""),
          postTime = obj.getLong("postTime"),
        )
      }
    } catch (e: Exception) {
      mutableListOf()
    }
  }

  private fun write(context: Context, items: List<Item>) {
    val array = JSONArray()
    for (item in items) {
      array.put(
        JSONObject()
          .put("id", item.id)
          .put("packageName", item.packageName)
          .put("title", item.title)
          .put("text", item.text)
          .put("postTime", item.postTime),
      )
    }
    prefs(context).edit().putString(KEY, array.toString()).apply()
  }
}
