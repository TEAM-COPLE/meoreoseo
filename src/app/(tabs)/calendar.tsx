import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { MonthCalendar } from '@/components/ui/month-calendar';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  useDeleteEvent,
  useEvents,
  useSaveEvent,
  type CalendarEvent,
} from '@/hooks/use-events';
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

function timeLabel(event: CalendarEvent): string {
  if (!event.start_time) return '하루 종일';
  const start = formatTime(event.start_time);
  return event.end_time ? `${start} – ${formatTime(event.end_time)}` : start;
}

export default function CalendarScreen() {
  const [selected, setSelected] = useState(todayISO);
  const [month, setMonth] = useState(() => yearMonthOf(selected));
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);

  const events = useEvents(month);
  const marks = new Set((events.data ?? []).map((event) => event.event_date));
  const dayEvents = (events.data ?? []).filter((event) => event.event_date === selected);

  // 달을 넘기면 그 달 안의 날짜를 선택한다(이번 달이면 오늘, 아니면 1일).
  function changeMonth(next: YearMonth) {
    const today = todayISO();
    const { start, end } = monthRange(next);
    setMonth(next);
    setSelected(today >= start && today <= end ? today : start);
  }

  return (
    <Screen
      title="일정"
      action={<Button label="추가" size="small" onPress={() => setEditing('new')} />}>
      <Card>
        <MonthCalendar
          month={month}
          onChangeMonth={changeMonth}
          selected={selected}
          onSelect={setSelected}
          marks={marks}
        />
      </Card>

      <ThemedText type="default" style={styles.dayTitle}>
        {formatDate(selected)}
      </ThemedText>

      <ListStatus
        loading={events.isPending}
        error={events.error}
        empty={dayEvents.length === 0}
        emptyText="이 날에는 일정이 없습니다."
        onRetry={events.refetch}
      />

      {dayEvents.map((event) => (
        <Card key={event.id} onPress={() => setEditing(event)}>
          <View style={styles.eventRow}>
            <ThemedText type="small" themeColor="tint" style={styles.time}>
              {timeLabel(event)}
            </ThemedText>
            <View style={styles.eventBody}>
              <ThemedText type="default">{event.title}</ThemedText>
              {event.memo ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {event.memo}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </Card>
      ))}

      {editing ? (
        <EventForm
          event={editing === 'new' ? null : editing}
          defaultDate={selected}
          onClose={() => setEditing(null)}
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

  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.event_date ?? defaultDate);
  const [start, setStart] = useState(formatTime(event?.start_time ?? null));
  const [end, setEnd] = useState(formatTime(event?.end_time ?? null));
  const [memo, setMemo] = useState(event?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!title.trim()) return '제목을 입력해 주세요.';
    if (start && !isValidTime(start)) return '시작 시간은 14:30 처럼 입력해 주세요.';
    if (end && !isValidTime(end)) return '종료 시간은 15:30 처럼 입력해 주세요.';
    if (end && !start) return '종료 시간을 쓰려면 시작 시간도 입력해 주세요.';
    if (start && end && end <= start) return '종료 시간은 시작 시간보다 늦어야 합니다.';
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
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteEvent() {
    if (!event || !(await confirm('이 일정을 삭제할까요?'))) return;
    try {
      await remove.mutateAsync(event.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={event ? '일정 수정' : '새 일정'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending}
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
      <DateField label="날짜" value={date} onChange={(value) => value && setDate(value)} />
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
    </FormModal>
  );
}

const styles = StyleSheet.create({
  dayTitle: {
    fontWeight: 700,
  },
  eventRow: {
    flexDirection: 'row',
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
