import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme, useTheme } from '@/hooks/use-theme';
import { TAG_COLOR_KEYS, TAG_COLORS, tagColorValue, type TagColor } from '@/lib/tags';

/** 1초마다 바뀌는 "지금 시각"(밀리초). enabled 가 false 면 멈춘다. */
export function useNow(enabled = true, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}

/** 과목 색 동그라미 */
export function SubjectDot({ color, size = 10 }: { color: string | null; size?: number }) {
  const scheme = useColorScheme();
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ? tagColorValue(color, scheme) : theme.textSecondary,
      }}
    />
  );
}

/** 색 고르기 (태그와 같은 10가지 색) */
export function ColorPicker({ value, onChange }: { value: TagColor; onChange: (color: TagColor) => void }) {
  const scheme = useColorScheme();
  const theme = useTheme();
  return (
    <View style={styles.colorRow} accessibilityRole="radiogroup">
      {TAG_COLOR_KEYS.map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityLabel={TAG_COLORS[key].label}
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={[
              styles.colorSwatch,
              {
                backgroundColor: tagColorValue(key, scheme),
                borderColor: selected ? theme.text : 'transparent',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** 목표 대비 얼마나 했는지 보여 주는 막대 */
export function ProgressBar({ ratio, color }: { ratio: number; color?: string }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: color ?? theme.success },
        ]}
      />
    </View>
  );
}

/** 초록 불 + "공부 중" */
export function LiveBadge({ label = '공부 중' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.live, { backgroundColor: `${theme.success}22` }]}>
      <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
      <ThemedText type="small" style={[styles.liveText, { color: theme.success }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 3,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    maxWidth: 160,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
