import { ChevronLeft, ChevronRight, Flame, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MonthSwitcher } from '@/components/ui/month-switcher';
import { Card } from '@/components/ui/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useStudySessions, useStudySubjects } from '@/hooks/use-study';
import { useColorScheme, useTheme } from '@/hooks/use-theme';
import { useTodayISO } from '@/hooks/use-today';
import {
  addDays,
  monthGrid,
  monthRange,
  parseISODate,
  WEEKDAY_LABELS,
  yearMonthOf,
  type YearMonth,
} from '@/lib/dates';
import {
  formatDuration,
  studyStreak,
  sumSeconds,
  totalsByDate,
  totalsBySubject,
  weekStart,
  type StudyProfile,
} from '@/lib/study';
import { tagColorValue } from '@/lib/tags';

import { ProgressBar, SubjectDot } from './common';

/** 시간을 막대 위에 짧게. 예: 5400 → '1.5시간', 1200 → '20분', 20 → '0분' */
function compact(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 3600) return `${Math.round(seconds / 60)}분`;
  return `${Math.round(seconds / 360) / 10}시간`;
}

/**
 * 공부 탭의 "기록" 부분: 연속 공부 일수, 주간 막대그래프, 월간 달력, 과목별 비율.
 */
export function StudyRecordsPanel({ profile }: { profile: StudyProfile | null | undefined }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const today = useTodayISO();
  const [weekFrom, setWeekFrom] = useState(() => weekStart(today));
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(today));
  const [picked, setPicked] = useState<string | null>(null);

  const recentFrom = useMemo(() => addDays(today, -120), [today]);
  const weekTo = useMemo(() => addDays(weekFrom, 6), [weekFrom]);
  const { start: monthFrom, end: monthTo } = useMemo(() => monthRange(month), [month]);

  // 최근 120일 안에 들어오는 주간·월간 범위는 recent 쿼리 결과를 재사용해 중복 DB 조회를 없앤다.
  const weekInRecent = weekFrom >= recentFrom && weekTo <= today;
  const monthInRecent = monthFrom >= recentFrom;

  const recent = useStudySessions(recentFrom, today);
  const weekQuery = useStudySessions(weekFrom, weekTo, !weekInRecent);
  const monthlyQuery = useStudySessions(monthFrom, monthTo, !monthInRecent);
  const subjects = useStudySubjects();
  const subjectById = useMemo(
    () => new Map((subjects.data ?? []).map((subject) => [subject.id, subject])),
    [subjects.data],
  );

  const goalSeconds = (profile?.daily_goal_minutes ?? 180) * 60;

  const { recentTotals, streak, bestSeconds, thisWeekSum, thisWeekDays } = useMemo(() => {
    const rows = recent.data ?? [];
    const totals = totalsByDate(rows);
    let maxSeconds = 0;
    for (const sec of totals.values()) {
      if (sec > maxSeconds) maxSeconds = sec;
    }
    const twFrom = weekStart(today);
    let twSum = 0;
    for (const s of rows) {
      if (s.study_date >= twFrom) twSum += s.seconds;
    }
    const twDays =
      Math.round((parseISODate(today).getTime() - parseISODate(twFrom).getTime()) / 86_400_000) + 1;
    return {
      recentTotals: totals,
      streak: studyStreak(totals, today),
      bestSeconds: maxSeconds,
      thisWeekSum: twSum,
      thisWeekDays: twDays,
    };
  }, [recent.data, today]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i)),
    [weekFrom],
  );

  const { weekTotals, weekSum, weekMax } = useMemo(() => {
    if (weekInRecent) {
      let sum = 0;
      let max = goalSeconds;
      for (const day of weekDays) {
        const sec = recentTotals.get(day) ?? 0;
        sum += sec;
        if (sec > max) max = sec;
      }
      return { weekTotals: recentTotals, weekSum: sum, weekMax: max };
    }
    const rows = weekQuery.data ?? [];
    const totals = totalsByDate(rows);
    const sum = sumSeconds(rows);
    let max = goalSeconds;
    for (const day of weekDays) {
      const sec = totals.get(day) ?? 0;
      if (sec > max) max = sec;
    }
    return { weekTotals: totals, weekSum: sum, weekMax: max };
  }, [weekInRecent, recentTotals, weekQuery.data, weekDays, goalSeconds]);

  const { monthTotals, monthSum, goalDays, monthSubjects } = useMemo(() => {
    const rows = monthInRecent
      ? (recent.data ?? []).filter((s) => s.study_date >= monthFrom && s.study_date <= monthTo)
      : (monthlyQuery.data ?? []);
    const totals = totalsByDate(rows);
    const sum = sumSeconds(rows);
    let reachedDays = 0;
    for (const sec of totals.values()) {
      if (sec >= goalSeconds) reachedDays += 1;
    }
    return {
      monthTotals: totals,
      monthSum: sum,
      goalDays: reachedDays,
      monthSubjects: totalsBySubject(rows),
    };
  }, [monthInRecent, recent.data, monthlyQuery.data, monthFrom, monthTo, goalSeconds]);

  const pickedSeconds = picked ? (monthTotals.get(picked) ?? 0) : 0;

  return (
    <>
      <View style={styles.tiles}>
        <Tile label="연속 공부" value={`${streak}일`} icon={Flame} />
        <Tile label="이번 주" value={formatDuration(thisWeekSum)} />
        <Tile label="하루 평균 (이번 주)" value={formatDuration(Math.floor(thisWeekSum / thisWeekDays))} />
        <Tile label="최고 기록 (120일)" value={bestSeconds > 0 ? formatDuration(bestSeconds) : '-'} />
      </View>

      <Card>
        <View style={styles.rowBetween}>
          <ArrowButton label="이전 주" Icon={ChevronLeft} onPress={() => setWeekFrom(addDays(weekFrom, -7))} />
          <ThemedText type="smallBold">
            {parseISODate(weekFrom).getMonth() + 1}/{parseISODate(weekFrom).getDate()} ~{' '}
            {parseISODate(weekTo).getMonth() + 1}/{parseISODate(weekTo).getDate()} · {formatDuration(weekSum)}
          </ThemedText>
          <ArrowButton
            label="다음 주"
            Icon={ChevronRight}
            disabled={addDays(weekFrom, 7) > today}
            onPress={() => setWeekFrom(addDays(weekFrom, 7))}
          />
        </View>
        <View style={styles.chart}>
          {weekDays.map((day) => {
            const seconds = weekTotals.get(day) ?? 0;
            const reached = seconds >= goalSeconds;
            const isToday = day === today;
            return (
              <View key={day} style={styles.barColumn}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.barValue}>
                  {compact(seconds)}
                </ThemedText>
                <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${(seconds / weekMax) * 100}%`,
                        backgroundColor: reached ? theme.success : theme.tint,
                      },
                    ]}
                  />
                  {/* 목표 선 */}
                  <View
                    style={[
                      styles.goalLine,
                      { bottom: `${(goalSeconds / weekMax) * 100}%`, borderColor: theme.accentWarm },
                    ]}
                  />
                </View>
                <ThemedText type={isToday ? 'smallBold' : 'small'} themeColor={isToday ? 'text' : 'textSecondary'}>
                  {WEEKDAY_LABELS[parseISODate(day).getDay()]}
                </ThemedText>
              </View>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          점선은 하루 목표({formatDuration(goalSeconds)}), 초록 막대는 목표를 채운 날이에요.
        </ThemedText>
      </Card>

      <Card>
        <MonthSwitcher month={month} onChange={setMonth} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          이번 달 {formatDuration(monthSum)} · 목표 달성 {goalDays}일
        </ThemedText>
        <View style={styles.weekHeader}>
          {WEEKDAY_LABELS.map((label) => (
            <ThemedText key={label} type="small" themeColor="textSecondary" style={styles.cellLabel}>
              {label}
            </ThemedText>
          ))}
        </View>
        {monthGrid(month).map((weekRow, index) => (
          <View key={index} style={styles.weekRow}>
            {weekRow.map((day, col) => {
              if (!day) return <View key={col} style={styles.cell} />;
              const dayNum = Number(day.slice(8, 10));
              const seconds = monthTotals.get(day) ?? 0;
              const level = seconds === 0 ? 0 : Math.min(4, Math.ceil((seconds / goalSeconds) * 4));
              const alpha = ['00', '40', '70', 'A8', 'FF'][level];
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayNum}일 ${formatDuration(seconds)}`}
                  onPress={() => setPicked(picked === day ? null : day)}
                  style={[
                    styles.cell,
                    styles.cellBox,
                    {
                      backgroundColor: level > 0 ? `${theme.success}${alpha}` : theme.backgroundSelected,
                      borderColor: day === picked ? theme.text : day === today ? theme.accentWarm : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[styles.cellText, { color: level >= 3 ? '#FFFFFF' : theme.text }]}>
                    {dayNum}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ))}
        {picked ? (
          <ThemedText type="small" style={styles.centerText}>
            {parseISODate(picked).getMonth() + 1}월 {parseISODate(picked).getDate()}일 ·{' '}
            {formatDuration(pickedSeconds)}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            진할수록 목표에 가깝게 공부한 날이에요. 날짜를 누르면 시간이 보여요.
          </ThemedText>
        )}
      </Card>

      {monthSubjects.length > 0 ? (
        <Card>
          <ThemedText type="smallBold">이번 달 과목별</ThemedText>
          {monthSubjects.map(({ subjectId, seconds }) => {
            const subject = subjectById.get(subjectId) ?? null;
            return (
              <View key={subjectId || 'none'} style={styles.gapSmall}>
                <View style={styles.rowBetween}>
                  <View style={styles.rowCenter}>
                    <SubjectDot color={subject?.color ?? null} />
                    <ThemedText type="small">{subject?.name ?? '과목 없음'}</ThemedText>
                  </View>
                  <ThemedText type="small">
                    {formatDuration(seconds)} · {Math.round((seconds / Math.max(monthSum, 1)) * 100)}%
                  </ThemedText>
                </View>
                <ProgressBar
                  ratio={seconds / Math.max(monthSum, 1)}
                  color={subject ? tagColorValue(subject.color, scheme) : theme.textSecondary}
                />
              </View>
            );
          })}
        </Card>
      ) : null}
    </>
  );
}

function Tile({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <View style={styles.tileValueRow}>
        {Icon ? <Icon size={16} color={theme.tint} strokeWidth={2} /> : null}
        <ThemedText type="default" style={styles.tileValue} numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

function ArrowButton({
  label,
  Icon,
  onPress,
  disabled = false,
}: {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[styles.arrow, { backgroundColor: theme.backgroundSelected, opacity: disabled ? 0.3 : 1 }]}>
      <Icon size={16} color={theme.text} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    gap: 2,
  },
  tileValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileValue: {
    fontWeight: '800',
    fontSize: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    flexDirection: 'row',
    height: 170,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  barValue: {
    fontSize: 11,
    lineHeight: 14,
  },
  barTrack: {
    flex: 1,
    width: '70%',
    maxWidth: 34,
    borderRadius: Radius.small,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: Radius.small,
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  centerText: {
    textAlign: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  cellLabel: {
    flex: 1,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 48,
  },
  cellBox: {
    borderRadius: Radius.small,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 12,
    lineHeight: 16,
  },
  gapSmall: { gap: Spacing.one, marginTop: Spacing.one },
});
