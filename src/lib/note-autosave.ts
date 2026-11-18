import { activeUserId, hasActiveSession } from './auth';
import type { Tables } from './database.types';
import { queryClient } from './query';
import { supabase } from './supabase';

type NoteRow = Tables<'notes'>;

/** 메모장에서 고칠 수 있는 값들. */
export type NoteDraft = { title: string; body: string; pinned: boolean };

/**
 * idle: 저장할 내용 없음 / dirty: 고쳤지만 아직 저장 전 / saving: 저장 중
 * saved: 저장됨 / error: 저장 실패
 */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** 입력을 멈춘 뒤 이 시간이 지나면 저장한다. */
const DELAY_MS = 1500;

function draftSignature(draft: NoteDraft): string {
  return JSON.stringify([draft.title, draft.body, draft.pinned]);
}

function sortNotes(items: NoteRow[]): NoteRow[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

function upsertNotesCache(saved: NoteRow): boolean {
  const scope = activeUserId();
  if (!scope) return false;
  const key = ['notes', scope];
  if (queryClient.getQueryData<NoteRow[]>(key) === undefined) return false;
  queryClient.setQueryData<NoteRow[]>(key, (old) => {
    if (!old) return old;
    const exists = old.some((item) => item.id === saved.id);
    const next = exists
      ? old.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...old];
    return sortNotes(next);
  });
  return true;
}

function removeFromNotesCache(id: string): boolean {
  const scope = activeUserId();
  if (!scope) return false;
  const key = ['notes', scope];
  if (queryClient.getQueryData<NoteRow[]>(key) === undefined) return false;
  queryClient.setQueryData<NoteRow[]>(key, (old) =>
    old ? old.filter((item) => item.id !== id) : old,
  );
  return true;
}

/**
 * 메모 자동 저장기.
 *
 * 글자를 칠 때마다 저장하면 요청이 너무 많아지므로,
 * 입력이 잠깐 멈췄을 때 가장 마지막 내용만 Supabase 데이터베이스에 저장한다.
 *
 * @param initialId 이미 있는 메모면 그 id, 새 메모면 null
 * @param onStatus 저장 상태가 바뀔 때마다 불린다 (화면에 "저장됨" 등을 보여주는 용도)
 * @param initialDraft 이미 있는 메모의 초기 내용 (변경 없이 flush될 때 불필요한 DB 저장 방지)
 */
export function createNoteAutosaver(
  initialId: string | null,
  onStatus: (status: SaveStatus) => void,
  initialDraft?: NoteDraft | null,
) {
  let noteId = initialId;
  let pending: NoteDraft | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let stopped = false;
  let lastSavedSig: string | null = initialId && initialDraft ? draftSignature(initialDraft) : null;

  async function save(draft: NoteDraft): Promise<NoteRow | null> {
    if (!hasActiveSession()) return null;

    if (noteId) {
      const { data, error } = await supabase
        .from('notes')
        .update({ ...draft, updated_at: new Date().toISOString() })
        .eq('id', noteId)
        .select('*')
        .single();
      if (error || !data) return null;
      return data;
    }

    const { data, error } = await supabase.from('notes').insert(draft).select('*').single();
    if (error || !data) return null;
    noteId = data.id;
    return data;
  }

  async function run() {
    while (pending && !stopped) {
      const draft = pending;
      pending = null;

      // 아직 저장한 적 없는 빈 메모는 만들지 않는다.
      if (!noteId && !draft.title.trim() && !draft.body.trim()) {
        onStatus('idle');
        continue;
      }

      const sig = draftSignature(draft);
      if (noteId && sig === lastSavedSig) {
        onStatus('saved');
        continue;
      }

      onStatus('saving');
      const saved = await save(draft);
      if (!saved) {
        // 실패한 내용을 버리지 않고 남겨 두었다가 다음 저장 때 다시 보낸다.
        pending = pending ?? draft;
        onStatus('error');
        return;
      }
      lastSavedSig = sig;
      onStatus(pending ? 'dirty' : 'saved');
      upsertNotesCache(saved);
    }
  }

  /** 기다리지 않고 지금 저장한다. 화면을 떠날 때와 "다시 시도"에서 쓴다. */
  function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    /** 고친 내용을 알려준다. 입력이 멈추면 저장된다. */
    schedule(draft: NoteDraft) {
      if (stopped) return;
      if (noteId && draftSignature(draft) === lastSavedSig) {
        pending = null;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        onStatus('saved');
        return;
      }
      pending = draft;
      onStatus('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DELAY_MS);
    },

    flush,

    /**
     * 메모를 지우고 자동 저장을 멈춘다.
     * @returns 실패했으면 오류 문장, 성공하면 null
     */
    async remove(): Promise<string | null> {
      stopped = true;
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // 진행 중인 저장이 끝나기를 기다린다(새 메모가 막 만들어지는 중일 수 있다).
      await running;

      if (!noteId) return null;
      if (!hasActiveSession()) {
        stopped = false;
        return '로그인이 필요합니다.';
      }

      const { error } = await supabase.from('notes').delete().eq('id', noteId);
      if (error) {
        stopped = false;
        return error.message;
      }
      removeFromNotesCache(noteId);
      return null;
    },
  };
}
