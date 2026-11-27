import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { hasSupabaseConfig, isProviderEnabled, supabase } from './supabase';

/**
 * 소셜 로그인 (구글, 카카오).
 *
 * 카카오
 * 1. Supabase 에게 "카카오 로그인 주소"(PKCE)를 받는다.
 * 2. 그 주소를 브라우저로 연다. 사용자가 카카오 계정을 고른다.
 * 3. 카카오 → Supabase → 우리 앱의 /auth-callback 주소로 돌아온다.
 * 4. 주소에 담긴 인증 코드(PKCE)로 로그인 상태(세션)를 만든다.
 *
 * 구글 (구글 화면에 supabase.co 주소 대신 meoreoseo.vercel.app 이 보이게)
 * 1. 서버 함수 google-login 에게 구글 로그인 주소와 일회용 글자(nonce)를 받는다.
 * 2. 구글 → meoreoseo.vercel.app/google-callback → 서버 함수 → 앱의 /auth-callback 으로 돌아온다.
 * 3. 주소에 담긴 구글 신분증(id_token)과 nonce 로 Supabase 에 로그인한다.
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
const OAUTH_WINDOW_MS = 10 * 60_000;
const OAUTH_PENDING_KEY = 'meoreoseo.oauth-pending-until';

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
 * 허용된 로그인 콜백 주소인지 엄격히 검증한다.
 * 외부에서 조작된 주소나 부분 문자열 우회(https://evil.com/?x=auth-callback 등)를 차단한다.
 */
function isAllowedCallbackUrl(url: string): boolean {
  if (!url || url.length > 4096) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return parsed.origin === window.location.origin && parsed.pathname === `/${CALLBACK_PATH}`;
  }

  if (parsed.protocol === 'meoreoseo:') {
    return (
      (parsed.host === CALLBACK_PATH && (parsed.pathname === '' || parsed.pathname === '/')) ||
      (parsed.host === '' && parsed.pathname === `/${CALLBACK_PATH}`)
    );
  }
  if (parsed.protocol === 'exp:') {
    return parsed.pathname === `/--/${CALLBACK_PATH}`;
  }
  if (parsed.protocol === 'http:') {
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.pathname === `/${CALLBACK_PATH}`
    );
  }
  if (parsed.protocol === 'https:') {
    return parsed.host === 'meoreoseo.vercel.app' && parsed.pathname === `/${CALLBACK_PATH}`;
  }
  return false;
}

/** 사용자가 직접 로그인을 시작했음을 기록해 외부 링크를 통한 세션 주입(Login CSRF)을 막는다. */
let oauthPendingUntil = 0;

function markOAuthStarted(): void {
  oauthPendingUntil = Date.now() + OAUTH_WINDOW_MS;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(OAUTH_PENDING_KEY, String(oauthPendingUntil));
    } catch {
      // 무시
    }
  }
}

function consumeOAuthStarted(): boolean {
  let until = oauthPendingUntil;
  oauthPendingUntil = 0;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const saved = Number(window.sessionStorage.getItem(OAUTH_PENDING_KEY) ?? '0');
      window.sessionStorage.removeItem(OAUTH_PENDING_KEY);
      if (Number.isFinite(saved) && saved > until) until = saved;
    } catch {
      // 무시
    }
  }
  return until > Date.now();
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

// ───────────── 구글 로그인 (우리 주소로 돌아오는 방식) ─────────────

const GOOGLE_NONCE_KEY = 'meoreoseo.google-login-nonce';
let googleNonce: string | null = null;

function saveGoogleNonce(nonce: string): void {
  googleNonce = nonce;
  if (Platform.OS === 'web') {
    try {
      window.sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
    } catch {
      // 저장소를 못 쓰는 브라우저면 메모리 값만 쓴다.
    }
  }
}

/** 로그인을 시작할 때 받은 일회용 글자(nonce)를 꺼내고 지운다. */
function takeGoogleNonce(): string | null {
  let nonce = googleNonce;
  googleNonce = null;
  if (Platform.OS === 'web') {
    try {
      nonce = nonce ?? window.sessionStorage.getItem(GOOGLE_NONCE_KEY);
      window.sessionStorage.removeItem(GOOGLE_NONCE_KEY);
    } catch {
      // 무시
    }
  }
  return nonce;
}

/** 서버 함수에게 구글 로그인 주소와 일회용 글자(nonce)를 받는다. */
async function startGoogleLogin(returnTo: string): Promise<{ url: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('google-login', {
    body: { action: 'start', returnTo },
  });
  if (
    error ||
    typeof data?.url !== 'string' ||
    typeof data?.nonce !== 'string' ||
    !data.url.startsWith('https://accounts.google.com/')
  ) {
    return { error: '구글 로그인 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  saveGoogleNonce(data.nonce);
  return { url: data.url };
}

// 같은 주소를 동시에 두 번 처리하지 않도록 진행 중인 요청만 공유하고 완료 후 비운다.
let pendingUrl: string | null = null;
let pendingPromise: Promise<string | null> | null = null;

/**
 * 로그인 후 돌아온 주소에서 인증 코드 또는 토큰을 꺼내 로그인 상태를 만든다.
 * @returns 실패했으면 보여줄 오류 문장, 성공했거나 할 일이 없으면 null
 */
export async function completeSignInFromUrl(url: string): Promise<string | null> {
  if (!isAllowedCallbackUrl(url)) return null;
  if (url === pendingUrl && pendingPromise) return pendingPromise;

  pendingUrl = url;
  const currentPromise = (async () => {
    try {
      const params = readParams(url);
      scrubBrowserUrl();

      const failure = params.get('error_description') || params.get('error');
      if (failure) return describeError(failure);

      // 구글: 우리 서버 함수(google-login)가 돌려준 구글 신분증 + 로컬 일회용 nonce 검증
      const googleIdToken = params.get('google_id_token');
      if (googleIdToken) {
        consumeOAuthStarted();
        const nonce = takeGoogleNonce();
        if (!nonce) return '로그인을 시작한 창에서 다시 시도해 주세요.';
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: googleIdToken,
          nonce,
        });
        return error ? describeError(error.message) : null;
      }

      // PKCE 코드 교환 (로컬 저장소의 code_verifier 와 일치해야만 성공)
      const code = params.get('code');
      if (code) {
        consumeOAuthStarted();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return error ? describeError(error.message) : null;
      }

      // 암시적 토큰 폴백: 반드시 이 기기/탭에서 직접 로그인을 시작한 직후에만 허용해 Login CSRF 를 차단한다.
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) return null;
      if (!consumeOAuthStarted()) {
        return '로그인을 시작한 창에서 다시 시도해 주세요.';
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return error ? describeError(error.message) : null;
    } catch {
      return '로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }
  })().finally(() => {
    if (pendingPromise === currentPromise) {
      pendingUrl = null;
      pendingPromise = null;
    }
  });

  pendingPromise = currentPromise;
  return currentPromise;
}

/**
 * 구글 또는 카카오 로그인을 시작한다.
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
  markOAuthStarted();

  if (provider === 'google') {
    const started = await startGoogleLogin(redirectTo);
    if ('error' in started) return started.error;
    if (Platform.OS === 'web') {
      window.location.assign(started.url);
      return null;
    }
    return openLoginWindow(started.url, redirectTo, name);
  }

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
  return openLoginWindow(data.url, redirectTo, name);
}

/** 휴대폰: 앱 위에 로그인 브라우저 창을 띄우고, 돌아오면 로그인을 마무리한다. */
async function openLoginWindow(loginUrl: string, redirectTo: string, name: string): Promise<string | null> {
  try {
    const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return null;
    }
    return completeSignInFromUrl(result.url);
  } catch {
    return `${name} 로그인 창을 여는 중 문제가 발생했습니다. 다시 시도해 주세요.`;
  }
}
