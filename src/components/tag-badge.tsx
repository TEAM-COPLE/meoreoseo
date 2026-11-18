import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Tag } from '@/hooks/use-tags';
import { useColorScheme } from '@/hooks/use-theme';
import { tagColorValue, tagSoftBackground } from '@/lib/tags';

/** 할 일·일정 목록에 붙는 작은 태그 표시 (색 점 + 이름) */
export function TagBadge({ tag }: { tag: Tag }) {
  const scheme = useColorScheme();
  const color = tagColorValue(tag.color, scheme);

  return (
    <View
      accessibilityLabel={`태그 ${tag.name}`}
      style={[styles.badge, { backgroundColor: tagSoftBackground(color, scheme) }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" numberOfLines={1} style={styles.name}>
        {tag.name}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.full,
    maxWidth: 160,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flexShrink: 1,
  },
});
