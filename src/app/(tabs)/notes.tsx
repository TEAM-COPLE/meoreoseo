import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/hooks/use-notes';
import { formatDate, toISODate } from '@/lib/dates';

/**
 * 메모 목록. 메모를 누르면 메모장 화면(src/app/note/[id].tsx)이 열린다.
 */
export default function NotesScreen() {
  const notes = useNotes();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const all = notes.data ?? [];
  // 검색어가 있으면 제목이나 내용에 그 말이 들어 있는 메모만 보여준다(대소문자 구분 없음).
  const keyword = deferredQuery.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = notes.data ?? [];
    if (!keyword) return list;
    return list.filter(
      (note) =>
        note.title.toLowerCase().includes(keyword) || note.body.toLowerCase().includes(keyword),
    );
  }, [notes.data, keyword]);

  return (
    <Screen
      title="메모"
      action={<Button label="새 메모" size="small" onPress={() => router.push('/note/new')} />}>
      {all.length > 0 ? (
        <TextField
          label="검색"
          value={query}
          onChangeText={setQuery}
          placeholder="제목이나 내용으로 찾기"
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      ) : null}

      <ListStatus
        loading={notes.isPending}
        error={notes.error}
        empty={visible.length === 0}
        emptyText={
          keyword
            ? `"${query.trim()}"이(가) 들어 있는 메모가 없습니다.`
            : '아직 메모가 없습니다. "새 메모"를 눌러 첫 메모를 남겨 보세요.'
        }
        onRetry={notes.refetch}
      />

      {visible.map((note) => (
        <Card key={note.id} onPress={() => router.push(`/note/${note.id}`)}>
          <View style={styles.header}>
            <ThemedText type="default" numberOfLines={1} style={styles.title}>
              {note.title || '제목 없음'}
            </ThemedText>
            {note.pinned ? (
              <ThemedText type="small" themeColor="tint">
                고정
              </ThemedText>
            ) : null}
          </View>
          {note.body ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              {note.body}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(toISODate(new Date(note.updated_at)))} · {note.body.length}자
          </ThemedText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontWeight: 700,
  },
});
