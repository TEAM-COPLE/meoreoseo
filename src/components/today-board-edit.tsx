import { Eye, EyeOff, GripVertical } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type HostInstance,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
  type PanResponderInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TODAY_SECTION_LABELS, type TodaySectionId } from '@/hooks/use-today-layout';

/** 상자 위치·크기. y 는 "스크롤 맨 위"를 0으로 둔 값이라 스크롤해도 변하지 않는다. */
type Rect = { x: number; y: number; w: number; h: number };

type Callbacks = {
  order: TodaySectionId[];
  onReorder: (next: TodaySectionId[]) => void;
  onDraggingChange: (id: TodaySectionId | null) => void;
  scrollTo: (y: number) => void;
};

type DragState = {
  id: TodaySectionId;
  /** 잡았을 때 상자 위치 */
  start: Rect | null;
  startScroll: number;
  dx: number;
  dy: number;
  /** 손가락(마우스)의 화면 위 세로 위치. 화면 끝에 닿았는지 볼 때 쓴다. */
  pageY: number;
  /** 방금 자리를 바꾼 상자. 끄는 상자가 그 상자 밖으로 나갈 때까지는 다시 바꾸지 않는다(왔다 갔다 방지). */
  guard: TodaySectionId | null;
  /** 순서를 바꾼 뒤 새 자리를 재는 중이면 true */
  measuring: boolean;
  tx: number;
  ty: number;
};

/** 화면 위·아래 끝에서 이 거리 안으로 끌고 가면 자동으로 스크롤한다. */
const EDGE_TOP = 110;
const EDGE_BOTTOM = 130;
const AUTO_SCROLL_STEP = 12;

function contains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function moveItem(order: TodaySectionId[], from: number, to: number) {
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 오늘 화면 상자를 "있는 그대로" 끌어서 옮기는 일을 맡는다.
 * - 상자를 잡고 끌면 상자가 손가락을 따라 움직인다.
 * - 끄는 상자의 가운데가 다른 상자 위에 오면 그 자리로 순서를 바꾼다(바로 저장).
 * - 화면 위·아래 끝으로 끌고 가면 자동으로 스크롤한다.
 * 화면을 다시 그릴 때마다 새로 만들지 않도록 TodayScreen 에서 한 번만 만든다.
 */
export class BoardDragController {
  private values = new Map<TodaySectionId, Animated.ValueXY>();
  private boxes = new Map<TodaySectionId, HostInstance>();
  private rects = new Map<TodaySectionId, Rect>();
  private responders = new Map<TodaySectionId, PanResponderInstance>();
  private callbacks: Callbacks | null = null;
  private scrollY = 0;
  private contentHeight = 0;
  private viewportHeight = 0;
  private drag: DragState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  setCallbacks(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }

  dispose() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.drag = null;
    this.callbacks = null;
  }

  // ── 스크롤 화면에서 받는 정보 ──
  handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    this.scrollY = contentOffset.y;
    this.contentHeight = contentSize.height;
    this.viewportHeight = layoutMeasurement.height;
    if (this.drag) this.update();
  };

  handleContentSize = (_width: number, height: number) => {
    this.contentHeight = height;
  };

  handleLayout = (event: LayoutChangeEvent) => {
    this.viewportHeight = event.nativeEvent.layout.height;
  };

  // ── 상자 등록 ──
  translate(id: TodaySectionId) {
    let value = this.values.get(id);
    if (!value) {
      value = new Animated.ValueXY({ x: 0, y: 0 });
      this.values.set(id, value);
    }
    return value;
  }

  register(id: TodaySectionId, view: HostInstance | null) {
    if (view) this.boxes.set(id, view);
    else this.boxes.delete(id);
  }

  panHandlers(id: TodaySectionId) {
    let responder = this.responders.get(id);
    if (!responder) {
      responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (_, gesture) => this.start(id, gesture),
        onPanResponderMove: (_, gesture) => this.move(gesture),
        onPanResponderRelease: () => this.end(),
        onPanResponderTerminate: () => this.end(),
      });
      this.responders.set(id, responder);
    }
    return responder.panHandlers;
  }

  /** 순서가 바뀐 화면이 그려진 직후에 부른다. 상자들의 새 자리를 다시 잰다. */
  onOrderCommitted() {
    const drag = this.drag;
    if (!drag || !drag.measuring || !drag.start) return;
    this.measureAll(() => {
      if (this.drag !== drag) return;
      drag.measuring = false;
      this.update();
    });
  }

  // ── 끌기 ──
  private start(id: TodaySectionId, gesture: PanResponderGestureState) {
    const drag: DragState = {
      id,
      start: null,
      startScroll: this.scrollY,
      dx: 0,
      dy: 0,
      pageY: gesture.y0,
      guard: null,
      measuring: true,
      tx: 0,
      ty: 0,
    };
    this.drag = drag;
    this.translate(id).setValue({ x: 0, y: 0 });
    this.callbacks?.onDraggingChange(id);
    this.measureAll(() => {
      if (this.drag !== drag) return;
      drag.start = this.rects.get(id) ?? null;
      drag.measuring = false;
      this.update();
    });
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.autoScroll(), 16);
  }

  private move(gesture: PanResponderGestureState) {
    const drag = this.drag;
    if (!drag) return;
    drag.dx = gesture.dx;
    drag.dy = gesture.dy;
    drag.pageY = gesture.moveY;
    this.update();
  }

  private end() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    // 놓으면 상자가 제자리(새 순서의 자리)로 부드럽게 들어간다.
    Animated.spring(this.translate(drag.id), {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      bounciness: 4,
    }).start();
    this.callbacks?.onDraggingChange(null);
  }

  /** 끄는 상자를 손가락 위치에 맞추고, 다른 상자 위에 오면 순서를 바꾼다. */
  private update() {
    const drag = this.drag;
    const callbacks = this.callbacks;
    if (!drag || !drag.start || !callbacks) return;
    const current = this.rects.get(drag.id);
    if (!current) return;

    const visualX = drag.start.x + drag.dx;
    const visualY = drag.start.y + drag.dy + (this.scrollY - drag.startScroll);
    drag.tx = visualX - current.x;
    drag.ty = visualY - current.y;
    this.translate(drag.id).setValue({ x: drag.tx, y: drag.ty });
    if (drag.measuring) return;

    const centerX = visualX + current.w / 2;
    const centerY = visualY + current.h / 2;

    if (drag.guard) {
      const guardRect = this.rects.get(drag.guard);
      if (!guardRect || !contains(guardRect, centerX, centerY)) drag.guard = null;
    }

    for (const otherId of callbacks.order) {
      if (otherId === drag.id || otherId === drag.guard) continue;
      const rect = this.rects.get(otherId);
      if (!rect || !contains(rect, centerX, centerY)) continue;
      const from = callbacks.order.indexOf(drag.id);
      const to = callbacks.order.indexOf(otherId);
      if (from < 0 || to < 0) return;
      drag.guard = otherId;
      drag.measuring = true;
      callbacks.onReorder(moveItem(callbacks.order, from, to));
      return;
    }
  }

  private autoScroll() {
    const drag = this.drag;
    const callbacks = this.callbacks;
    if (!drag || !callbacks || !drag.start) return;
    const windowHeight = Dimensions.get('window').height;
    let delta = 0;
    if (drag.pageY < EDGE_TOP) delta = -AUTO_SCROLL_STEP;
    else if (drag.pageY > windowHeight - EDGE_BOTTOM) delta = AUTO_SCROLL_STEP;
    if (delta === 0) return;
    const maxY = Math.max(0, this.contentHeight - this.viewportHeight);
    const next = Math.max(0, Math.min(maxY, this.scrollY + delta));
    if (next === this.scrollY) return;
    this.scrollY = next;
    callbacks.scrollTo(next);
    this.update();
  }

  /** 등록된 상자들의 위치를 모두 잰다. 끄는 중인 상자는 옮겨 놓은 만큼을 빼서 "원래 자리"를 기록한다. */
  private measureAll(done: () => void) {
    const entries = [...this.boxes.entries()];
    let left = entries.length;
    if (left === 0) {
      done();
      return;
    }
    for (const [id, view] of entries) {
      view.measureInWindow((x, y, w, h) => {
        const drag = this.drag;
        const tx = drag?.id === id ? drag.tx : 0;
        const ty = drag?.id === id ? drag.ty : 0;
        this.rects.set(id, { x: x - tx, y: y - ty + this.scrollY, w, h });
        left -= 1;
        if (left === 0) done();
      });
    }
  }
}

/**
 * 편집 중인 상자 하나. 원래 상자를 그대로 보여 주고, 그 위에 테두리와
 * "옮기기" 손잡이·"숨기기" 버튼을 얹는다. 상자 안 버튼은 편집 중에는 눌리지 않는다.
 */
export function EditableBox({
  id,
  controller,
  isHidden,
  isDragging,
  onToggleHidden,
  onMove,
  style,
  children,
}: {
  id: TodaySectionId;
  controller: BoardDragController;
  isHidden: boolean;
  isDragging: boolean;
  onToggleHidden: () => void;
  onMove: (direction: -1 | 1) => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useTheme();
  const ref = useRef<HostInstance>(null);
  const label = TODAY_SECTION_LABELS[id];

  useEffect(() => {
    controller.register(id, ref.current);
    return () => controller.register(id, null);
  }, [controller, id]);

  function handleAccessibilityAction(event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName === 'moveUp') onMove(-1);
    if (event.nativeEvent.actionName === 'moveDown') onMove(1);
  }

  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      style={[
        style,
        {
          zIndex: isDragging ? 10 : 1,
          transform: controller.translate(id).getTranslateTransform(),
        },
        isDragging && styles.dragging,
      ]}>
      <View style={[styles.content, { opacity: isHidden ? 0.35 : 1 }]}>{children}</View>
      <View
        style={[
          styles.frame,
          { borderColor: theme.tint, borderStyle: isDragging ? 'solid' : 'dashed' },
        ]}
      />
      <View style={styles.controls}>
        <View
          {...controller.panHandlers(id)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label} 상자 옮기기`}
          accessibilityHint="끌어서 위치를 바꿀 수 있습니다"
          accessibilityActions={[
            { name: 'moveUp', label: '앞으로 옮기기' },
            { name: 'moveDown', label: '뒤로 옮기기' },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
          style={[styles.handle, { backgroundColor: theme.tint }]}>
          <GripVertical size={14} color={theme.onTint} strokeWidth={2.2} />
          <ThemedText type="smallBold" selectable={false} style={{ color: theme.onTint }}>
            옮기기
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${isHidden ? '보이기' : '숨기기'}`}
          hitSlop={6}
          onPress={onToggleHidden}
          style={({ pressed }) => [
            styles.pill,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          {isHidden ? (
            <Eye size={14} color={theme.tint} strokeWidth={1.9} />
          ) : (
            <EyeOff size={14} color={theme.textSecondary} strokeWidth={1.9} />
          )}
          <ThemedText type="smallBold" selectable={false} themeColor={isHidden ? 'tint' : 'text'}>
            {isHidden ? '보이기' : '숨기기'}
          </ThemedText>
        </Pressable>
      </View>
      {isHidden ? (
        <View style={styles.hiddenBadge}>
          <ThemedText type="smallBold" themeColor="textSecondary" selectable={false}>
            숨긴 상자 · 오늘 화면에 안 보여요
          </ThemedText>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    pointerEvents: 'none',
  },
  frame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderRadius: Radius.large,
    pointerEvents: 'none',
  },
  dragging: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  controls: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  handle: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  pill: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  hiddenBadge: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.two,
    pointerEvents: 'none',
  },
});
