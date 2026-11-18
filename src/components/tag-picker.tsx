import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useDeleteTag, useSaveTag, useTags, type Tag } from '@/hooks/use-tags';
import { useColorScheme, useTheme } from '@/hooks/use-theme';
import { confirm, errorMessage } from '@/lib/format';
import {
  MAX_TAG_NAME,
  TAG_COLOR_KEYS,
  TAG_COLORS,
  tagColorValue,
  tagSoftBackground,
  type TagColor,
} from '@/lib/tags';

type Props = {
  /** 고른 태그 id (없으면 null) */
  value: string | null;
  onChange: (tagId: string | null) => void;
};

/**
 * 할 일·일정 양식의 "태그" 고르기.
 * 태그를 하나 고르거나, 그 자리에서 새 태그를 만들고, "편집"을 눌러 이름·색을 바꾸거나 지울 수 있다.
 */
export function TagPicker({ value, onChange }: Props) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const tags = useTags();
  const save = useSaveTag();
  const remove = useDeleteTag();

  // null: 편집 칸 닫힘, 'new': 새 태그 만들기, Tag: 그 태그 고치기
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>('blue');
  const [error, setError] = useState<string | null>(null);

  const list = tags.data ?? [];

  // 고른 태그가 지워졌으면 선택을 비운다(없는 태그로 저장되지 않게).
  useEffect(() => {
    if (value && tags.data && !tags.data.some((tag) => tag.id === value)) onChange(null);
  }, [value, tags.data, onChange]);

  function openEditor(target: Tag | 'new') {
    setEditing(target);
    setError(null);
    if (target === 'new') {
      setName('');
      // 아직 안 쓴 색을 먼저 골라 둔다.
      const used = new Set(list.map((tag) => tag.color));
      setColor(TAG_COLOR_KEYS.find((key) => !used.has(key)) ?? 'blue');
    } else {
      setName(target.name);
      setColor((TAG_COLOR_KEYS as string[]).includes(target.color) ? (target.color as TagColor) : 'gray');
    }
  }

  async function submitTag() {
    if (!editing) return;
    setError(null);
    try {
      const saved = await save.mutateAsync({
        id: editing === 'new' ? undefined : editing.id,
        name,
        color,
      });
      // 새로 만든 태그는 바로 고른다.
      if (editing === 'new') onChange(saved.id);
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteTag(tag: Tag) {
    const ok = await confirm({
      title: `'${tag.name}' 태그를 지울까요?`,
      message: '이 태그가 붙은 할 일과 일정은 그대로 남고, 태그만 빠집니다.',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    setError(null);
    try {
      await remove.mutateAsync(tag.id);
      if (value === tag.id) onChange(null);
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <View style={styles.wrapper}>
      <ThemedText type="small" themeColor="textSecondary">
        {managing ? '태그 (고칠 태그를 누르세요)' : '태그 (선택)'}
      </ThemedText>

      <View style={styles.row} accessibilityRole="radiogroup">
        {!managing ? (
          <Chip
            label="없음"
            selected={value === null}
            onPress={() => onChange(null)}
            background={value === null ? theme.tint : theme.backgroundElement}
            textColor={value === null ? theme.onTint : theme.text}
          />
        ) : null}
        {list.map((tag) => {
          const hex = tagColorValue(tag.color, scheme);
          const selected = !managing && tag.id === value;
          return (
            <Chip
              key={tag.id}
              label={tag.name}
              dot={selected ? undefined : hex}
              selected={selected}
              onPress={() => (managing ? openEditor(tag) : onChange(tag.id))}
              background={selected ? hex : tagSoftBackground(hex, scheme)}
              textColor={selected ? '#FFFFFF' : theme.text}
            />
          );
        })}
        {!managing ? (
          <Chip
            label="＋ 새 태그"
            onPress={() => openEditor('new')}
            background={theme.backgroundElement}
            textColor={theme.tint}
          />
        ) : null}
        {list.length > 0 ? (
          <Chip
            label={managing ? '편집 끝' : '편집'}
            onPress={() => {
              setManaging((on) => !on);
              setEditing(null);
            }}
            background={theme.backgroundElement}
            textColor={theme.textSecondary}
          />
        ) : null}
      </View>

      {editing ? (
        <View style={[styles.editor, { borderColor: theme.border }]}>
          <TextField
            label={editing === 'new' ? '새 태그 이름' : '태그 이름'}
            value={name}
            onChangeText={setName}
            placeholder="예: 회사, 공부, 운동"
            maxLength={MAX_TAG_NAME}
            autoFocus
          />
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {TAG_COLOR_KEYS.map((key) => {
              const hex = tagColorValue(key, scheme);
              const selected = key === color;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityLabel={TAG_COLORS[key].label}
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  onPress={() => setColor(key)}
                  style={[
                    styles.swatch,
                    { backgroundColor: hex, borderColor: selected ? theme.text : 'transparent' },
                  ]}>
                  {selected ? <ThemedText style={styles.swatchCheck}>✓</ThemedText> : null}
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.buttons}>
            <Button
              label={editing === 'new' ? '태그 추가' : '태그 저장'}
              size="small"
              loading={save.isPending}
              onPress={submitTag}
            />
            <Button label="취소" size="small" variant="secondary" onPress={() => setEditing(null)} />
            {editing !== 'new' ? (
              <Button
                label="태그 삭제"
                size="small"
                variant="danger"
                loading={remove.isPending}
                onPress={() => deleteTag(editing)}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  onPress,
  background,
  textColor,
  selected,
  dot,
}: {
  label: string;
  onPress: () => void;
  background: string;
  textColor: string;
  selected?: boolean;
  /** 이름 앞에 찍을 색 점 */
  dot?: string;
}) {
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: background, opacity: pressed ? 0.75 : 1 }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <ThemedText type="small" numberOfLines={1} style={{ color: textColor }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    maxWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.full,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  editor: {
    marginTop: Spacing.one,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 700,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
