import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './auth-storage';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Supabase 환경 변수가 설정되어 있는지 여부. */
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

/**
 * 앱 전체에서 쓰는 Supabase 연결.
 * 로그인 정보는 기기에 저장되어 앱을 다시 열어도 유지된다.
 * 휴대폰에서는 암호화해서 저장한다(auth-storage.ts).
 */
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      storage: authStorage,
      flowType: 'pkce',
      autoRefreshToken: hasSupabaseConfig,
      persistSession: hasSupabaseConfig,
      // 웹에서는 구글·카카오 로그인 후 돌아온 주소에 담긴 토큰을 자동으로 읽는다.
      // 휴대폰에서는 src/lib/social-auth.ts 가 직접 처리한다.
      detectSessionInUrl: Platform.OS === 'web' && hasSupabaseConfig,
    },
  },
);

/**
 * Supabase 프로젝트에 해당 로그인 방식(구글, 카카오)이 켜져 있는지 확인한다.
 * 꺼진 상태로 로그인을 시작하면 영어 오류만 적힌 빈 페이지로 가게 되므로 미리 물어본다.
 * 확인 자체에 실패하면(인터넷 문제 등) 켜져 있다고 보고 진행한다.
 */
export async function isProviderEnabled(provider: 'google' | 'kakao'): Promise<boolean> {
  if (!hasSupabaseConfig) return false;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseKey as string },
    });
    if (!response.ok) return true;
    const settings: { external?: Record<string, boolean> } = await response.json();
    return settings.external?.[provider] !== false;
  } catch {
    return true;
  }
}

// 휴대폰에서는 앱이 화면에 보일 때만 로그인 토큰을 자동 갱신한다.
if (Platform.OS !== 'web' && hasSupabaseConfig) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
