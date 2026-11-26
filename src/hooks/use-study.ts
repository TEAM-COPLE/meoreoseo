import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { requireUserId, useAuth } from '@/lib/auth';
import { check } from '@/lib/query';
import type { StudyGroup, StudyProfile, StudySession, StudySubject } from '@/lib/study';
import { supabase } from '@/lib/supabase';

/**
 * 공부 타이머 데이터 읽기·저장.
 * 내 기록은 표를 직접 읽고, 다른 사람과 비교하는 화면은 서버 함수(study_group_board, study_ranking)로 읽는다.
 */

const PROFILE_KEY = ['study-profile'];
const SUBJECTS_KEY = ['study-subjects'];
const SESSIONS_KEY = ['study-sessions'];
const GROUPS_KEY = ['study-groups'];
const BOARD_KEY = ['study-board'];
const RANKING_KEY = ['study-ranking'];

/** 서버가 보낸 오류 중 사용자에게 그대로 보여 줘도 되는 한국어 안내는 그대로 쓴다. */
function friendly(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '23505' && error.message.includes('nickname')) {
    throw new Error('이미 다른 사람이 쓰는 닉네임이에요. 다른 닉네임을 골라 주세요.');
  }
  if (error.code === 'P0001') throw new Error(error.message);
  check(error);
}

// ───────────────────────── 프로필 ─────────────────────────

/** 내 공부 프로필. 아직 만들지 않았으면 null */
export function useStudyProfile() {
  const { userId, session } = useAuth();
  return useQuery({
    queryKey: [...PROFILE_KEY, userId],
    enabled: session !== null,
    queryFn: async (): Promise<StudyProfile | null> => {
      const { data, error } = await supabase
        .from('study_profiles')
        .select('*')
        .eq('user_id', requireUserId())
        .maybeSingle();
      check(error);
      return data;
    },
  });
}

export type StudyProfileValues = Pick<
  StudyProfile,
  'nickname' | 'status_message' | 'daily_goal_minutes' | 'public_ranking'
>;

export function useSaveStudyProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: PROFILE_KEY,
    mutationFn: async (values: StudyProfileValues) => {
      const { error } = await supabase
        .from('study_profiles')
        .upsert({ user_id: requireUserId(), ...values });
      friendly(error);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: PROFILE_KEY });
      client.invalidateQueries({ queryKey: BOARD_KEY });
      client.invalidateQueries({ queryKey: RANKING_KEY });
    },
  });
}

// ───────────────────────── 과목 ─────────────────────────

export function useStudySubjects() {
  const { userId, session } = useAuth();
  return useQuery({
    queryKey: [...SUBJECTS_KEY, userId],
    enabled: session !== null,
    queryFn: async (): Promise<StudySubject[]> => {
      const { data, error } = await supabase
        .from('study_subjects')
        .select('*')
        .order('sort')
        .order('created_at');
      check(error);
      return data ?? [];
    },
  });
}

export type StudySubjectValues = Pick<StudySubject, 'name' | 'color'>;

export function useSaveStudySubject() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SUBJECTS_KEY,
    mutationFn: async ({ id, values }: { id?: string; values: StudySubjectValues }) => {
      requireUserId();
      const { error } = id
        ? await supabase.from('study_subjects').update(values).eq('id', id)
        : await supabase.from('study_subjects').insert(values);
      check(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: SUBJECTS_KEY }),
  });
}

export function useAddStudySubjects() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SUBJECTS_KEY,
    mutationFn: async (list: StudySubjectValues[]) => {
      requireUserId();
      const { error } = await supabase
        .from('study_subjects')
        .insert(list.map((values, index) => ({ ...values, sort: index })));
      check(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: SUBJECTS_KEY }),
  });
}

/** 과목을 지운다. 그 과목의 기록은 남고 "과목 없음"이 된다. */
export function useDeleteStudySubject() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SUBJECTS_KEY,
    mutationFn: async (id: string) => {
      requireUserId();
      const { error } = await supabase.from('study_subjects').delete().eq('id', id);
      check(error);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: SUBJECTS_KEY });
      client.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

// ───────────────────────── 내 기록 ─────────────────────────

/** 기간(from~to, 'YYYY-MM-DD') 안의 내 공부 기록. 시작 시각 순서 */
export function useStudySessions(from: string, to: string) {
  const { userId, session } = useAuth();
  return useQuery({
    queryKey: [...SESSIONS_KEY, userId, from, to],
    enabled: session !== null,
    queryFn: async (): Promise<StudySession[]> => {
      const { data, error } = await supabase
        .from('study_sessions')
        .select('*')
        .gte('study_date', from)
        .lte('study_date', to)
        .order('started_at');
      check(error);
      return data ?? [];
    },
  });
}

/** 잘못 남은 기록을 지운다. (기록을 고치거나 새로 끼워 넣는 것은 공정한 비교를 위해 막아 두었다) */
export function useDeleteStudySession() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SESSIONS_KEY,
    mutationFn: async (id: string) => {
      requireUserId();
      const { error } = await supabase.from('study_sessions').delete().eq('id', id);
      check(error);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: SESSIONS_KEY });
      client.invalidateQueries({ queryKey: BOARD_KEY });
      client.invalidateQueries({ queryKey: RANKING_KEY });
    },
  });
}

// ───────────────────────── 스터디 그룹 ─────────────────────────

export type StudyGroupWithCount = StudyGroup & { memberCount: number };

/** 내가 들어가 있는 그룹들 */
export function useMyStudyGroups() {
  const { userId, session } = useAuth();
  return useQuery({
    queryKey: [...GROUPS_KEY, userId],
    enabled: session !== null,
    queryFn: async (): Promise<StudyGroupWithCount[]> => {
      const { data, error } = await supabase
        .from('study_groups')
        .select('*, study_group_members(count)')
        .order('created_at');
      check(error);
      return (data ?? []).map(({ study_group_members, ...group }) => ({
        ...group,
        memberCount:
          (study_group_members as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
      }));
    },
  });
}

export function useCreateStudyGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: GROUPS_KEY,
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const { data, error } = await supabase.rpc('create_study_group', {
        p_name: name,
        p_description: description,
      });
      friendly(error);
      return data as string;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useJoinStudyGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: GROUPS_KEY,
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('join_study_group', { p_code: code });
      friendly(error);
      return data as string;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useLeaveStudyGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: GROUPS_KEY,
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.rpc('leave_study_group', { p_group: groupId });
      friendly(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useKickStudyGroupMember() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: BOARD_KEY,
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const { error } = await supabase.rpc('kick_study_group_member', {
        p_group: groupId,
        p_user: userId,
      });
      friendly(error);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: BOARD_KEY });
      client.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useUpdateStudyGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: GROUPS_KEY,
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string }) => {
      const { error } = await supabase.from('study_groups').update({ name, description }).eq('id', id);
      check(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export type BoardRow = {
  user_id: string;
  nickname: string;
  status_message: string;
  total_seconds: number;
  live_started_at: string | null;
  live_subject: string | null;
  is_me: boolean;
  is_owner: boolean;
};

/** 그룹 사람들의 기간 합계. 30초마다 새로 받는다. */
export function useStudyGroupBoard(groupId: string | undefined, from: string, to: string) {
  const { userId, session } = useAuth();
  return useQuery({
    queryKey: [...BOARD_KEY, userId, groupId, from, to],
    enabled: session !== null && Boolean(groupId),
    refetchInterval: 30_000,
    staleTime: 10_000,
    queryFn: async (): Promise<BoardRow[]> => {
      const { data, error } = await supabase.rpc('study_group_board', {
        p_group: groupId!,
        p_from: from,
        p_to: to,
      });
      friendly(error);
      return (data ?? []).map((row) => ({ ...row, total_seconds: Number(row.total_seconds) }));
    },
  });
}

export type RankingRow = {
  rank: number;
  nickname: string;
  status_message: string;
  total_seconds: number;
  live_started_at: string | null;
  is_me: boolean;
};

/** 전체 랭킹 (랭킹 참여를 켠 사람들). 1분마다 새로 받는다. */
export function useStudyRanking(from: string, to: string, enabled = true) {
  const { userId, session } = useAuth();
  return useQuery({
    queryKey: [...RANKING_KEY, userId, from, to],
    enabled: enabled && session !== null,
    refetchInterval: 60_000,
    staleTime: 20_000,
    queryFn: async (): Promise<RankingRow[]> => {
      const { data, error } = await supabase.rpc('study_ranking', {
        p_from: from,
        p_to: to,
        p_limit: 100,
      });
      friendly(error);
      return (data ?? []).map((row) => ({
        ...row,
        rank: Number(row.rank),
        total_seconds: Number(row.total_seconds),
      }));
    },
  });
}
