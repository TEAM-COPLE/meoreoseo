import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { MonthCalendar } from '@/components/ui/month-calendar';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
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
import {
  formatDate,
  formatTime,
  isValidTime,
  monthRange,
  todayISO,
  yearMonthOf,
  type YearMonth,
} from '@/lib/dates';
import { confirm, errorMessage } from '@/lib/format';
import { isRepeat, REPEAT_OPTIONS, repeatLabel, type RepeatChoice } from '@/lib/repeat';

export default function CalendarScreen() {
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const [selected, setSelected] = useState(todayISO);
  const [month, setMonth] = useState(() => yearMonthOf(selected));
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const events = useEvents(month);
  const removeMany = useDeleteEvents();
  const multi = useMultiSelect();

  const activeEditing: CalendarEvent | 'new' | null =
    editing ??
    (add
      ? 'new'
      : editId
        ? ((events.data ?? []).find((e) => e.id === editId) ?? null)
        : null);

  function closeForm() {
    setEditing(null);
    if (add || editId) {
      router.setParams({ add: undefined, editId: undefined });
    }
  }
  const { marks, eventsByDate } = useMemo(() => {
    const dateMarks = new Set<string>();
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      dateMarks.add(event.event_date);
      const list = byDate.get(event.event_date);
      if (list) {
        list.push(event);
      } else {
        byDate.set(event.event_date, [event]);
      }
    }
    return { marks: dateMarks, eventsByDate: byDate };
  }, [events.data]);
  const dayEvents = eventsByDate.get(selected) ?? [];
  const dayEventIds = dayEvents.map((event) => event.id);
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
          marks={marks}
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
        empty={dayEvents.length === 0}
        emptyText="이 날에는 일정이 없습니다."
        onRetry={events.refetch}
      />

      {dayEvents.map((event) => {
        const isItemSelected = multi.isSelected(event.id);
        return (
          <Card
            key={event.key}
            selected={isItemSelected}
            selecting={isSelecting}
            onPress={(e) => {
              if (isSelecting) {
                multi.handlePress(event.id, dayEventIds, e);
              } else if (hasSelectionModifier(e)) {
                setBulkError(null);
                multi.start(event.id);
              } else {
                setEditing(event);
              }
            }}
            onLongPress={() => {
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
  const [repeat, setRepeat] = useState<RepeatChoice>(
    wasRepeating ? (event?.repeat as RepeatChoice) : 'none',
  );
  const [until, setUntil] = useState<string | null>(event?.repeat_until ?? null);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!title.trim()) return '제목을 입력해 주세요.';
    if (start && !isValidTime(start)) return '시작 시간은 14:30 처럼 입력해 주세요.';
    if (end && !isValidTime(end)) return '종료 시간은 15:30 처럼 입력해 주세요.';
    if (end && !start) return '종료 시간을 쓰려면 시작 시간도 입력해 주세요.';
    if (start && end && end <= start) return '종료 시간은 시작 시간보다 늦어야 합니다.';
    if (repeat !== 'none' && until && until < date) return '반복 종료일은 시작 날짜보다 늦어야 합니다.';
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
        repeat: repeat === 'none' ? null : repeat,
        repeat_until: repeat === 'none' ? null : until,
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
        label="제목"
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
        label={repeat === 'none' ? '날짜' : '시작 날짜'}
        value={date}
        onChange={(value) => value && setDate(value)}
      />
      <Segmented label="반복" options={REPEAT_OPTIONS} value={repeat} onChange={setRepeat} />
      {repeat !== 'none' ? (
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

const styles = StyleSheet.create({
  dayTitle: {
    fontWeight: 700,
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
