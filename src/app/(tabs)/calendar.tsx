import { router, useFocusEffect, useLocalSearchParams, usePathname } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RepeatPicker } from '@/components/repeat-picker';
import { TagBadge } from '@/components/tag-badge';
import { TagPicker } from '@/components/tag-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { MonthCalendar } from '@/components/ui/month-calendar';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { SelectionBar, SelectionHeaderActions, SelectionIndicator } from '@/components/ui/selection-bar';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  timeLabel,
  useDeleteEvent,
  useDeleteEvents,
  useEndEventRepeat,
  useEvents,
  useSaveEvent,
  type CalendarEvent,
} from '@/hooks/use-events';
import { hasSelectionModifier, useMultiSelect } from '@/hooks/use-multi-select';
import { useTagColorOf, useTagMap } from '@/hooks/use-tags';
import { useTheme } from '@/hooks/use-theme';
import { useTodos, useToggleTodo, type Todo } from '@/hooks/use-todos';
import {
  addDays,
  formatDate,
  formatTime,
  isValidTime,
  monthRange,
  todayISO,
  yearMonthOf,
  type YearMonth,
} from '@/lib/dates';
import { confirm, errorMessage } from '@/lib/format';
import { requestGoogleSync } from '@/lib/google-calendar';
import { isRepeat, isWaitingRepeat, repeatLabel, todoPeriodLabel, todoStartOf } from '@/lib/repeat';

/** 구글에서 가져온 일정 중 앱에서 고칠 수 없는 것을 눌렀을 때 보여줄 안내 */
const READONLY_NOTICE =
  '구글 캘린더에서만 고칠 수 있는 일정이에요. (남이 보낸 초대, 공휴일처럼 보기만 되는 캘린더, 생일 등)';

export default function CalendarScreen() {
  const pathname = usePathname();
  const isCalendarRoute = pathname === '/calendar';
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const [selected, setSelected] = useState(todayISO);
  const [month, setMonth] = useState(() => yearMonthOf(selected));
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const events = useEvents(month);
  const todos = useTodos();
  const toggleTodo = useToggleTodo();
  const removeMany = useDeleteEvents();
  const multi = useMultiSelect();
  const theme = useTheme();
  const tagMap = useTagMap();
  const tagColorOf = useTagColorOf();

  // 캘린더 화면을 열 때마다 구글 캘린더에서 바뀐 일정을 받아 온다(연결된 경우에만).
  useFocusEffect(useCallback(() => requestGoogleSync(300), []));

  const paramKey = isCalendarRoute && (add || editId) ? `${add ?? ''}|${editId ?? ''}` : '';
  const [dismissedParamKey, setDismissedParamKey] = useState('');
  const paramEditing: CalendarEvent | 'new' | null =
    paramKey && paramKey !== dismissedParamKey
      ? add
        ? 'new'
        : editId
          ? ((events.data ?? []).find((e) => e.id === editId && !e.google_readonly) ?? null)
          : null
      : null;

  const activeEditing: CalendarEvent | 'new' | null = editing ?? paramEditing;

  function closeForm() {
    setEditing(null);
    if (paramKey) {
      setDismissedParamKey(paramKey);
      router.setParams({ add: '', editId: '' });
    }
  }
  const eventsByDate = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      const list = byDate.get(event.event_date);
      if (list) {
        list.push(event);
      } else {
        byDate.set(event.event_date, [event]);
      }
    }
    return byDate;
  }, [events.data]);
  const todosByDate = useMemo(
    () => groupTodosByDate(todos.data ?? [], monthRange(month)),
    [todos.data, month],
  );
  // 날짜마다 점의 색. 태그가 있으면 태그 색, 없으면 기본 색.
  const markColors = useMemo(() => {
    const colors = new Map<string, string[]>();
    const add = (date: string, color: string) => {
      const list = colors.get(date);
      if (!list) colors.set(date, [color]);
      else if (!list.includes(color)) list.push(color);
    };
    for (const [date, list] of eventsByDate) {
      for (const event of list) add(date, tagColorOf(event.tag_id) ?? theme.tint);
    }
    for (const [date, list] of todosByDate) {
      for (const todo of list) add(date, tagColorOf(todo.tag_id) ?? theme.tint);
    }
    return colors;
  }, [eventsByDate, todosByDate, tagColorOf, theme.tint]);
  const dayEvents = eventsByDate.get(selected) ?? [];
  const dayTodos = todosByDate.get(selected) ?? [];
  const today = todayISO();
  // 남이 만든 회의 초대처럼 구글에서만 고칠 수 있는 일정은 고르거나 지울 수 없다.
  const dayEventIds = dayEvents.filter((event) => !event.google_readonly).map((event) => event.id);
  const selectedDayIds = dayEventIds.filter((id) => multi.isSelected(id));
  const isSelecting = dayEventIds.length > 0 && (multi.active || selectedDayIds.length > 0);

  function selectDate(nextDate: string) {
    setSelected(nextDate);
    multi.clear();
    setBulkError(null);
  }

  // 달을 넘기면 그 달 안의 날짜를 선택한다(이번 달이면 오늘, 아니면 1일).
  function changeMonth(next: YearMonth) {
    const today = todayISO();
    const { start, end } = monthRange(next);
    setMonth(next);
    setSelected(today >= start && today <= end ? today : start);
    multi.clear();
    setBulkError(null);
  }

  async function deleteSelected() {
    if (selectedDayIds.length === 0) return;
    const count = selectedDayIds.length;
    const hasRepeating = dayEvents.some(
      (event) => multi.isSelected(event.id) && isRepeat(event.repeat),
    );
    const ok = await confirm({
      title: `일정 ${count}개를 삭제할까요?`,
      message: hasRepeating
        ? '반복 일정이 포함되어 있어 해당 반복 일정 전체(지난 날짜 포함)가 함께 삭제됩니다.'
        : '선택한 일정은 삭제 후 다시 복구할 수 없습니다.',
      confirmLabel: `${count}개 삭제`,
    });
    if (!ok) return;
    setBulkError(null);
    try {
      await removeMany.mutateAsync(selectedDayIds);
      multi.clear();
    } catch (e) {
      setBulkError(errorMessage(e));
    }
  }

  return (
    <Screen
      title="일정"
      onRefresh={() => events.refetch()}
      action={
        <SelectionHeaderActions
          selecting={isSelecting}
          canSelect={dayEventIds.length > 0}
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
            count={selectedDayIds.length}
            totalCount={dayEventIds.length}
            deleting={removeMany.isPending}
            onSelectAll={() => multi.selectAll(dayEventIds)}
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
      <Card>
        <MonthCalendar
          month={month}
          onChangeMonth={changeMonth}
          selected={selected}
          onSelect={selectDate}
          markColors={markColors}
        />
      </Card>

      <ThemedText type="default" style={styles.dayTitle}>
        {formatDate(selected)}
      </ThemedText>

      {bulkError ? (
        <ThemedText type="small" themeColor="danger">
          {bulkError}
        </ThemedText>
      ) : null}

      <ListStatus
        loading={events.isPending}
        error={events.error}
        empty={dayEvents.length === 0 && dayTodos.length === 0}
        emptyText="이 날에는 일정과 할 일이 없습니다."
        onRetry={events.refetch}
      />

      {dayEvents.map((event) => {
        const isItemSelected = multi.isSelected(event.id);
        const tag = event.tag_id ? tagMap.get(event.tag_id) : undefined;
        const tagColor = tagColorOf(event.tag_id);
        return (
          <Card
            key={event.key}
            selected={isItemSelected}
            selecting={isSelecting}
            // 태그가 있으면 카드 왼쪽에 태그 색 띠를 둘러 한눈에 구분되게 한다.
            style={tagColor ? [styles.tagged, { borderLeftColor: tagColor }] : undefined}
            onPress={(e) => {
              if (event.google_readonly) {
                if (!isSelecting) setBulkError(READONLY_NOTICE);
              } else if (isSelecting) {
                multi.handlePress(event.id, dayEventIds, e);
              } else if (hasSelectionModifier(e)) {
                setBulkError(null);
                multi.start(event.id);
              } else {
                setEditing(event);
              }
            }}
            onLongPress={() => {
              if (event.google_readonly) return;
              setBulkError(null);
              multi.start(event.id);
            }}>
            <View style={styles.eventRow}>
              {isSelecting ? <SelectionIndicator selected={isItemSelected} /> : null}
              <ThemedText type="small" themeColor="tint" style={styles.time}>
                {timeLabel(event)}
              </ThemedText>
              <View style={styles.eventBody}>
                <ThemedText type="default">{event.title}</ThemedText>
                {tag ? <TagBadge tag={tag} /> : null}
                {isRepeat(event.repeat) ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {`🔁 ${repeatLabel(event.repeat, event.series_date)}`}
                  </ThemedText>
                ) : null}
                {event.memo ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    {event.memo}
                  </ThemedText>
                ) : null}
                {event.google_readonly ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    🔒 구글 캘린더에서만 고칠 수 있어요
                  </ThemedText>
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}

      {dayTodos.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
          할 일
        </ThemedText>
      ) : null}
      {dayTodos.map((todo) => {
        // 아직 차례가 오지 않은 반복 할 일은 할 일 화면처럼 체크하지 못하게 한다.
        const locked = isWaitingRepeat(todo, today);
        const overdue = !todo.done && todo.due_date !== null && todo.due_date < today;
        const tag = todo.tag_id ? tagMap.get(todo.tag_id) : undefined;
        const tagColor = tagColorOf(todo.tag_id);
        return (
          <Card
            key={`todo:${todo.id}`}
            style={tagColor ? [styles.tagged, { borderLeftColor: tagColor }] : undefined}
            onPress={
              isSelecting
                ? undefined
                : () => router.navigate({ pathname: '/todos', params: { editId: todo.id } })
            }>
            <View style={[styles.eventRow, locked && styles.locked]}>
              <Checkbox
                checked={todo.done}
                label={
                  locked
                    ? `${todo.title} (${formatDate(todoStartOf(todo) ?? selected)}부터 체크 가능)`
                    : `${todo.title} 완료 표시`
                }
                disabled={locked || isSelecting}
                onPress={() => toggleTodo.mutate(todo)}
              />
              <View style={styles.eventBody}>
                <ThemedText
                  type="default"
                  themeColor={todo.done ? 'textSecondary' : 'text'}
                  style={todo.done && styles.doneTitle}>
                  {todo.title}
                </ThemedText>
                {tag ? <TagBadge tag={tag} /> : null}
                <ThemedText type="small" themeColor={overdue ? 'danger' : 'textSecondary'}>
                  {todoPeriodLabel(todo)}
                  {overdue ? ' · 기한 지남' : ''}
                </ThemedText>
              </View>
            </View>
          </Card>
        );
      })}

      {activeEditing ? (
        <EventForm
          event={activeEditing === 'new' ? null : activeEditing}
          defaultDate={add ? todayISO() : selected}
          onClose={closeForm}
        />
      ) : null}
    </Screen>
  );
}

function EventForm({
  event,
  defaultDate,
  onClose,
}: {
  event: CalendarEvent | null;
  defaultDate: string;
  onClose: () => void;
}) {
  const save = useSaveEvent();
  const remove = useDeleteEvent();
  const endRepeat = useEndEventRepeat();

  // 반복 일정이었는지. 반복 일정은 수정·삭제가 반복 전체에 적용된다.
  const wasRepeating = event !== null && isRepeat(event.repeat);

  const [title, setTitle] = useState(event?.title ?? '');
  // 반복 일정을 고칠 때는 누른 날짜가 아니라 원래 시작 날짜를 보여준다.
  const [date, setDate] = useState(event?.series_date ?? defaultDate);
  const [start, setStart] = useState(formatTime(event?.start_time ?? null));
  const [end, setEnd] = useState(formatTime(event?.end_time ?? null));
  const [memo, setMemo] = useState(event?.memo ?? '');
  // 반복 방법 (반복 안 하면 null)
  const [repeat, setRepeat] = useState<string | null>(wasRepeating ? event.repeat : null);
  const [tagId, setTagId] = useState<string | null>(event?.tag_id ?? null);
  const [until, setUntil] = useState<string | null>(event?.repeat_until ?? null);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!title.trim()) return '제목은 꼭 입력해 주세요.';
    if (start && !isValidTime(start)) return '시작 시간은 14:30 처럼 입력해 주세요.';
    if (end && !isValidTime(end)) return '종료 시간은 15:30 처럼 입력해 주세요.';
    if (end && !start) return '종료 시간을 쓰려면 시작 시간도 입력해 주세요.';
    if (start && end && end <= start) return '종료 시간은 시작 시간보다 늦어야 합니다.';
    if (repeat && until && until < date) return '반복 종료일은 시작 날짜보다 늦어야 합니다.';
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await save.mutateAsync({
        id: event?.id,
        title: title.trim(),
        event_date: date,
        start_time: start || null,
        end_time: end || null,
        memo: memo.trim() || null,
        repeat,
        repeat_until: repeat ? until : null,
        tag_id: tagId,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteEvent() {
    if (!event) return;
    const ok = await confirm(
      wasRepeating
        ? {
            title: '반복 일정을 삭제할까요?',
            message: '반복 일정 전체가 삭제되며, 지난 날짜의 일정도 모두 사라집니다.',
            confirmLabel: '전체 삭제',
          }
        : {
            title: '일정을 삭제할까요?',
            message: `'${event.title}' 일정을 삭제하면 다시 복구할 수 없습니다.`,
            confirmLabel: '삭제',
          },
    );
    if (!ok) return;
    try {
      await remove.mutateAsync(event.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** 누른 날짜부터 반복을 끝낸다. 그 전 날짜의 일정은 남는다. */
  async function stopFromHere() {
    if (!event) return;
    const ok = await confirm({
      title: '반복 일정을 그만할까요?',
      message: `${formatDate(event.event_date)}부터 반복이 중단됩니다. 이전 날짜의 일정은 그대로 남습니다.`,
      confirmLabel: '그만하기',
      destructive: false,
    });
    if (!ok) return;
    try {
      await endRepeat.mutateAsync({ event, from: event.event_date });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={event ? (wasRepeating ? '반복 일정 수정' : '일정 수정') : '새 일정'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending || endRepeat.isPending}
      onDelete={event ? deleteEvent : undefined}
      error={error}>
      <TextField
        label="제목 (필수)"
        value={title}
        onChangeText={setTitle}
        placeholder="어떤 일정인가요?"
        maxLength={200}
        autoFocus={!event}
      />
      {wasRepeating ? (
        <ThemedText type="small" themeColor="textSecondary">
          반복 일정을 고치면 모든 날짜에 함께 적용됩니다.
        </ThemedText>
      ) : null}
      <DateField
        label={repeat ? '시작 날짜' : '날짜'}
        value={date}
        onChange={(value) => value && setDate(value)}
      />
      <RepeatPicker value={repeat} onChange={setRepeat} anchor={date} />
      {repeat ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {`${repeatLabel(repeat, date)} 반복합니다.`}
          </ThemedText>
          <DateField label="반복 종료일 (비우면 계속)" value={until} onChange={setUntil} clearable />
        </>
      ) : null}
      <View style={styles.times}>
        <View style={styles.timeField}>
          <TextField
            label="시작 (비우면 하루 종일)"
            value={start}
            onChangeText={setStart}
            placeholder="14:30"
            maxLength={5}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.timeField}>
          <TextField
            label="종료"
            value={end}
            onChangeText={setEnd}
            placeholder="15:30"
            maxLength={5}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      <TagPicker value={tagId} onChange={setTagId} />
      <TextField label="메모" value={memo} onChangeText={setMemo} multiline />
      {wasRepeating && event ? (
        <Button
          label={`${formatDate(event.event_date)}부터 반복 그만하기`}
          variant="secondary"
          size="small"
          onPress={stopFromHere}
        />
      ) : null}
    </FormModal>
  );
}

/**
 * 날짜가 있는 할 일을 날짜별로 나눈다. 시작일 ~ 마감일의 모든 날짜에 들어간다.
 * 마감일만 있으면 마감일 하루, 시작일만 있으면 시작일 하루에 들어간다.
 * 보고 있는 달(range) 안의 날짜만 만든다.
 */
function groupTodosByDate(todos: Todo[], range: { start: string; end: string }): Map<string, Todo[]> {
  const byDate = new Map<string, Todo[]>();
  for (const todo of todos) {
    const first = todoStartOf(todo);
    if (!first) continue;
    const last = todo.due_date ?? first;
    const from = first > range.start ? first : range.start;
    const to = last < range.end ? last : range.end;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const list = byDate.get(date);
      if (list) list.push(todo);
      else byDate.set(date, [todo]);
    }
  }
  return byDate;
}

const styles = StyleSheet.create({
  // 태그 색 띠
  tagged: {
    borderLeftWidth: 6,
  },
  dayTitle: {
    fontWeight: 700,
  },
  sectionTitle: {
    fontWeight: 700,
    marginTop: Spacing.two,
  },
  doneTitle: {
    textDecorationLine: 'line-through',
  },
  // 아직 차례가 오지 않은 반복 할 일은 흐리게 보여준다.
  locked: {
    opacity: 0.6,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  time: {
    width: 96,
  },
  eventBody: {
    flex: 1,
    gap: Spacing.half,
  },
  times: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timeField: {
    flex: 1,
  },
});
