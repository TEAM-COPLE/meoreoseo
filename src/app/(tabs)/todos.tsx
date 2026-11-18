import { router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { SelectionBar, SelectionHeaderActions, SelectionIndicator } from '@/components/ui/selection-bar';
import { TextField, type TextFieldRef } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { hasSelectionModifier, useMultiSelect } from '@/hooks/use-multi-select';
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
import {
  isRepeat,
  isWaitingRepeat,
  REPEAT_OPTIONS,
  repeatLabel,
  type RepeatChoice,
} from '@/lib/repeat';

type Filter = 'open' | 'done';

const FILTERS = [
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
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const todos = useTodos();
  const toggle = useToggleTodo();
  const removeMany = useDeleteTodos();
  const multi = useMultiSelect();
  const [filter, setFilter] = useState<Filter>('open');
  const [priorityFilter, setPriorityFilter] = useState<number>(-1);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<TextFieldRef | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // null: 양식 닫힘, 'new': 새로 추가, Todo: 그 할 일을 수정
  const [editing, setEditing] = useState<Todo | 'new' | null>(null);

  useWebSearchShortcut(() => searchRef.current?.focus());

  const activeEditing: Todo | 'new' | null =
    editing ??
    (add
      ? 'new'
      : editId
        ? ((todos.data ?? []).find((t) => t.id === editId) ?? null)
        : null);

  function closeForm() {
    setEditing(null);
    if (add || editId) {
      router.setParams({ add: undefined, editId: undefined });
    }
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    multi.clear();
    setBulkError(null);
  }

  const today = todayISO();
  const keyword = deferredQuery.trim().toLowerCase();
  const visible = (todos.data ?? []).filter((todo) => {
    if (todo.done !== (filter === 'done')) return false;
    if (priorityFilter !== -1 && todo.priority !== priorityFilter) return false;
    if (keyword) {
      const hay = `${todo.title} ${todo.notes ?? ''}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
  // 아직 차례가 오지 않은 반복 할 일은 아래 "다음 반복"에 따로 모아, 그날이 되기 전에는 체크하지 못하게 한다.
  const ready = visible.filter((todo) => !isWaitingRepeat(todo, today));
  const waiting = visible.filter((todo) => isWaitingRepeat(todo, today));
  const visibleIds = [...ready, ...waiting].map((todo) => todo.id);
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

    const bodyContent = (
      <>
        <ThemedText
          type="default"
          themeColor={todo.done || locked ? 'textSecondary' : 'text'}
          style={todo.done && styles.doneTitle}>
          {todo.title}
        </ThemedText>
        {todo.due_date || todo.priority > 0 ? (
          <View style={styles.meta}>
            {todo.due_date ? (
              <ThemedText type="small" themeColor={overdue ? 'danger' : 'textSecondary'}>
                {formatDate(todo.due_date)}
                {overdue ? ' · 기한 지남' : ''}
                {locked ? '부터 체크할 수 있어요' : ''}
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
                  ? `${todo.title} (${formatDate(todo.due_date)}부터 체크 가능)`
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
      <Segmented options={FILTERS} value={filter} onChange={changeFilter} />
      <Segmented
        options={PRIORITY_FILTERS}
        value={priorityFilter}
        onChange={(next) => {
          setPriorityFilter(next);
          multi.clear();
        }}
      />
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
        empty={ready.length === 0 && waiting.length === 0}
        emptyText={
          keyword || priorityFilter !== -1
            ? '조건에 맞는 할 일이 없습니다.'
            : filter === 'open'
              ? '진행 중인 할 일이 없습니다. "추가"를 눌러 시작해 보세요.'
              : '완료한 할 일이 아직 없습니다.'
        }
        onRetry={todos.refetch}
      />

      {ready.map((todo) => renderTodo(todo, false))}

      {waiting.length > 0 ? (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
            다음 반복
          </ThemedText>
          {waiting.map((todo) => renderTodo(todo, true))}
        </>
      ) : null}

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
  const [dueDate, setDueDate] = useState<string | null>(todo?.due_date ?? null);
  const [priority, setPriority] = useState<number>(todo?.priority ?? 0);
  const [repeat, setRepeat] = useState<RepeatChoice>(
    isRepeat(todo?.repeat) ? (todo?.repeat as RepeatChoice) : 'none',
  );
  const [error, setError] = useState<string | null>(null);

  // 반복을 고르면서 마감일이 비어 있으면 오늘로 채운다(반복의 기준 날짜가 필요하다).
  function changeRepeat(value: RepeatChoice) {
    setRepeat(value);
    if (value !== 'none' && !dueDate) setDueDate(todayISO());
  }

  async function submit() {
    if (!title.trim()) {
      setError('제목을 입력해 주세요.');
      return;
    }
    const repeatValue = repeat === 'none' ? null : repeat;
    if (repeatValue && !dueDate) {
      setError('반복하려면 마감일을 정해 주세요.');
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
        priority,
        repeat: repeatValue,
        repeat_start: repeatValue ? (keepStart ? (todo.repeat_start ?? dueDate) : dueDate) : null,
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
        label="제목"
        value={title}
        onChangeText={setTitle}
        placeholder="무엇을 해야 하나요?"
        maxLength={200}
        autoFocus={!todo}
      />
      <DateField
        label="마감일"
        value={dueDate}
        onChange={(value) => {
          setDueDate(value);
          // 마감일을 지우면 반복도 끈다.
          if (!value) setRepeat('none');
        }}
        clearable
      />
      <Segmented label="반복" options={REPEAT_OPTIONS} value={repeat} onChange={changeRepeat} />
      {repeat !== 'none' && dueDate ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${repeatLabel(repeat, dueDate)} 반복합니다. 완료하면 다음 날짜의 할 일이 생기고, 그날부터 체크할 수 있어요.`}
        </ThemedText>
      ) : null}
      <Segmented label="중요도" options={PRIORITIES} value={priority} onChange={setPriority} />
      <TextField label="메모" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}

const styles = StyleSheet.create({
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
  sectionTitle: {
    fontWeight: 700,
    marginTop: Spacing.two,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
});
