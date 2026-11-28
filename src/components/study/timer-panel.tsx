import { BookOpen, Pause, Plane, Play, Plus, TrainFront, Trophy, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Radius, Spacing } from '@/constants/theme';
import {
  useAddStudySubjects,
  useDeleteStudySession,
  useStudySessions,
  useStudySubjects,
} from '@/hooks/use-study';
import { useColorScheme, useTheme } from '@/hooks/use-theme';
import { useTodayISO } from '@/hooks/use-today';
import { useAuth } from '@/lib/auth';
import { confirm, errorMessage } from '@/lib/format';
import {
  formatClock,
  formatDuration,
  SAMPLE_SUBJECTS,
  splitByDay,
  sumSeconds,
  totalsBySubject,
  type StudyProfile,
  type StudySubject,
} from '@/lib/study';
import {
  cancelStudy,
  clearStudyNotice,
  resumeStudy,
  runningSeconds,
  setPauseOnLeave,
  startStudy,
  stopStudy,
  useStudyTimer,
} from '@/lib/study-timer';
import { tagColorValue } from '@/lib/tags';

import { ProgressBar, SubjectDot, useNow } from './common';
import { FlightTimerModal } from './flight-timer-modal';
import { StudySubjectForm } from './subject-form';
import { SubwayTimerModal } from './subway-timer-modal';

const LEAVE_OPTIONS = [
  { value: 'on', label: '멈추기' },
  { value: 'off', label: '계속 재기' },
] as const;

function timeOfDay(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 공부 탭의 "타이머" 부분.
 * 과목을 고르고 시작/멈춤을 누르면 오늘 공부 시간이 쌓인다.
 */
export function StudyTimerPanel({ profile }: { profile: StudyProfile | null | undefined }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { userId } = useAuth();
  const timer = useStudyTimer();
  const today = useTodayISO();
  const sessions = useStudySessions(today, today);
  const subjects = useStudySubjects();
  const addSamples = useAddStudySubjects();
  const removeSession = useDeleteStudySession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudySubject | 'new' | null>(null);
  const [flightOpen, setFlightOpen] = useState(false);
  const [subwayOpen, setSubwayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = timer.running && !timer.running.leftAt ? timer.running : null;
  const isPaused = Boolean(running?.pausedAt);
  const now = useNow(running !== null && !isPaused);
  const subjectList = subjects.data ?? [];
  const subjectById = useMemo(
    () => new Map((subjects.data ?? []).map((subject) => [subject.id, subject])),
    [subjects.data],
  );

  // 지금 도는 타이머 중 "오늘"에 해당하는 부분만 오늘 합계에 더한다(자정을 넘긴 경우).
  const runningEndMs = running?.pausedAt ?? now;
  const runningToday = running
    ? splitByDay(running.startedAt, runningEndMs)
        .filter((part) => part.date === today)
        .reduce((total, part) => total + Math.floor((part.end - part.start) / 1000), 0)
    : 0;
  const savedToday = sumSeconds(sessions.data ?? []);
  const todayTotal = savedToday + runningToday;
  const goalSeconds = (profile?.daily_goal_minutes ?? 180) * 60;
  const goalRatio = todayTotal / goalSeconds;

  // 고른 과목: 타이머가 돌면 그 과목, 아니면 마지막으로 누른 과목(없으면 첫 과목)
  const activeSubjectId = running ? running.subjectId : (selectedId ?? subjectList[0]?.id ?? null);
  const activeSubject = activeSubjectId ? (subjectById.get(activeSubjectId) ?? null) : null;

  async function toggleTimer() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (running && isPaused) {
        await resumeStudy();
      } else if (running) {
        const seconds = await stopStudy();
        if (seconds === 0) setError('5초보다 짧은 기록은 남기지 않아요.');
      } else {
        await startStudy(
          userId,
          activeSubject
            ? {
                id: activeSubject.id,
                name: activeSubject.name,
                color: tagColorValue(activeSubject.color, scheme),
              }
            : null,
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePausedTimer() {
    if (!running || busy) return;
    setBusy(true);
    setError(null);
    try {
      const seconds = await stopStudy();
      if (seconds === 0) setError('5초보다 짧은 기록은 남기지 않아요.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function discardPausedTimer() {
    if (!running || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelStudy();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickSubject(subject: StudySubject) {
    setSelectedId(subject.id);
    // 타이머가 도는 중에 다른 과목을 누르면, 지금까지를 기록하고 새 과목으로 이어서 잰다.
    if (running && userId && running.subjectId !== subject.id) {
      setBusy(true);
      setError(null);
      try {
        await startStudy(userId, {
          id: subject.id,
          name: subject.name,
          color: tagColorValue(subject.color, scheme),
        });
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    }
  }

  async function deleteSession(id: string, label: string) {
    if (
      !(await confirm({
        title: '이 기록을 지울까요?',
        message: `${label} 기록을 지우면 되돌릴 수 없어요.`,
        confirmLabel: '삭제',
      }))
    ) {
      return;
    }
    removeSession.mutate(id);
  }

  const breakdown = totalsBySubject([
    ...(sessions.data ?? []),
    ...(running && runningToday > 0 ? [{ subject_id: running.subjectId, seconds: runningToday }] : []),
  ]);

  const subjectColor = activeSubject ? tagColorValue(activeSubject.color, scheme) : theme.tint;

  return (
    <>
      {timer.notice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="눌러서 안내를 닫아요"
          onPress={clearStudyNotice}
          style={[styles.notice, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="small" themeColor="tint" style={styles.flex}>
            {timer.notice}
          </ThemedText>
          <X size={15} color={theme.tint} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <Card>
        <View style={styles.center}>
          <ThemedText type="small" themeColor="textSecondary">
            오늘 공부한 시간
          </ThemedText>
          <ThemedText style={[styles.clock, { color: theme.text }]} accessibilityLabel={formatDuration(todayTotal)}>
            {formatClock(todayTotal)}
          </ThemedText>
          {running ? (
            <View style={styles.inlineRow}>
              <BookOpen size={14} color={subjectColor} strokeWidth={2} />
              <ThemedText type="small" style={{ color: subjectColor }}>
                {isPaused
                  ? `${running.subjectName ?? '공부'} 일시정지 · 이번 ${formatClock(runningSeconds(running, now))}`
                  : `${running.subjectName ?? '공부'} 중 · 이번 ${formatClock(runningSeconds(running, now))}`}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {subjectList.length > 0 ? '과목을 고르고 시작을 눌러 보세요' : '시작을 눌러 공부 시간을 재 보세요'}
            </ThemedText>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              running ? (isPaused ? '타이머 재개하기' : '타이머 멈추기') : '타이머 시작하기'
            }
            disabled={busy || !timer.loaded}
            onPress={toggleTimer}
            style={({ pressed }) => [
              styles.bigButton,
              {
                backgroundColor: running && !isPaused ? theme.backgroundSelected : subjectColor,
                borderColor: subjectColor,
                opacity: busy || !timer.loaded ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}>
            <View style={styles.bigButtonInner}>
              {running && !isPaused ? (
                <Pause
                  size={22}
                  color={subjectColor}
                  fill={subjectColor}
                  strokeWidth={2}
                />
              ) : (
                <Play
                  size={22}
                  color={theme.background}
                  fill={theme.background}
                  strokeWidth={2}
                />
              )}
              <ThemedText
                style={[
                  styles.bigButtonText,
                  { color: running && !isPaused ? subjectColor : theme.background },
                ]}>
                {running ? (isPaused ? '재개' : '멈춤') : '시작'}
              </ThemedText>
            </View>
          </Pressable>

          {running && isPaused ? (
            <View style={styles.modeRow}>
              <Button label="기록" size="small" disabled={busy} onPress={savePausedTimer} />
              <Button
                label="취소"
                size="small"
                variant="secondary"
                disabled={busy}
                onPress={discardPausedTimer}
              />
            </View>
          ) : null}

          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="비행 타이머 열기"
              disabled={!timer.loaded}
              onPress={() => setFlightOpen(true)}
              style={({ pressed }) => [
                styles.flightBtn,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: theme.border,
                  opacity: !timer.loaded ? 0.5 : pressed ? 0.75 : 1,
                },
              ]}>
              <Plane size={15} color={theme.text} strokeWidth={1.9} />
              <ThemedText type="smallBold" numberOfLines={1}>
                {running ? '비행 경로' : '비행 모드'}
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지하철 타이머 열기"
              disabled={!timer.loaded}
              onPress={() => setSubwayOpen(true)}
              style={({ pressed }) => [
                styles.flightBtn,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: theme.border,
                  opacity: !timer.loaded ? 0.5 : pressed ? 0.75 : 1,
                },
              ]}>
              <TrainFront size={15} color={theme.text} strokeWidth={1.9} />
              <ThemedText type="smallBold" numberOfLines={1}>
                {running ? '지하철 노선' : '지하철 모드'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.goalRow}>
          <ThemedText type="small" themeColor="textSecondary">
            목표 {formatDuration(goalSeconds)}
          </ThemedText>
          {goalRatio >= 1 ? (
            <View style={styles.inlineRow}>
              <Trophy size={14} color={theme.success} strokeWidth={2} />
              <ThemedText type="smallBold" themeColor="success">
                목표 달성!
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="smallBold" themeColor="text">
              {`${Math.floor(goalRatio * 100)}%`}
            </ThemedText>
          )}
        </View>
        <ProgressBar ratio={goalRatio} />
        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}
      </Card>

      <Card>
        <View style={styles.headerRow}>
          <ThemedText type="smallBold">과목</ThemedText>
          <Button
            label="과목"
            icon={(color) => <Plus size={14} color={color} strokeWidth={2.3} />}
            size="small"
            variant="secondary"
            onPress={() => setEditing('new')}
          />
        </View>
        {subjects.data && subjectList.length === 0 ? (
          <View style={styles.gap}>
            <ThemedText type="small" themeColor="textSecondary">
              과목을 만들면 과목별로 시간이 따로 쌓여요. 과목 없이 재도 괜찮아요.
            </ThemedText>
            <Button
              label={`예시 과목 넣기 (${SAMPLE_SUBJECTS.map((s) => s.name).join('·')})`}
              size="small"
              loading={addSamples.isPending}
              onPress={() => addSamples.mutate(SAMPLE_SUBJECTS.map((s) => ({ ...s })))}
            />
          </View>
        ) : (
          <View style={styles.chips}>
            {subjectList.map((subject) => {
              const selected = subject.id === activeSubjectId;
              const color = tagColorValue(subject.color, scheme);
              return (
                <Pressable
                  key={subject.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${subject.name} 과목 고르기`}
                  accessibilityHint="길게 누르면 과목을 고치거나 지울 수 있어요"
                  accessibilityState={{ selected }}
                  onPress={() => pickSubject(subject)}
                  onLongPress={() => setEditing(subject)}
                  delayLongPress={350}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: selected ? color : theme.border,
                      backgroundColor: selected ? `${color}22` : theme.backgroundElement,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <SubjectDot color={subject.color} />
                  <ThemedText type={selected ? 'smallBold' : 'small'}>{subject.name}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
        {subjectList.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            과목을 길게 누르면 이름·색을 바꾸거나 지울 수 있어요.
          </ThemedText>
        ) : null}
      </Card>

      {breakdown.length > 0 ? (
        <Card>
          <ThemedText type="smallBold">오늘 과목별</ThemedText>
          {breakdown.map(({ subjectId, seconds }) => {
            const subject = subjectById.get(subjectId) ?? null;
            const color = subject ? tagColorValue(subject.color, scheme) : theme.textSecondary;
            return (
              <View key={subjectId || 'none'} style={styles.gapSmall}>
                <View style={styles.rowBetween}>
                  <View style={styles.rowCenter}>
                    <SubjectDot color={subject?.color ?? null} />
                    <ThemedText type="small">{subject?.name ?? '과목 없음'}</ThemedText>
                  </View>
                  <ThemedText type="smallBold">{formatDuration(seconds)}</ThemedText>
                </View>
                <ProgressBar ratio={todayTotal > 0 ? seconds / todayTotal : 0} color={color} />
              </View>
            );
          })}
        </Card>
      ) : null}

      {(sessions.data ?? []).length > 0 ? (
        <Card>
          <ThemedText type="smallBold">오늘 기록</ThemedText>
          {[...(sessions.data ?? [])].reverse().map((session) => {
            const subject = session.subject_id ? subjectById.get(session.subject_id) : undefined;
            const label = `${timeOfDay(session.started_at)}~${timeOfDay(session.ended_at)}`;
            return (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                accessibilityHint="길게 누르면 이 기록을 지울 수 있어요"
                onLongPress={() => deleteSession(session.id, label)}
                delayLongPress={400}
                style={styles.rowBetween}>
                <View style={styles.rowCenter}>
                  <SubjectDot color={subject?.color ?? null} size={8} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {label}
                  </ThemedText>
                  <ThemedText type="small">{subject?.name ?? '과목 없음'}</ThemedText>
                </View>
                <ThemedText type="small">{formatDuration(session.seconds)}</ThemedText>
              </Pressable>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary">
            잘못 남은 기록은 길게 눌러 지울 수 있어요.
          </ThemedText>
        </Card>
      ) : null}

      <Card>
        <Segmented
          label="타이머를 켠 채 다른 앱으로 나가면"
          options={LEAVE_OPTIONS}
          value={timer.pauseOnLeave ? 'on' : 'off'}
          onChange={(next) => setPauseOnLeave(next === 'on')}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {timer.pauseOnLeave
            ? '다른 앱으로 나가면 그때까지만 기록하고 멈춰요. 타이머가 도는 동안에는 화면이 꺼지지 않아요.'
            : '다른 앱을 써도 타이머가 계속 돌아요. 최대 12시간까지 기록돼요.'}
        </ThemedText>
        {timer.pendingCount > 0 ? (
          <ThemedText type="small" themeColor="accentWarm">
            인터넷 연결을 기다리는 기록이 {timer.pendingCount}개 있어요. 연결되면 자동으로 저장돼요.
          </ThemedText>
        ) : null}
      </Card>

      {editing ? (
        <StudySubjectForm
          subject={editing === 'new' ? null : editing}
          usedColors={subjectList.map((subject) => subject.color)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {flightOpen ? (
        <FlightTimerModal
          visible
          running={running !== null}
          startedAt={running?.startedAt ?? null}
          elapsedSeconds={running ? runningSeconds(running, now) : 0}
          subjectName={running ? running.subjectName : (activeSubject?.name ?? null)}
          subjectColor={subjectColor}
          busy={busy}
          onStart={toggleTimer}
          onStop={toggleTimer}
          onClose={() => setFlightOpen(false)}
        />
      ) : null}

      {subwayOpen ? (
        <SubwayTimerModal
          visible
          running={running !== null}
          startedAt={running?.startedAt ?? null}
          elapsedSeconds={running ? runningSeconds(running, now) : 0}
          subjectName={running ? running.subjectName : (activeSubject?.name ?? null)}
          subjectColor={subjectColor}
          busy={busy}
          onStart={toggleTimer}
          onStop={toggleTimer}
          onClose={() => setSubwayOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  clock: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  bigButton: {
    marginTop: Spacing.two,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modeRow: {
    marginTop: Spacing.one,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  flightBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    gap: 6,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bigButtonText: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  gap: { gap: Spacing.two },
  gapSmall: { gap: Spacing.one, marginTop: Spacing.one },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
});
