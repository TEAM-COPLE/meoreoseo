import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { queryClient, startQueryPersistence, stopQueryPersistence } from './query';
import { hasSupabaseConfig, supabase } from './supabase';

type AuthState = {
  /** 로그인되어 있으면 세션, 아니면 null */
  session: Session | null;
  /** 기기에 저장된 로그인 정보를 아직 읽는 중이면 true */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true });

let activeSession: Session | null = null;

/** 현재 계정에 로그인되어 있어 데이터베이스를 쓸 수 있는지 알려준다. */
export function hasActiveSession(): boolean {
  return activeSession !== null;
}

/** 현재 로그인된 사용자 id (로그인되지 않았으면 null). */
export function activeUserId(): string | null {
  return activeSession?.user.id ?? null;
}

/** 현재 로그인된 사용자 id 를 돌려준다. 로그인되지 않았으면 예외를 던진다. */
export function requireUserId(): string {
  const userId = activeSession?.user.id;
  if (!userId) throw new Error('로그인이 필요합니다.');
  return userId;
}

/**
 * 현재 세션을 확인한다. 위젯 백그라운드 실행 등 초기 로드 직후에는
 * 저장된 세션을 한 번 더 읽어 로그인 상태를 확보한다.
 */
export async function ensureActiveSession(): Promise<Session | null> {
  if (activeSession) return activeSession;
  if (!hasSupabaseConfig) return null;
  const { data } = await supabase.auth.getSession();
  activeSession = data.session;
  return activeSession;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: hasSupabaseConfig,
  });

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    let currentUserId: string | undefined;
    let alive = true;

    const apply = async (session: Session | null) => {
      activeSession = session;
      const nextUserId = session?.user.id;
      // 사용자가 바뀌면(로그인·로그아웃 포함) 이전 데이터를 화면에 남기지 않게 캐시를 비운다.
      if (currentUserId !== nextUserId) {
        stopQueryPersistence();
        queryClient.clear();
        currentUserId = nextUserId;
        if (nextUserId) {
          await startQueryPersistence(nextUserId);
        }
      }
      if (!alive) return;
      setState({ session, loading: false });
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
