import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { DEV_USER_ID } from './local-db';
import { queryClient, startQueryPersistence, stopQueryPersistence } from './query';
import { hasSupabaseConfig, supabase } from './supabase';

const DEV_MODE_KEY = 'meoreoseo:dev-mode';

type AuthState = {
  /** 로그인되어 있으면 세션, 아니면 null */
  session: Session | null;
  /** 기기 내 데이터만 사용하는 개발 모드 여부 */
  isDevMode: boolean;
  /** 현재 활성 사용자 id (로그인 계정 또는 개발 모드) */
  userId: string | null;
  /** 기기에 저장된 로그인 정보를 아직 읽는 중이면 true */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  isDevMode: false,
  userId: null,
  loading: true,
});

let activeSession: Session | null = null;
let devModeActive = false;
let authStateListener: ((next: AuthState) => void) | null = null;

/** 현재 개발 모드(기기 내 데이터 전용)인지 알려준다. */
export function isDevMode(): boolean {
  return devModeActive;
}

/** 현재 계정에 로그인되어 있거나 개발 모드여서 데이터를 쓸 수 있는지 알려준다. */
export function hasActiveSession(): boolean {
  return activeSession !== null || devModeActive;
}

/** 현재 로그인된 사용자 id (개발 모드면 로컬 id, 로그인되지 않았으면 null). */
export function activeUserId(): string | null {
  return activeSession?.user.id ?? (devModeActive ? DEV_USER_ID : null);
}

/** 현재 로그인된 사용자 id 를 돌려준다. 로그인되지 않았으면 예외를 던진다. */
export function requireUserId(): string {
  const userId = activeUserId();
  if (!userId) throw new Error('로그인이 필요합니다.');
  return userId;
}

/**
 * 현재 세션을 확인한다. 위젯 백그라운드 실행 등 초기 로드 직후에는
 * 저장된 세션을 한 번 더 읽어 로그인 상태를 확보한다.
 */
export async function ensureActiveSession(): Promise<Session | null> {
  if (activeSession) return activeSession;
  if (devModeActive || !hasSupabaseConfig) return null;
  const { data } = await supabase.auth.getSession();
  activeSession = data.session;
  return activeSession;
}

/** 로그인 없이 기기 내 데이터만 사용하는 개발 모드로 전환한다. */
export async function enterDevMode(): Promise<void> {
  await AsyncStorage.setItem(DEV_MODE_KEY, '1');
  devModeActive = true;
  activeSession = null;
  stopQueryPersistence();
  queryClient.clear();
  await startQueryPersistence(DEV_USER_ID);
  authStateListener?.({
    session: null,
    isDevMode: true,
    userId: DEV_USER_ID,
    loading: false,
  });
}

/** 개발 모드를 종료하고 로그인 화면으로 돌아간다. (기기에 저장된 개발 모드 데이터는 유지된다.) */
export async function exitDevMode(): Promise<void> {
  await AsyncStorage.removeItem(DEV_MODE_KEY);
  devModeActive = false;
  stopQueryPersistence();
  queryClient.clear();
  authStateListener?.({
    session: activeSession,
    isDevMode: false,
    userId: activeSession?.user.id ?? null,
    loading: false,
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    session: null,
    isDevMode: false,
    userId: null,
    loading: true,
  });

  useEffect(() => {
    let currentUserId: string | undefined;
    let alive = true;
    authStateListener = (next) => {
      currentUserId = next.userId ?? undefined;
      if (alive) setState(next);
    };

    const applySession = async (session: Session | null) => {
      // 개발 모드가 켜져 있는 동안은 Supabase 미로그인 상태를 덮어쓰지 않는다.
      if (devModeActive && !session) {
        if (!alive) return;
        setState({ session: null, isDevMode: true, userId: DEV_USER_ID, loading: false });
        return;
      }
      if (session && devModeActive) {
        await AsyncStorage.removeItem(DEV_MODE_KEY).catch(() => {});
        devModeActive = false;
      }
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
      setState({
        session,
        isDevMode: false,
        userId: nextUserId ?? null,
        loading: false,
      });
    };

    let unsubscribe: (() => void) | undefined;

    (async () => {
      const savedDev = await AsyncStorage.getItem(DEV_MODE_KEY).catch(() => null);
      if (!alive) return;

      if (savedDev === '1') {
        devModeActive = true;
        currentUserId = DEV_USER_ID;
        await startQueryPersistence(DEV_USER_ID);
        if (!alive) return;
        setState({ session: null, isDevMode: true, userId: DEV_USER_ID, loading: false });
      } else if (!hasSupabaseConfig) {
        setState({ session: null, isDevMode: false, userId: null, loading: false });
      } else {
        const { data } = await supabase.auth.getSession();
        await applySession(data.session);
      }

      if (hasSupabaseConfig && alive) {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          applySession(session);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      }
    })();

    return () => {
      alive = false;
      authStateListener = null;
      unsubscribe?.();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
