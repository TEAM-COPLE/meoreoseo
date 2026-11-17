const fs = require('fs');
const path = require('path');

function patchWidgetBundleIndex(projectRoot) {
  const targetPath = path.join(
    projectRoot,
    'node_modules',
    'expo-widgets',
    'bundle',
    'index.ts',
  );

  if (!fs.existsSync(targetPath)) {
    return;
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  if (content.includes('key: key ?? node.key ?? null')) {
    return;
  }

  const updated = content.replace(
    `    return {
      ...node,
      props,
      __expoWidgetIdentity: JSON.stringify([node.type, key ?? node.key ?? position]),
    };`,
    `    return {
      ...node,
      key: key ?? node.key ?? null,
      props,
      __expoWidgetIdentity: JSON.stringify([node.type, key ?? node.key ?? position]),
    };`,
  );

  fs.writeFileSync(targetPath, updated, 'utf8');
}

function patchWidgetBundleDecorator(projectRoot) {
  const targetPath = path.join(
    projectRoot,
    'node_modules',
    'expo-widgets',
    'bundle',
    'decorator.ts',
  );

  if (!fs.existsSync(targetPath)) {
    return;
  }

  const patchedContent = `import { ReactElementNode } from './jsx-runtime-stub';

const interactiveTargetTypes = [
  'Button',
  'FilledTonalButton',
  'OutlinedButton',
  'ElevatedButton',
  'TextButton',
];

export function decorateInteractiveTargets(node: unknown) {
  return decorateNode(node, {
    nearestParentKey: null,
    nextTargetIndex: {
      current: 0,
    },
    typesToDecorate: interactiveTargetTypes,
  });
}

function extractNodeKey(node: ReactElementNode): string | null {
  if (typeof node.key === 'string' && node.key.length > 0) {
    return node.key;
  }
  if (typeof node.__expoWidgetIdentity === 'string') {
    try {
      const parsed = JSON.parse(node.__expoWidgetIdentity);
      if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
        return parsed[1];
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function decorateNode(
  node: unknown,
  context: {
    nearestParentKey: string | null;
    nextTargetIndex: {
      current: number;
    };
    typesToDecorate: string[];
  }
): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => decorateNode(child, context));
  }

  if (isSectionMap(node)) {
    return Object.fromEntries(
      Object.entries(node).map(([section, child]) => [
        section,
        decorateNode(child, { ...context, nearestParentKey: section }),
      ])
    );
  }

  if (!isReactElementNode(node)) {
    return node;
  }

  const props = node.props ?? {};
  const currentKey = extractNodeKey(node) ?? context.nearestParentKey;

  if (props.target == null && context.typesToDecorate.includes(node.type as string)) {
    props.target = buildButtonTargetId(context.nextTargetIndex.current, currentKey);
    context.nextTargetIndex.current += 1;
  }

  if ('children' in props) {
    props.children = decorateNode(props.children, {
      nearestParentKey: currentKey,
      nextTargetIndex: context.nextTargetIndex,
      typesToDecorate: context.typesToDecorate,
    });
  }

  return node;
}

function isReactElementNode(node: unknown): node is ReactElementNode {
  return Boolean(node) && typeof node === 'object' && 'type' in node && 'props' in node;
}

function isSectionMap(node: unknown): node is Record<string, unknown> {
  return Boolean(node) && typeof node === 'object' && !isReactElementNode(node);
}

function buildButtonTargetId(index: number, parentKey: string | null) {
  const baseTarget = \`__expo_widgets_target_\${index}\`;

  if (!parentKey) {
    return baseTarget;
  }

  return \`\${baseTarget}_\${parentKey}\`;
}
`;

  fs.writeFileSync(targetPath, patchedContent, 'utf8');
}

function patchWidgetInteractionAction(projectRoot) {
  const targetPath = path.join(
    projectRoot,
    'node_modules',
    'expo-widgets',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'widgets',
    'WidgetInteractionAction.kt',
  );

  if (!fs.existsSync(targetPath)) {
    return;
  }

  const patchedContent = `package expo.modules.widgets

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.glance.action.Action
import androidx.glance.appwidget.action.actionSendBroadcast
import androidx.glance.appwidget.action.actionStartActivity
import expo.modules.widgets.notifications.ExpoWidgetsNotificationReceiver

internal const val WIDGET_INTERACTION_ACTION = "expo.modules.widgets.ACTION_WIDGET_INTERACTION"
internal const val NOTIFICATION_INTERACTION_ACTION = "expo.modules.widgets.ACTION_NOTIFICATION_INTERACTION"
internal const val WIDGET_INTERACTION_SOURCE_EXTRA = "expo.modules.widgets.extra.SOURCE"
internal const val WIDGET_INTERACTION_TARGET_EXTRA = "expo.modules.widgets.extra.TARGET"
internal const val WIDGET_INTERACTION_NOTIFICATION_ID_EXTRA = "expo.modules.widgets.extra.NOTIFICATION_ID"
private const val OPEN_ACTION_MARKER = "_action:open:"

internal sealed interface InteractionSource {
  val name: String

  data class Widget(override val name: String) : InteractionSource

  data class Notification(override val name: String, val notificationId: String) : InteractionSource
}

internal data class WidgetInteraction(
  val source: InteractionSource,
  val target: String
)

private fun buildWidgetOpenDeepLinkUri(openAction: String): Uri {
  val deepLink = when {
    openAction == "todos" || openAction == "todos:add" ->
      "meoreoseo://todos?add=1&from=widget"
    openAction == "todos:list" ->
      "meoreoseo://todos?from=widget"
    openAction.startsWith("todo:") ->
      "meoreoseo://todos?editId=\${Uri.encode(openAction.removePrefix("todo:"))}&from=widget"
    openAction == "calendar" || openAction == "calendar:add" ->
      "meoreoseo://calendar?add=1&from=widget"
    openAction == "calendar:list" ->
      "meoreoseo://calendar?from=widget"
    openAction.startsWith("event:") ->
      "meoreoseo://calendar?editId=\${Uri.encode(openAction.removePrefix("event:"))}&from=widget"
    openAction == "habits" || openAction == "habits:add" ->
      "meoreoseo://habits?add=1&from=widget"
    openAction == "habits:list" ->
      "meoreoseo://habits?from=widget"
    openAction.startsWith("habit:") ->
      "meoreoseo://habits?editId=\${Uri.encode(openAction.removePrefix("habit:"))}&from=widget"
    openAction == "notes" || openAction == "notes:list" ->
      "meoreoseo://notes?from=widget"
    openAction == "note:new" ->
      "meoreoseo://note/new?from=widget"
    openAction.startsWith("note:") ->
      "meoreoseo://note/\${Uri.encode(openAction.removePrefix("note:"))}?from=widget"
    openAction == "money" || openAction == "money:add" ->
      "meoreoseo://money?add=1&from=widget"
    openAction == "money:list" ->
      "meoreoseo://money?from=widget"
    openAction.startsWith("tx:") ->
      "meoreoseo://money?editId=\${Uri.encode(openAction.removePrefix("tx:"))}&from=widget"
    else ->
      "meoreoseo://?from=widget"
  }
  return Uri.parse(deepLink)
}

internal fun WidgetInteraction.toGlanceAction(context: Context): Action {
  if (source is InteractionSource.Widget) {
    val openIndex = target.indexOf(OPEN_ACTION_MARKER)
    if (openIndex >= 0) {
      val openAction = target.substring(openIndex + OPEN_ACTION_MARKER.length)
      val mainComponent = context.packageManager
        .getLaunchIntentForPackage(context.packageName)
        ?.component
        ?: ComponentName(context.packageName, "\${context.packageName}.MainActivity")
      val launchIntent = Intent(Intent.ACTION_VIEW, buildWidgetOpenDeepLinkUri(openAction)).apply {
        component = mainComponent
        setPackage(context.packageName)
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
      }
      return actionStartActivity(launchIntent)
    }
  }

  val intent = when (source) {
    is InteractionSource.Widget -> Intent(WIDGET_INTERACTION_ACTION)
      .setComponent(widgetProviderComponentName(context, source.name))
      .setData(
        Uri.Builder()
          .scheme("expo-widgets")
          .authority("widget")
          .appendPath(source.name)
          .appendPath(target)
          .build()
      )

    is InteractionSource.Notification -> Intent(NOTIFICATION_INTERACTION_ACTION)
      .setClass(context, ExpoWidgetsNotificationReceiver::class.java)
      // Extras do not participate in PendingIntent identity. Glance's default URI uses the
      // same appWidgetId for every notification, so provide our own stable button identity.
      .setData(
        Uri.Builder()
          .scheme("expo-widgets")
          .authority("notification")
          .appendPath(source.name)
          .appendPath(source.notificationId)
          .appendPath(target)
          .build()
      )
      .putExtra(WIDGET_INTERACTION_NOTIFICATION_ID_EXTRA, source.notificationId)
  }
  intent
    .putExtra(WIDGET_INTERACTION_SOURCE_EXTRA, source.name)
    .putExtra(WIDGET_INTERACTION_TARGET_EXTRA, target)
  return actionSendBroadcast(intent)
}

internal object WidgetsInteraction {
  fun handle(context: Context, source: String, target: String) {
    val layout = WidgetsLayoutRegistry.layout(context, source) ?: return
    val props = WidgetsLayoutRegistry.props(context, source)
    val environment = getWidgetEnvironment(context) + ("target" to target)
    val updatedProps = evaluateWidgetButtonPress(context, layout, props, environment)

    if (updatedProps != null) {
      WidgetsStorage.set(context, "__expo_widgets_\${source}_props", props.orEmpty() + updatedProps)
    }

    WidgetsEvents.sendUserInteraction(source, target)
    WidgetsUpdater.reload(context, source)
  }
}
`;

  fs.writeFileSync(targetPath, patchedContent, 'utf8');
}

function patchWidgetsEvents(projectRoot) {
  const targetPath = path.join(
    projectRoot,
    'node_modules',
    'expo-widgets',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'widgets',
    'WidgetsEvents.kt',
  );

  if (!fs.existsSync(targetPath)) {
    return;
  }

  const patchedContent = `package expo.modules.widgets

internal const val ON_USER_INTERACTION = "onExpoWidgetsUserInteraction"

private const val EVENT_TYPE_USER_INTERACTION = "ExpoWidgetsUserInteraction"

internal object WidgetsEvents {
  private var userInteractionObserver: ((Map<String, Any?>) -> Unit)? = null
  private val pendingEvents = mutableListOf<Map<String, Any?>>()

  @Synchronized
  fun startObservingUserInteractions(observer: (Map<String, Any?>) -> Unit) {
    userInteractionObserver = observer
    val iterator = pendingEvents.iterator()
    while (iterator.hasNext()) {
      observer.invoke(iterator.next())
      iterator.remove()
    }
  }

  @Synchronized
  fun stopObservingUserInteractions() {
    userInteractionObserver = null
  }

  @Synchronized
  fun sendUserInteraction(source: String, target: String, notificationId: String? = null) {
    val event = userInteractionEvent(source, target, notificationId)
    val observer = userInteractionObserver
    if (observer != null) {
      observer.invoke(event)
    } else {
      if (pendingEvents.size >= 50) {
        pendingEvents.removeAt(0)
      }
      pendingEvents.add(event)
    }
  }

  private fun userInteractionEvent(source: String, target: String, notificationId: String?): Map<String, Any?> {
    val event = mutableMapOf<String, Any?>(
      "source" to source,
      "target" to target,
      "timestamp" to System.currentTimeMillis(),
      "type" to EVENT_TYPE_USER_INTERACTION
    )
    if (notificationId != null) {
      event["notificationId"] = notificationId
    }
    return event
  }
}
`;

  fs.writeFileSync(targetPath, patchedContent, 'utf8');
}

function patchExpoWidgets(projectRoot = process.cwd()) {
  patchWidgetBundleIndex(projectRoot);
  patchWidgetBundleDecorator(projectRoot);
  patchWidgetInteractionAction(projectRoot);
  patchWidgetsEvents(projectRoot);
}

if (require.main === module) {
  patchExpoWidgets();
}

module.exports = { patchExpoWidgets };
