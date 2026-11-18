import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type PanResponderInstance,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_TODAY_ORDER,
  TODAY_SECTION_LABELS,
  type TodaySectionId,
} from '@/hooks/use-today-layout';

/** 상자 하나의 높이와 상자 사이 간격. 끌 때 "몇 칸 움직였는지"를 이 값으로 계산한다. */
const TILE_HEIGHT = 64;
const TILE_GAP = Spacing.two;
const SLOT = TILE_HEIGHT + TILE_GAP;

/** 상자 아래에 작게 적는 설명 */
const SECTION_HINTS: Record<TodaySectionId, string> = {
  weather: '지금 날씨와 오늘 기온',
  todos: '오늘 할 일과 밀린 할 일',
  events: '오늘 일정',
  habits: '오늘 체크할 습관',
  money: '이번 달 수입·지출과 예산',
};

type Props = {
  order: TodaySectionId[];
  hidden: TodaySectionId[];
  onReorder: (next: TodaySectionId[]) => void;
  onMove: (id: TodaySectionId, direction: -1 | 1) => void;
  onToggleHidden: (id: TodaySectionId) => void;
  onReset: () => void;
  /** 끌기 시작/끝날 때 알려준다. 끄는 동안 화면 스크롤을 멈추는 데 쓴다. */
  onDraggingChange: (dragging: boolean) => void;
};

/** 놓은 자리로 옮긴 새 순서 */
function moveItem(order: TodaySectionId[], from: number, to: number) {
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 오늘 화면 "편집" 모드. 상자를 손가락(웹은 마우스)으로 잡고 위아래로 끌어 순서를 바꾸고,
 * 오른쪽 버튼으로 상자를 숨기거나 다시 보이게 한다. 바뀐 내용은 바로 저장된다.
 */
export function TodayLayoutEditor({
  order,
  hidden,
  onReorder,
  onMove,
  onToggleHidden,
  onReset,
  onDraggingChange,
}: Props) {
  const theme = useTheme();
  const [draggingId, setDraggingId] = useState<TodaySectionId | null>(null);

  // 상자마다 "원래 자리에서 위아래로 얼마나 밀려 있는지" 값. 상자 종류는 정해져 있으므로 처음에 한 번 만든다.
  const [offsets] = useState(
    () =>
      Object.fromEntries(DEFAULT_TODAY_ORDER.map((id) => [id, new Animated.Value(0)])) as Record<
        TodaySectionId,
        Animated.Value
      >,
  );

  // 끌기 처리기(PanResponder)는 한 번만 만들고, 그 안에서는 아래 ref 로 항상 최신 값을 읽는다.
  const latest = useRef({ order, onReorder, onDraggingChange });
  useEffect(() => {
    latest.current = { order, onReorder, onDraggingChange };
  });

  // 놓은 뒤 새 순서가 화면에 그려지기 직전에, 끈 상자가 "놓은 자리"에서 부드럽게 제자리로 들어가게 한다.
  const pendingDrop = useRef<{ id: TodaySectionId; offset: number } | null>(null);
  useLayoutEffect(() => {
    const drop = pendingDrop.current;
    if (!drop) return;
    pendingDrop.current = null;
    for (const id of DEFAULT_TODAY_ORDER) {
      offsets[id].stopAnimation();
      offsets[id].setValue(id === drop.id ? drop.offset : 0);
    }
    Animated.spring(offsets[drop.id], {
      toValue: 0,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  }, [order, offsets]);

  // ref 는 끌기 이벤트가 일어날 때만 읽고, 화면을 그리는 동안에는 읽지 않는다(검사기의 오탐이라 끈다).
  // eslint-disable-next-line react-hooks/refs
  const [responders] = useState(() => {
    const entries = DEFAULT_TODAY_ORDER.map((id): [TodaySectionId, PanResponderInstance] => {
      let startIndex = 0;
      let targetIndex = 0;

      /** 끄는 상자가 target 칸에 있을 때, 나머지 상자들을 한 칸씩 비켜 준다. */
      function shiftOthers(target: number) {
        const current = latest.current.order;
        current.forEach((otherId, k) => {
          if (otherId === id) return;
          let shift = 0;
          if (startIndex < target && k > startIndex && k <= target) shift = -SLOT;
          else if (startIndex > target && k >= target && k < startIndex) shift = SLOT;
          Animated.timing(offsets[otherId], {
            toValue: shift,
            duration: 150,
            useNativeDriver: false,
          }).start();
        });
      }

      function targetFor(dy: number) {
        const last = latest.current.order.length - 1;
        return Math.max(0, Math.min(last, startIndex + Math.round(dy / SLOT)));
      }

      function finish(dy: number) {
        const target = targetFor(dy);
        setDraggingId(null);
        latest.current.onDraggingChange(false);
        if (target === startIndex) {
          Animated.spring(offsets[id], { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
          return;
        }
        pendingDrop.current = { id, offset: dy - (target - startIndex) * SLOT };
        latest.current.onReorder(moveItem(latest.current.order, startIndex, target));
      }

      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          startIndex = latest.current.order.indexOf(id);
          targetIndex = startIndex;
          offsets[id].stopAnimation();
          offsets[id].setValue(0);
          setDraggingId(id);
          latest.current.onDraggingChange(true);
        },
        onPanResponderMove: (_, gesture) => {
          offsets[id].setValue(gesture.dy);
          const target = targetFor(gesture.dy);
          if (target !== targetIndex) {
            targetIndex = target;
            shiftOthers(target);
          }
        },
        onPanResponderRelease: (_, gesture) => finish(gesture.dy),
        onPanResponderTerminate: (_, gesture) => finish(gesture.dy),
      });
      return [id, responder];
    });
    return Object.fromEntries(entries) as Record<TodaySectionId, PanResponderInstance>;
  });

  function handleAccessibilityAction(id: TodaySectionId, event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName === 'moveUp') onMove(id, -1);
    if (event.nativeEvent.actionName === 'moveDown') onMove(id, 1);
    if (event.nativeEvent.actionName === 'toggleHidden') onToggleHidden(id);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.hint, { backgroundColor: theme.tintSoft }]}>
        <ThemedText type="small" themeColor="tint" selectable={false}>
          상자를 잡고 위아래로 끌면 순서가 바뀌어요. 오른쪽 버튼으로 숨기거나 다시 켤 수 있어요.
        </ThemedText>
      </View>

      <View style={[styles.list, { height: order.length * SLOT - TILE_GAP }]}>
        {order.map((id) => {
          const isHidden = hidden.includes(id);
          const isDragging = draggingId === id;
          return (
            <Animated.View
              key={id}
              {...responders[id].panHandlers}
              accessible
              accessibilityLabel={`${TODAY_SECTION_LABELS[id]} 상자${isHidden ? ', 숨김' : ''}`}
              accessibilityHint="위로 또는 아래로 옮길 수 있습니다"
              accessibilityActions={[
                { name: 'moveUp', label: '위로 옮기기' },
                { name: 'moveDown', label: '아래로 옮기기' },
                { name: 'toggleHidden', label: isHidden ? '보이기' : '숨기기' },
              ]}
              onAccessibilityAction={(event) => handleAccessibilityAction(id, event)}
              style={[
                styles.tile,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: isDragging ? theme.tint : theme.border,
                  zIndex: isDragging ? 10 : 0,
                  transform: [{ translateY: offsets[id] }, { scale: isDragging ? 1.03 : 1 }],
                },
                isDragging && styles.tileDragging,
              ]}>
              <ThemedText
                type="default"
                themeColor="textSecondary"
                selectable={false}
                style={styles.handle}>
                ≡
              </ThemedText>
              <View style={[styles.tileText, { opacity: isHidden ? 0.45 : 1 }]}>
                <ThemedText type="default" selectable={false} style={styles.tileTitle}>
                  {TODAY_SECTION_LABELS[id]}
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                  selectable={false}>
                  {isHidden ? '숨겨져 있어요' : SECTION_HINTS[id]}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${TODAY_SECTION_LABELS[id]} ${isHidden ? '보이기' : '숨기기'}`}
                hitSlop={8}
                onPress={() => onToggleHidden(id)}
                style={({ pressed }) => [
                  styles.visPill,
                  {
                    backgroundColor: isHidden ? theme.backgroundSelected : theme.tintSoft,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  selectable={false}
                  style={{ color: isHidden ? theme.textSecondary : theme.tint }}>
                  {isHidden ? '숨김' : '표시'}
                </ThemedText>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button label="기본값으로 되돌리기" variant="secondary" size="small" onPress={onReset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  hint: {
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  list: {
    gap: TILE_GAP,
  },
  tile: {
    height: TILE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  tileDragging: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  handle: {
    fontSize: 22,
    lineHeight: 26,
  },
  tileText: {
    flex: 1,
    gap: 2,
  },
  tileTitle: {
    fontWeight: 700,
  },
  visPill: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  footer: {
    alignItems: 'flex-start',
  },
});
