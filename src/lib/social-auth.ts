import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { hasSupabaseConfig, isProviderEnabled, supabase } from './supabase';

/**
 * 소셜 로그인 (구글, 카카오).
 *
 * 흐름은 두 서비스가 똑같다. 아래에서 "구글"은 카카오로 바꿔 읽어도 된다.
 * 1. Supabase 에게 "구글 로그인 주소"를 받는다.
 * 2. 그 주소를 브라우저로 연다. 사용자가 구글 계정을 고른다.
 * 3. 구글 → Supabase → 우리 앱의 /auth-callback 주소로 돌아온다.
 * 4. 주소에 담긴 인증 코드(PKCE) 또는 토큰으로 로그인 상태(세션)를 만든다.
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

/**
 * 허용된 로그인 콜백 주소인지 검증한다.
 * 외부에서 조작된 딥링크가 임의의 경로로 세션을 주입하는 것을 막는다.
 */
function isAllowedCallbackUrl(url: string): boolean {
  if (!url || url.length > 4096) return false;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return url.startsWith(`${window.location.origin}/${CALLBACK_PATH}`);
  }
  const allowedSchemes = ['meoreoseo://', 'exp://', 'http://localhost:', 'https://'];
  return (
    allowedSchemes.some((prefix) => url.startsWith(prefix)) && url.includes(CALLBACK_PATH)
  );
}

/**
 * 주소의 ? 뒤와 # 뒤에 붙은 값들을 안전하게 꺼낸다.
 * 일반 객체({}) 대신 Map 을 써서 __proto__ 등 프로토타입 오염(Prototype Pollution)을 방지한다.
 */
function readParams(url: string): ReadonlyMap<string, string> {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  const params = new Map<string, string>();
  for (const pair of `${query}&${hash}`.split('&')) {
    if (!pair) continue;
    const equals = pair.indexOf('=');
    const key = equals >= 0 ? pair.slice(0, equals) : pair;
    const value = equals >= 0 ? pair.slice(equals + 1) : '';
    try {
      const decodedKey = decodeURIComponent(key);
      const decodedValue = decodeURIComponent(value.replace(/\+/g, ' '));
      params.set(decodedKey, decodedValue);
    } catch {
      // 잘못된 형식의 값은 건너뛴다.
    }
  }
  return params;
}

/** 웹 브라우저 주소창과 기록(History)에 남은 토큰·인증 코드를 즉시 지운다. */
function scrubBrowserUrl(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      // 구형 브라우저 등에서 실패하면 무시한다.
    }
  }
}

/** Supabase·구글·카카오가 돌려준 영어 오류를 안전한 한국어 안내로 바꾼다. */
function describeError(message: string): string {
  if (message.includes('provider is not enabled') || message.includes('Unsupported provider')) {
    return '이 로그인 방식이 아직 켜져 있지 않습니다. Supabase 대시보드에서 제공자를 설정해 주세요.';
  }
  if (message.includes('access_denied')) {
    return '로그인을 취소했거나 접근이 거부되었습니다.';
  }
  if (message.includes('invalid_grant') || message.includes('expired')) {
    return '로그인 인증 시간이 만료되었습니다. 다시 시도해 주세요.';
  }
  return '로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

// 같은 주소를 두 번 처리하지 않도록 기억해 둔다.
// (휴대폰에서는 로그인 버튼 쪽과 /auth-callback 화면 쪽이 같은 주소를 동시에 받을 수 있다.)
let handledUrl: string | null = null;

/**
 * 로그인 후 돌아온 주소에서 인증 코드 또는 토큰을 꺼내 로그인 상태를 만든다.
 * @returns 실패했으면 보여줄 오류 문장, 성공했거나 할 일이 없으면 null
 */
export async function completeSignInFromUrl(url: string): Promise<string | null> {
  if (!isAllowedCallbackUrl(url)) return null;
  if (url === handledUrl) return null;
  handledUrl = url;

  const params = readParams(url);
  scrubBrowserUrl();

  const failure = params.get('error_description') || params.get('error');
  if (failure) return describeError(failure);

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? describeError(error.message) : null;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
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

  if (!hasSupabaseConfig) {
    return 'Supabase 연결 설정(.env.local)이 되어 있지 않아 계정 로그인을 사용할 수 없습니다.';
  }

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
