import { router } from 'expo-router';
import { Pin, Search } from 'lucide-react-native';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { SelectionBar, SelectionHeaderActions, SelectionIndicator } from '@/components/ui/selection-bar';
import { TextField, type TextFieldRef } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { hasSelectionModifier, useMultiSelect } from '@/hooks/use-multi-select';
import { useDeleteNotes, useNotes } from '@/hooks/use-notes';
import { useTheme } from '@/hooks/use-theme';
import { useWebSearchShortcut } from '@/hooks/use-web-shortcut';
import { formatDate, toISODate } from '@/lib/dates';
import { confirm, errorMessage } from '@/lib/format';

/**
 * 메모 목록. 메모를 누르면 메모장 화면(src/app/note/[id].tsx)이 열린다.
 */
export default function NotesScreen() {
  const theme = useTheme();
  const notes = useNotes();
  const removeMany = useDeleteNotes();
  const multi = useMultiSelect();
  const [query, setQuery] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<TextFieldRef | null>(null);
  useWebSearchShortcut(() => searchRef.current?.focus());

  const all = notes.data ?? [];
  const indexedNotes = useMemo(
    () =>
      (notes.data ?? []).map((note) => ({
        note,
        titleLower: note.title.toLowerCase(),
        bodyLower: note.body.toLowerCase(),
        dateLabel: formatDate(toISODate(new Date(note.updated_at))),
      })),
    [notes.data],
  );
  // 검색어가 있으면 제목이나 내용에 그 말이 들어 있는 메모만 보여준다(대소문자 구분 없음).
  const keyword = deferredQuery.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!keyword) return indexedNotes;
    return indexedNotes.filter(
      (item) => item.titleLower.includes(keyword) || item.bodyLower.includes(keyword),
    );
  }, [indexedNotes, keyword]);

  const visibleIds = useMemo(() => visible.map((item) => item.note.id), [visible]);
  const selectedVisibleIds = visibleIds.filter((id) => multi.isSelected(id));
  const isSelecting = visibleIds.length > 0 && (multi.active || selectedVisibleIds.length > 0);

  async function deleteSelected() {
    if (selectedVisibleIds.length === 0) return;
    const count = selectedVisibleIds.length;
    const ok = await confirm({
      title: `메모 ${count}개를 삭제할까요?`,
      message: '선택한 메모는 삭제 후 다시 복구할 수 없습니다.',
      confirmLabel: `${count}개 삭제`,
    });
    if (!ok) return;
    setBulkError(null);
    try {
      await removeMany.mutateAsync(selectedVisibleIds);
      multi.clear();
    } catch (e) {
      setBulkError(errorMessage(e));
    }
  }

  return (
    <Screen
      title="메모"
      onRefresh={() => notes.refetch()}
      action={
        <SelectionHeaderActions
          selecting={isSelecting}
          canSelect={visibleIds.length > 0}
          addLabel="새 메모"
          onAdd={() => router.push('/note/new')}
          onStartSelect={() => {
            setBulkError(null);
            multi.enter();
          }}
          onCancelSelect={() => {
            multi.clear();
            setBulkError(null);
          }}
        />
      }
      overlay={
        isSelecting ? (
          <SelectionBar
            count={selectedVisibleIds.length}
            totalCount={visibleIds.length}
            deleting={removeMany.isPending}
            onSelectAll={() => multi.selectAll(visibleIds)}
            onDeselectAll={() => {
              multi.deselectAll();
              setBulkError(null);
            }}
            onClear={() => {
              multi.clear();
              setBulkError(null);
            }}
            onDelete={deleteSelected}
          />
        ) : undefined
      }>
      {all.length > 0 ? (
        <TextField
          inputRef={searchRef}
          label="검색"
          leftIcon={<Search size={16} color={theme.textSecondary} strokeWidth={1.9} />}
          value={query}
          onChangeText={setQuery}
          placeholder="제목이나 내용으로 찾기"
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      ) : null}

      {bulkError ? (
        <ThemedText type="small" themeColor="danger">
          {bulkError}
        </ThemedText>
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

      {visible.map(({ note, dateLabel }) => {
        const selected = multi.isSelected(note.id);
        return (
          <Card
            key={note.id}
            selected={selected}
            selecting={isSelecting}
            onPress={(e) => {
              if (isSelecting) {
                multi.handlePress(note.id, visibleIds, e);
              } else if (hasSelectionModifier(e)) {
                setBulkError(null);
                multi.start(note.id);
              } else {
                router.push(`/note/${note.id}`);
              }
            }}
            onLongPress={() => {
              setBulkError(null);
              multi.start(note.id);
            }}>
            <View style={styles.header}>
              {isSelecting ? <SelectionIndicator selected={selected} /> : null}
              <ThemedText type="default" numberOfLines={1} style={styles.title}>
                {note.title || '제목 없음'}
              </ThemedText>
              {note.pinned ? (
                <View style={styles.pinnedBadge}>
                  <Pin size={12} color={theme.tint} strokeWidth={2} />
                  <ThemedText type="small" themeColor="tint">
                    고정
                  </ThemedText>
                </View>
              ) : null}
            </View>
            {note.body ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                {note.body}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              {dateLabel} · {note.body.length}자
            </ThemedText>
          </Card>
        );
      })}
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
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
