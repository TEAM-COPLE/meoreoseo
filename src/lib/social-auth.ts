import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { isProviderEnabled, supabase } from './supabase';

/**
 * 소셜 로그인 (구글, 카카오).
 *
 * 흐름은 두 서비스가 똑같다. 아래에서 "구글"은 카카오로 바꿔 읽어도 된다.
 * 1. Supabase 에게 "구글 로그인 주소"를 받는다.
 * 2. 그 주소를 브라우저로 연다. 사용자가 구글 계정을 고른다.
 * 3. 구글 → Supabase → 우리 앱의 /auth-callback 주소로 돌아온다.
 *    이때 주소 끝(# 뒤)에 로그인 토큰이 붙어 온다.
 * 4. 그 토큰으로 로그인 상태(세션)를 만든다.
 *
 * 웹에서는 페이지 전체가 구글로 이동했다가 돌아오고(3~4단계는 Supabase 가 자동 처리),
 * 휴대폰에서는 앱 위에 브라우저 창이 떴다가 닫힌다.
 */

/** 지원하는 로그인 서비스. 값은 Supabase 가 쓰는 이름과 같아야 한다. */
export type SocialProvider = 'google' | 'kakao';

/** 안내 문장에 쓸 한글 이름 */
const PROVIDER_NAMES: Record<SocialProvider, string> = {
  google: '구글',
  kakao: '카카오',
};

/** 로그인 후 돌아올 화면 이름. src/app/auth-callback.tsx 와 맞춰야 한다. */
const CALLBACK_PATH = 'auth-callback';

/** 웹에서 로그인 창이 팝업으로 열렸을 때 마무리해 준다. 다른 경우에는 아무 일도 하지 않는다. */
WebBrowser.maybeCompleteAuthSession();

/** 로그인 후 돌아올 주소. Supabase 대시보드의 Redirect URLs 에 등록되어 있어야 한다. */
function callbackUrl(): string {
  if (Platform.OS === 'web') {
    return `${window.location.origin}/${CALLBACK_PATH}`;
  }
  // 설치된 앱: meoreoseo://auth-callback, Expo Go: exp://.../--/auth-callback
  return Linking.createURL(CALLBACK_PATH);
}

/** 주소의 ? 뒤와 # 뒤에 붙은 값들을 꺼낸다. 예: '...#access_token=abc' → { access_token: 'abc' } */
function readParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  const params: Record<string, string> = {};
  for (const pair of `${query}&${hash}`.split('&')) {
    if (!pair) continue;
    const equals = pair.indexOf('=');
    const key = equals >= 0 ? pair.slice(0, equals) : pair;
    const value = equals >= 0 ? pair.slice(equals + 1) : '';
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      // 잘못된 형식의 값은 건너뛴다.
    }
  }
  return params;
}

/** Supabase·구글·카카오가 돌려준 영어 오류를 한국어 안내로 바꾼다. */
function describeError(message: string): string {
  if (message.includes('provider is not enabled') || message.includes('Unsupported provider')) {
    return '이 로그인 방식이 아직 켜져 있지 않습니다. Supabase 대시보드에서 제공자를 설정해 주세요.';
  }
  if (message.includes('access_denied')) {
    return '로그인을 취소했거나 접근이 거부되었습니다.';
  }
  return message;
}

// 같은 주소를 두 번 처리하지 않도록 기억해 둔다.
// (휴대폰에서는 로그인 버튼 쪽과 /auth-callback 화면 쪽이 같은 주소를 동시에 받을 수 있다.)
let handledUrl: string | null = null;

/**
 * 로그인 후 돌아온 주소에서 토큰을 꺼내 로그인 상태를 만든다.
 * @returns 실패했으면 보여줄 오류 문장, 성공했거나 할 일이 없으면 null
 */
export async function completeSignInFromUrl(url: string): Promise<string | null> {
  if (url === handledUrl) return null;
  handledUrl = url;

  const params = readParams(url);

  const failure = params.error_description || params.error;
  if (failure) return describeError(failure);

  if (!params.access_token || !params.refresh_token) return null;

  const { error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  return error ? describeError(error.message) : null;
}

/**
 * 구글 또는 카카오 로그인을 시작한다.
 * @returns 실패했으면 보여줄 오류 문장, 아니면 null.
 *          웹에서는 성공하면 페이지가 로그인 사이트로 이동하므로 돌아오지 않는다.
 */
export async function signInWith(provider: SocialProvider): Promise<string | null> {
  const name = PROVIDER_NAMES[provider];

  if (!(await isProviderEnabled(provider))) {
    return `${name} 로그인이 아직 켜져 있지 않습니다. Supabase 대시보드에서 설정해 주세요.`;
  }

  const redirectTo = callbackUrl();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    return error ? describeError(error.message) : null;
  }

  // 휴대폰: 주소만 받아서(skipBrowserRedirect) 앱 위에 브라우저 창을 직접 띄운다.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return describeError(error.message);
  if (!data.url) return `${name} 로그인 주소를 받지 못했습니다.`;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    // 사용자가 창을 닫은 경우. 오류로 보지 않는다.
    return null;
  }
  return completeSignInFromUrl(result.url);
}
