import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { syncLocalDataToSupabase } from './local-store';
import { queryClient } from './query';
import { hasSupabaseConfig, supabase } from './supabase';

type AuthState = {
  /** 로그인되어 있으면 세션, 아니면 null (비로그인 기기 저장 모드) */
  session: Session | null;
  /** 기기에 저장된 로그인 정보를 아직 읽는 중이면 true */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true });

let activeSession: Session | null = null;

/** 현재 계정에 로그인되어 있어 데이터베이스를 써야 하는지 알려준다. */
export function hasActiveSession(): boolean {
  return activeSession !== null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: hasSupabaseConfig,
  });

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    let currentUserId: string | undefined;

    const apply = (session: Session | null) => {
      activeSession = session;
      // 사용자가 바뀌면(로그인·로그아웃 포함) 이전 데이터를 화면에 남기지 않게 캐시를 비운다.
      if (currentUserId !== session?.user.id) {
        queryClient.clear();
        currentUserId = session?.user.id;
      }
      setState({ session, loading: false });

      // 비로그인 상태에서 기기에 저장해 둔 데이터가 있으면 로그인한 계정 DB로 동기화한다.
      if (session?.user.id) {
        syncLocalDataToSupabase(session.user.id)
          .then(() => {
            queryClient.invalidateQueries();
          })
          .catch(() => {});
      }
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));

    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
