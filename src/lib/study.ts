import type { Tables } from './database.types';
import { addDays, parseISODate, toISODate, todayISO } from './dates';

/**
 * 공부 타이머 도우미.
 * 화면이나 서버를 쓰지 않는 순수한 계산만 모아 둔다.
 */

export type StudyProfile = Tables<'study_profiles'>;
export type StudySubject = Tables<'study_subjects'>;
export type StudySession = Tables<'study_sessions'>;
export type StudyGroup = Tables<'study_groups'>;

/** 비교 기간: 오늘 / 이번 주 / 이번 달 */
export type StudyPeriod = 'day' | 'week' | 'month';

export const PERIOD_OPTIONS = [
  { value: 'day', label: '오늘' },
  { value: 'week', label: '이번 주' },
  { value: 'month', label: '이번 달' },
] as const;

/** 한 조각의 기록은 최대 12시간까지 (서버 규칙과 같다) */
export const MAX_SEGMENT_SECONDS = 12 * 60 * 60;
/** 이보다 짧은 기록은 실수로 누른 것으로 보고 버린다. */
export const MIN_SEGMENT_SECONDS = 5;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

/** 초를 시계 모양으로. 예: 3725 → '01:02:05' */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 초를 짧은 글로. 예: 3725 → '1시간 2분', 50 → '50초', 0 → '0분' */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0 && minutes === 0) return s > 0 ? `${s}초` : '0분';
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

/** 이번 주 월요일 */
export function weekStart(iso: string): string {
  const day = parseISODate(iso).getDay(); // 0=일
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

/** 기간의 첫날과 마지막 날. 예: 'week' → 월요일 ~ 일요일 */
export function periodRange(period: StudyPeriod, iso = todayISO()): { from: string; to: string } {
  if (period === 'day') return { from: iso, to: iso };
  if (period === 'week') {
    const from = weekStart(iso);
    return { from, to: addDays(from, 6) };
  }
  const date = parseISODate(iso);
  const from = toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
  const to = toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return { from, to };
}

/**
 * 시작~끝 시간을 날짜가 바뀌는 자정마다 잘라 준다.
 * 밤 11시부터 새벽 1시까지 공부하면 어제 1시간, 오늘 1시간으로 나뉜다.
 */
export function splitByDay(startMs: number, endMs: number): { date: string; start: number; end: number }[] {
  const parts: { date: string; start: number; end: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const day = new Date(cursor);
    const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    const end = Math.min(endMs, nextMidnight);
    parts.push({ date: toISODate(day), start: cursor, end });
    cursor = end;
  }
  return parts;
}

/** 기록들의 합계(초) */
export function sumSeconds(sessions: readonly Pick<StudySession, 'seconds'>[]): number {
  return sessions.reduce((total, session) => total + session.seconds, 0);
}

/** 날짜별 합계. 예: Map { '2026-11-25' => 5400 } */
export function totalsByDate(
  sessions: readonly Pick<StudySession, 'study_date' | 'seconds'>[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    totals.set(session.study_date, (totals.get(session.study_date) ?? 0) + session.seconds);
  }
  return totals;
}

/** 과목별 합계. 과목이 없는 기록은 '' 에 모은다. 많이 한 과목이 먼저 온다. */
export function totalsBySubject(
  sessions: readonly Pick<StudySession, 'subject_id' | 'seconds'>[],
): { subjectId: string; seconds: number }[] {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const key = session.subject_id ?? '';
    totals.set(key, (totals.get(key) ?? 0) + session.seconds);
  }
  return [...totals.entries()]
    .map(([subjectId, seconds]) => ({ subjectId, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * 며칠 연속으로 공부했는지. 오늘 아직 안 했으면 어제까지 이어진 날수를 센다.
 * @param minSeconds 이만큼은 해야 "공부한 날"로 친다 (기본 10분)
 */
export function studyStreak(totals: ReadonlyMap<string, number>, today = todayISO(), minSeconds = 600): number {
  let day = (totals.get(today) ?? 0) >= minSeconds ? today : addDays(today, -1);
  let count = 0;
  while ((totals.get(day) ?? 0) >= minSeconds) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/** 지금 공부 중인 사람의 이번 조각 경과 시간(초). 공부 중이 아니면 0 */
export function liveSeconds(liveStartedAt: string | null, nowMs: number): number {
  if (!liveStartedAt) return 0;
  const started = new Date(liveStartedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.min(MAX_SEGMENT_SECONDS, Math.max(0, Math.floor((nowMs - started) / 1000)));
}

/**
 * 비교 화면에 보일 합계: 저장된 합계 + (기간 안에 시작한) 지금 공부 중인 시간.
 * 그래서 다른 사람이 공부하는 동안 숫자가 실시간으로 올라간다.
 */
export function boardSeconds(
  row: { total_seconds: number; live_started_at: string | null },
  range: { from: string; to: string },
  nowMs: number,
): number {
  if (!row.live_started_at) return row.total_seconds;
  const startedDate = toISODate(new Date(row.live_started_at));
  if (startedDate < range.from || startedDate > range.to) return row.total_seconds;
  return row.total_seconds + liveSeconds(row.live_started_at, nowMs);
}

/** 닉네임 검사. 문제가 있으면 안내 문장, 괜찮으면 null */
export function nicknameProblem(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (trimmed.length < NICKNAME_MIN) return `닉네임은 ${NICKNAME_MIN}글자 이상이어야 해요.`;
  if (trimmed.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}글자까지 쓸 수 있어요.`;
  return null;
}

/** 등수 표시. 1~3등은 메달 */
export function rankLabel(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

/** 처음 쓰는 사람에게 넣어 줄 수 있는 예시 과목 */
export const SAMPLE_SUBJECTS = [
  { name: '국어', color: 'red' },
  { name: '수학', color: 'blue' },
  { name: '영어', color: 'green' },
] as const;
