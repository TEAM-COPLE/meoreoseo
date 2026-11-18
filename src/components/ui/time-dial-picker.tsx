import { useEffect, useRef, type ComponentRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PADDING_VERTICAL = ITEM_HEIGHT * 2;

type Period = 'am' | 'pm';

type WheelItem<T> = {
  value: T;
  label: string;
};

const PERIOD_ITEMS: readonly WheelItem<Period>[] = [
  { value: 'am', label: '오전' },
  { value: 'pm', label: '오후' },
];

const HOUR_ITEMS: readonly WheelItem<number>[] = Array.from({ length: 12 }, (_, i) => {
  const h = i + 1;
  return { value: h, label: String(h) };
});

const MINUTE_ITEMS: readonly WheelItem<number>[] = Array.from({ length: 60 }, (_, m) => ({
  value: m,
  label: String(m).padStart(2, '0'),
}));

function splitHour24(hour24: number): { period: Period; hour12: number } {
  const period: Period = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return { period, hour12 };
}

function toHour24(period: Period, hour12: number): number {
  if (period === 'am') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type TimeDialPickerProps = {
  /** 0 ~ 23 */
  hour: number;
  /** 0 ~ 59 */
  minute: number;
  onChange: (hour: number, minute: number) => void;
};

/**
 * 다이얼(휠)을 위아래로 굴려 오전/오후 · 시 · 분(1분 단위)을 고르는 시간 선택기.
 */
export function TimeDialPicker({ hour, minute, onChange }: TimeDialPickerProps) {
  const theme = useTheme();
  const { period, hour12 } = splitHour24(hour);

  function handlePeriodChange(nextPeriod: Period) {
    onChange(toHour24(nextPeriod, hour12), minute);
  }

  function handleHour12Change(nextHour12: number) {
    onChange(toHour24(period, nextHour12), minute);
  }

  function handleMinuteChange(nextMinute: number) {
    onChange(hour, nextMinute);
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}>
      {/* 가운데 선택 영역 강조 밴드 */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            backgroundColor: theme.tintSoft,
            borderColor: theme.border,
          },
        ]}
      />

      <WheelColumn
        items={PERIOD_ITEMS}
        value={period}
        onChange={handlePeriodChange}
        accessibilityLabel="오전 오후 선택"
        style={styles.periodColumn}
      />

      <WheelColumn
        items={HOUR_ITEMS}
        value={hour12}
        onChange={handleHour12Change}
        accessibilityLabel="시 선택"
        style={styles.numberColumn}
      />

      <View pointerEvents="none" style={styles.colonWrap}>
        <ThemedText type="default" style={styles.colon}>
          :
        </ThemedText>
      </View>

      <WheelColumn
        items={MINUTE_ITEMS}
        value={minute}
        onChange={handleMinuteChange}
        accessibilityLabel="분 선택"
        style={styles.numberColumn}
      />
    </View>
  );
}

function WheelColumn<T extends string | number>({
  items,
  value,
  onChange,
  accessibilityLabel,
  style,
}: {
  items: readonly WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );
  const scrolledIndexRef = useRef(selectedIndex);
  const didMountRef = useRef(false);
  const webSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!didMountRef.current) return;
    if (scrolledIndexRef.current !== selectedIndex) {
      scrolledIndexRef.current = selectedIndex;
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: true,
      });
    }
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (webSnapTimerRef.current) clearTimeout(webSnapTimerRef.current);
    };
  }, []);

  function handleLayout() {
    if (didMountRef.current) return;
    didMountRef.current = true;
    scrolledIndexRef.current = selectedIndex;
    scrollRef.current?.scrollTo({
      y: selectedIndex * ITEM_HEIGHT,
      animated: false,
    });
  }

  function commitOffset(offsetY: number) {
    const idx = clamp(Math.round(offsetY / ITEM_HEIGHT), 0, items.length - 1);
    scrolledIndexRef.current = idx;
    const nextItem = items[idx];
    if (nextItem && nextItem.value !== value) {
      onChange(nextItem.value);
    }
    return idx;
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = e.nativeEvent.contentOffset.y;
    const idx = commitOffset(offsetY);

    if (Platform.OS === 'web') {
      if (webSnapTimerRef.current) clearTimeout(webSnapTimerRef.current);
      webSnapTimerRef.current = setTimeout(() => {
        if (Math.abs(offsetY - idx * ITEM_HEIGHT) > 1) {
          scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
        }
      }, 120);
    }
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = e.nativeEvent.contentOffset.y;
    const idx = commitOffset(offsetY);
    if (Math.abs(offsetY - idx * ITEM_HEIGHT) > 1) {
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    }
  }

  function handlePressItem(idx: number) {
    scrolledIndexRef.current = idx;
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    const nextItem = items[idx];
    if (nextItem && nextItem.value !== value) {
      onChange(nextItem.value);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      accessibilityLabel={accessibilityLabel}
      style={[styles.column, style]}
      contentContainerStyle={styles.columnContent}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      onLayout={handleLayout}
      onScroll={handleScroll}
      onMomentumScrollEnd={handleScrollEnd}
      onScrollEndDrag={(e) => {
        const vy = e.nativeEvent.velocity?.y ?? 0;
        if (Math.abs(vy) < 0.05) {
          handleScrollEnd(e);
        }
      }}>
      {items.map((item, idx) => {
        const distance = Math.abs(idx - selectedIndex);
        const isSelected = distance === 0;
        const opacity = distance === 0 ? 1 : distance === 1 ? 0.65 : 0.3;

        return (
          <Pressable
            key={String(item.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => handlePressItem(idx)}
            style={styles.item}>
            <ThemedText
              type="default"
              style={[
                styles.itemText,
                {
                  color: isSelected ? theme.text : theme.textSecondary,
                  fontWeight: isSelected ? '700' : '500',
                  fontSize: isSelected ? 20 : distance === 1 ? 16 : 14,
                  opacity,
                },
              ]}>
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: PICKER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  selectionBand: {
    position: 'absolute',
    top: PADDING_VERTICAL,
    left: Spacing.two,
    right: Spacing.two,
    height: ITEM_HEIGHT,
    borderRadius: Radius.small,
    borderWidth: 1,
  },
  column: {
    height: PICKER_HEIGHT,
  },
  periodColumn: {
    flex: 1.2,
  },
  numberColumn: {
    flex: 1,
  },
  columnContent: {
    paddingVertical: PADDING_VERTICAL,
  },
  colonWrap: {
    width: 14,
    height: PICKER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colon: {
    fontSize: 20,
    fontWeight: '700',
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontVariant: ['tabular-nums'],
  },
});
