import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useDeferredValue, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RepeatPicker } from '@/components/repeat-picker';
import { TagBadge } from '@/components/tag-badge';
import { TagPicker } from '@/components/tag-picker';
import { ThemedText } from '@/components/themed-text';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { SelectionBar, SelectionHeaderActions, SelectionIndicator } from '@/components/ui/selection-bar';
import { TextField, type TextFieldRef } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { hasSelectionModifier, useMultiSelect } from '@/hooks/use-multi-select';
import { useTagColorOf, useTagMap, useTags } from '@/hooks/use-tags';
import { useTheme } from '@/hooks/use-theme';
import { useWebSearchShortcut } from '@/hooks/use-web-shortcut';
import {
  useDeleteTodo,
  useDeleteTodos,
  useSaveTodo,
  useTodos,
  useToggleTodo,
  type Todo,
} from '@/hooks/use-todos';
import { formatDate, todayISO } from '@/lib/dates';
import { confirm, errorMessage } from '@/lib/format';
import { isRepeat, isWaitingRepeat, repeatLabel, todoPeriodLabel, todoStartOf } from '@/lib/repeat';

/** 할 일의 단계: 예정(아직 시작 전) · 진행 중 · 완료 */
type Filter = 'upcoming' | 'open' | 'done';

const FILTERS = [
  { value: 'upcoming', label: '예정' },
  { value: 'open', label: '진행 중' },
  { value: 'done', label: '완료' },
] as const;

const PRIORITIES = [
  { value: 0, label: '보통' },
  { value: 1, label: '중요' },
  { value: 2, label: '매우 중요' },
] as const;

const PRIORITY_FILTERS = [
  { value: -1, label: '전체' },
  { value: 0, label: '보통' },
  { value: 1, label: '중요' },
  { value: 2, label: '매우 중요' },
] as const;

export default function TodosScreen() {
  const pathname = usePathname();
  const isTodosRoute = pathname === '/todos';
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const theme = useTheme();
  const todos = useTodos();
  const toggle = useToggleTodo();
  const removeMany = useDeleteTodos();
  const multi = useMultiSelect();
  const tags = useTags();
  const tagMap = useTagMap();
  const tagColorOf = useTagColorOf();
  const [filter, setFilter] = useState<Filter>('open');
  // 'all': 모든 할 일, 그 밖에는 고른 태그의 id
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<number>(-1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<TextFieldRef | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // null: 양식 닫힘, 'new': 새로 추가, Todo: 그 할 일을 수정
  const [editing, setEditing] = useState<Todo | 'new' | null>(null);

  useWebSearchShortcut(() => searchRef.current?.focus());

  const paramKey = isTodosRoute && (add || editId) ? `${add ?? ''}|${editId ?? ''}` : '';
  const [dismissedParamKey, setDismissedParamKey] = useState('');
  const paramEditing: Todo | 'new' | null =
    paramKey && paramKey !== dismissedParamKey
      ? add
        ? 'new'
        : editId
          ? ((todos.data ?? []).find((t) => t.id === editId) ?? null)
          : null
      : null;

  const activeEditing: Todo | 'new' | null = editing ?? paramEditing;

  function closeForm() {
    setEditing(null);
    if (paramKey) {
      setDismissedParamKey(paramKey);
      router.setParams({ add: '', editId: '' });
    }
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    multi.clear();
    setBulkError(null);
  }

  function changeTagFilter(next: string) {
    setTagFilter(next);
    multi.clear();
    setBulkError(null);
  }

  const today = todayISO();
  // 고른 태그가 지워졌으면 다시 "전체"로 본다.
  const activeTagFilter = tagFilter !== 'all' && tagMap.has(tagFilter) ? tagFilter : 'all';
  const tagFilterOptions = [
    { value: 'all', label: '전체' },
    ...(tags.data ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
  ];
  const keyword = deferredQuery.trim().toLowerCase();
  const visible = (todos.data ?? []).filter((todo) => {
    if (stageOf(todo, today) !== filter) return false;
    if (activeTagFilter !== 'all' && todo.tag_id !== activeTagFilter) return false;
    if (priorityFilter !== -1 && todo.priority !== priorityFilter) return false;
    if (keyword) {
      const hay = `${todo.title} ${todo.notes ?? ''}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
  // 예정 탭은 시작하는 날이 빠른 순서로 보여준다.
  if (filter === 'upcoming') {
    visible.sort((a, b) => (todoStartOf(a) ?? '').localeCompare(todoStartOf(b) ?? ''));
  }
  const visibleIds = visible.map((todo) => todo.id);
  const selectedVisibleIds = visibleIds.filter((id) => multi.isSelected(id));
  const isSelecting = visibleIds.length > 0 && (multi.active || selectedVisibleIds.length > 0);

  async function deleteSelected() {
    if (selectedVisibleIds.length === 0) return;
    const count = selectedVisibleIds.length;
    const ok = await confirm({
      title: `할 일 ${count}개를 삭제할까요?`,
      message: '선택한 할 일은 삭제 후 다시 복구할 수 없습니다.',
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

  function renderTodo(todo: Todo, locked: boolean) {
    const overdue = !todo.done && todo.due_date !== null && todo.due_date < today;
    const repeat = isRepeat(todo.repeat) && todo.due_date ? todo.repeat : null;
    const selected = multi.isSelected(todo.id);
    const tag = todo.tag_id ? tagMap.get(todo.tag_id) : undefined;
    const tagColor = tagColorOf(todo.tag_id);
    const dateLabel = todoPeriodLabel(todo);

    const bodyContent = (
      <>
        <ThemedText
          type="default"
          themeColor={todo.done || locked ? 'textSecondary' : 'text'}
          style={todo.done && styles.doneTitle}>
          {todo.title}
        </ThemedText>
        {dateLabel || todo.priority > 0 || tag ? (
          <View style={styles.meta}>
            {tag ? <TagBadge tag={tag} /> : null}
            {dateLabel ? (
              <ThemedText type="small" themeColor={overdue ? 'danger' : 'textSecondary'}>
                {dateLabel}
                {overdue ? ' · 기한 지남' : ''}
                {locked ? ` · ${formatDate(todoStartOf(todo) ?? today)}부터 체크할 수 있어요` : ''}
              </ThemedText>
            ) : null}
            {todo.priority > 0 ? (
              <ThemedText type="small" themeColor="tint">
                {PRIORITIES[todo.priority]?.label}
              </ThemedText>
            ) : null}
            {repeat && todo.due_date ? (
              <ThemedText type="small" themeColor="textSecondary">
                {`🔁 ${repeatLabel(repeat, todo.repeat_start ?? todo.due_date)}`}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </>
    );

    return (
      <Card
        key={todo.id}
        selected={selected}
        selecting={isSelecting}
        // 태그가 있으면 카드 왼쪽에 태그 색 띠를 둘러 한눈에 구분되게 한다.
        style={tagColor ? [styles.tagged, { borderLeftColor: tagColor }] : undefined}
        onPress={isSelecting ? (e) => multi.handlePress(todo.id, visibleIds, e) : undefined}
        onLongPress={() => {
          setBulkError(null);
          multi.start(todo.id);
        }}>
        <View style={[styles.row, locked && !isSelecting && styles.locked]}>
          {isSelecting ? (
            <SelectionIndicator selected={selected} />
          ) : (
            <Checkbox
              checked={todo.done}
              label={
                locked && todo.due_date
                  ? `${todo.title} (${formatDate(todoStartOf(todo) ?? todo.due_date)}부터 체크 가능)`
                  : `${todo.title} 완료 표시`
              }
              disabled={locked}
              onPress={() => toggle.mutate(todo)}
              onLongPress={() => {
                setBulkError(null);
                multi.start(todo.id);
              }}
            />
          )}
          {isSelecting ? (
            <View style={styles.body}>{bodyContent}</View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${todo.title} 수정`}
              delayLongPress={320}
              onPress={(e) => {
                if (hasSelectionModifier(e)) {
                  setBulkError(null);
                  multi.start(todo.id);
                  return;
                }
                setEditing(todo);
              }}
              onLongPress={() => {
                setBulkError(null);
                multi.start(todo.id);
              }}
              style={styles.body}>
              {bodyContent}
            </Pressable>
          )}
        </View>
      </Card>
    );
  }

  return (
    <Screen
      title="할 일"
      onRefresh={() => todos.refetch()}
      action={
        <SelectionHeaderActions
          selecting={isSelecting}
          canSelect={visibleIds.length > 0}
          onAdd={() => setEditing('new')}
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
      <View style={styles.filterBar}>
        <Segmented options={FILTERS} value={filter} onChange={changeFilter} />
        {(() => {
          const activeCount =
            (priorityFilter !== -1 ? 1 : 0) + (activeTagFilter !== 'all' ? 1 : 0);
          const highlighted = filtersOpen || activeCount > 0;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="상세 필터 열기"
              accessibilityState={{ expanded: filtersOpen }}
              onPress={() => setFiltersOpen((prev) => !prev)}
              style={({ pressed }) => [
                styles.filterToggle,
                {
                  backgroundColor: highlighted ? theme.tint : theme.backgroundElement,
                  borderColor: highlighted ? theme.tint : theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={{ color: highlighted ? theme.onTint : theme.text }}>
                {activeCount > 0 ? `필터 ${activeCount}` : '필터'} {filtersOpen ? '▴' : '▾'}
              </ThemedText>
            </Pressable>
          );
        })()}
      </View>

      {filtersOpen ? (
        <Card>
          <View style={styles.filterPanelHeader}>
            <ThemedText type="smallBold">상세 필터</ThemedText>
            {priorityFilter !== -1 || activeTagFilter !== 'all' ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setPriorityFilter(-1);
                  changeTagFilter('all');
                }}>
                <ThemedText type="small" themeColor="textSecondary">
                  초기화
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          <Segmented
            label="중요도"
            options={PRIORITY_FILTERS}
            value={priorityFilter}
            onChange={(next) => {
              setPriorityFilter(next);
              multi.clear();
            }}
          />
          {tagFilterOptions.length > 1 ? (
            <Segmented
              label="태그"
              options={tagFilterOptions}
              value={activeTagFilter}
              onChange={changeTagFilter}
            />
          ) : null}
        </Card>
      ) : null}

      <TextField
        inputRef={searchRef}
        label="검색"
        placeholder="할 일 제목 또는 메모로 검색…"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      {bulkError ? (
        <ThemedText type="small" themeColor="danger">
          {bulkError}
        </ThemedText>
      ) : null}

      <ListStatus
        loading={todos.isPending}
        error={todos.error}
        empty={visible.length === 0}
        emptyText={
          keyword || priorityFilter !== -1 || activeTagFilter !== 'all'
            ? '조건에 맞는 할 일이 없습니다.'
            : EMPTY_TEXT[filter]
        }
        onRetry={todos.refetch}
      />

      {/* 아직 차례가 오지 않은 반복 할 일은 그날이 되기 전에는 체크하지 못하게 잠가 둔다. */}
      {visible.map((todo) => renderTodo(todo, isWaitingRepeat(todo, today)))}

      {activeEditing ? (
        <TodoForm
          todo={activeEditing === 'new' ? null : activeEditing}
          onClose={closeForm}
        />
      ) : null}
    </Screen>
  );
}

function TodoForm({ todo, onClose }: { todo: Todo | null; onClose: () => void }) {
  const save = useSaveTodo();
  const remove = useDeleteTodo();

  const [title, setTitle] = useState(todo?.title ?? '');
  const [notes, setNotes] = useState(todo?.notes ?? '');
  const [startDate, setStartDate] = useState<string | null>(todo?.start_date ?? null);
  const [dueDate, setDueDate] = useState<string | null>(todo?.due_date ?? null);
  const [priority, setPriority] = useState<number>(todo?.priority ?? 0);
  // 반복 방법 (반복 안 하면 null)
  const [repeat, setRepeat] = useState<string | null>(
    todo && isRepeat(todo.repeat) ? todo.repeat : null,
  );
  const [tagId, setTagId] = useState<string | null>(todo?.tag_id ?? null);
  const [error, setError] = useState<string | null>(null);

  // 반복을 고르면서 마감일이 비어 있으면 시작일(없으면 오늘)로 채운다(반복의 기준 날짜가 필요하다).
  function changeRepeat(value: string | null) {
    setRepeat(value);
    if (value && !dueDate) setDueDate(startDate ?? todayISO());
  }

  async function submit() {
    if (!title.trim()) {
      setError('제목은 꼭 입력해 주세요.');
      return;
    }
    const repeatValue = repeat;
    if (repeatValue && !dueDate) {
      setError('반복하려면 마감일을 정해 주세요.');
      return;
    }
    if (startDate && dueDate && startDate > dueDate) {
      setError('시작일은 마감일보다 늦을 수 없어요.');
      return;
    }
    // 반복 방법과 마감일이 그대로면 기준 날짜를 유지한다(매월 31일 같은 반복이 짧은 달 뒤에도 31일로 돌아오게).
    const keepStart = todo && todo.repeat === repeatValue && todo.due_date === dueDate;
    try {
      await save.mutateAsync({
        id: todo?.id,
        title: title.trim(),
        notes: notes.trim() || null,
        due_date: dueDate,
        // 시작일이 마감일과 같으면 하루짜리이므로 따로 저장하지 않는다.
        start_date: startDate && startDate !== dueDate ? startDate : null,
        priority,
        repeat: repeatValue,
        repeat_start: repeatValue ? (keepStart ? (todo.repeat_start ?? dueDate) : dueDate) : null,
        tag_id: tagId,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteTodo() {
    if (
      !todo ||
      !(await confirm({
        title: '할 일을 삭제할까요?',
        message: `'${todo.title}' 항목을 삭제하면 다시 복구할 수 없습니다.`,
        confirmLabel: '삭제',
      }))
    ) {
      return;
    }
    try {
      await remove.mutateAsync(todo.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={todo ? '할 일 수정' : '새 할 일'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending}
      onDelete={todo ? deleteTodo : undefined}
      error={error}>
      <TextField
        label="제목 (필수)"
        value={title}
        onChangeText={setTitle}
        placeholder="무엇을 해야 하나요?"
        maxLength={200}
        autoFocus={!todo}
      />
      <DateField
        label="시작일 (선택)"
        value={startDate}
        onChange={(value) => {
          setStartDate(value);
          // 마감일이 시작일보다 이르면 마감일을 시작일로 맞춘다.
          if (value && dueDate && dueDate < value) setDueDate(value);
        }}
        clearable
      />
      <DateField
        label="마감일 (선택)"
        value={dueDate}
        onChange={(value) => {
          setDueDate(value);
          // 마감일을 지우면 반복도 끈다(반복은 마감일을 기준으로 계산한다).
          if (!value) setRepeat(null);
          // 마감일을 시작일보다 앞으로 옮기면 시작일을 마감일로 맞춘다.
          if (value && startDate && value < startDate) setStartDate(value);
        }}
        clearable
      />
      <ThemedText type="small" themeColor="textSecondary">
        {periodHint(startDate, dueDate)}
      </ThemedText>
      <RepeatPicker value={repeat} onChange={changeRepeat} anchor={dueDate ?? startDate ?? todayISO()} />
      {repeat && dueDate ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${repeatLabel(repeat, dueDate)} 반복합니다. 완료하면 다음 날짜의 할 일이 생기고, 그날부터 체크할 수 있어요.`}
        </ThemedText>
      ) : null}
      <TagPicker value={tagId} onChange={setTagId} />
      <Segmented label="중요도" options={PRIORITIES} value={priority} onChange={setPriority} />
      <TextField label="메모" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}

const EMPTY_TEXT: Record<Filter, string> = {
  upcoming: '예정된 할 일이 없습니다. 시작일(없으면 마감일)이 내일 이후인 할 일이 여기에 모여요.',
  open: '진행 중인 할 일이 없습니다. "추가"를 눌러 시작해 보세요.',
  done: '완료한 할 일이 아직 없습니다.',
};

/**
 * 할 일이 어느 단계인지.
 * 완료 표시한 것은 '완료', 시작일(없으면 마감일)이 내일 이후면 '예정', 나머지(날짜가 없는 것 포함)는 '진행 중'.
 */
function stageOf(todo: Todo, today: string): Filter {
  if (todo.done) return 'done';
  const start = todoStartOf(todo);
  return start !== null && start > today ? 'upcoming' : 'open';
}

/** 시작일·마감일을 어떻게 정했는지에 따라 달력에 어떻게 보이는지 알려준다. */
function periodHint(startDate: string | null, dueDate: string | null): string {
  if (startDate && dueDate && startDate < dueDate) {
    return `${formatDate(startDate)}부터 ${formatDate(dueDate)}까지 일정 달력에 보여요.`;
  }
  if (dueDate) return `${formatDate(dueDate)}에 일정 달력에 보여요.`;
  if (startDate) return `마감 없이 ${formatDate(startDate)}부터 할 일이에요. 일정 달력에는 시작일에 보여요.`;
  return '날짜를 비워 두면 언제든 할 일로 남아요. (일정 달력에는 보이지 않아요)';
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  filterToggle: {
    minHeight: 36,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // 태그 색 띠
  tagged: {
    borderLeftWidth: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  doneTitle: {
    textDecorationLine: 'line-through',
  },
  // 아직 차례가 오지 않은 반복 할 일은 흐리게 보여준다.
  locked: {
    opacity: 0.6,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
});
