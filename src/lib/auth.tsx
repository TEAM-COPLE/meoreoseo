import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { queryClient } from './query';
import { supabase } from './supabase';

type AuthState = {
  /** 로그인되어 있으면 세션, 아니면 null */
  session: Session | null;
  /** 기기에 저장된 로그인 정보를 아직 읽는 중이면 true */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let currentUserId: string | undefined;

    const apply = (session: Session | null) => {
      // 사용자가 바뀌면(로그아웃 포함) 이전 사용자의 데이터가 화면에 남지 않게 캐시를 비운다.
      if (currentUserId !== session?.user.id) {
        queryClient.clear();
        currentUserId = session?.user.id;
      }
      setState({ session, loading: false });
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
