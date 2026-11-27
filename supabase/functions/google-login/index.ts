/**
 * 구글 로그인 (Supabase Edge Function: google-login)
 *
 * 왜 따로 만들었나?
 *   Supabase 기본 구글 로그인은 구글에서 "bwbnhpiphwrpesipuipu.supabase.co" 로 돌아오기 때문에
 *   구글 로그인 화면에 그 긴 주소가 앱 이름처럼 보인다.
 *   그래서 구글이 우리 웹사이트 주소(https://meoreoseo.vercel.app/google-callback)로 돌아오게 하고,
 *   거기서 이 함수로 넘겨 받는다. (vercel.json 에서 state 가 "login." 으로 시작하면 이 함수로 보낸다.)
 *
 * 흐름
 *   1. 앱: POST { action: 'start', returnTo }  →  { url, nonce }
 *      - nonce 는 앱만 아는 일회용 비밀 글자. 구글에는 그 해시값만 보낸다.
 *   2. 앱이 url 을 브라우저로 연다. 사용자가 구글 계정을 고른다.
 *   3. 구글 → https://meoreoseo.vercel.app/google-callback?code=…&state=login.…
 *      → (vercel 이 넘겨줌) GET /google-login/callback
 *   4. 이 함수가 code 를 구글 신분증(id_token)으로 바꿔서 앱의 /auth-callback#google_id_token=… 으로 보낸다.
 *   5. 앱이 id_token + nonce 로 Supabase 에 로그인한다 (signInWithIdToken).
 *      nonce 는 로그인을 시작한 그 앱(브라우저)만 갖고 있으므로, 남이 시작한 로그인 결과는 쓸 수 없다.
 *
 * 비밀 값: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (구글 캘린더 연동과 같은 값을 쓴다)
 * 배포할 때 "JWT 확인"을 끈다 (로그인 전이라 로그인 정보가 없기 때문).
 */

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

/** 구글에 등록된 "승인된 리디렉션 URI" (구글 캘린더 연동과 같은 주소) */
const REDIRECT_URI = 'https://meoreoseo.vercel.app/google-callback';
/** state 앞에 붙는 글자. vercel.json 이 이걸 보고 이 함수로 보낸다. */
const STATE_PREFIX = 'login.';
/** 로그인 시작 후 이 시간 안에 돌아와야 한다. */
const STATE_MAX_AGE_MS = 10 * 60_000;
const FALLBACK_RETURN = 'https://meoreoseo.vercel.app/sign-in';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const isConfigured = () => CLIENT_ID !== '' && CLIENT_SECRET !== '';

// ───────────────────────── 작은 도우미 ─────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function redirect(to: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBase64Url(bytes: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** sha256 을 16진수 글자로 (Supabase 가 nonce 를 이 모양으로 비교한다) */
async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** state 에 서명할 열쇠. 비밀 값(CLIENT_SECRET)에서 만든다. */
let signingKey: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  signingKey ??= crypto.subtle.importKey(
    'raw',
    encoder.encode(`google-login-state:${CLIENT_SECRET}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return signingKey;
}

const PRIVATE_EXP_CALLBACK_RE =
  /^exp:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?\/--\/auth-callback$/;

/**
 * 로그인을 마치고 돌아갈 주소로 허락된 곳인지.
 * 여기로 구글 신분증이 가므로, 남이 만든 사이트(미리보기 주소 포함)는 절대 허락하지 않는다.
 */
function isAllowedReturn(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
  if (parsed.protocol === 'https:') {
    return parsed.host === 'meoreoseo.vercel.app' && parsed.pathname === '/auth-callback';
  }
  if (parsed.protocol === 'http:') {
    // 내 컴퓨터에서 개발할 때 (npx expo start)
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.pathname === '/auth-callback'
    );
  }
  // 설치된 앱(meoreoseo://auth-callback), 로컬 Expo Go(exp://<사설IP>/--/auth-callback)
  if (parsed.protocol === 'meoreoseo:') {
    return url === 'meoreoseo://auth-callback' || url === 'meoreoseo:///auth-callback';
  }
  if (parsed.protocol === 'exp:') return PRIVATE_EXP_CALLBACK_RE.test(url);
  return false;
}

type StatePayload = { r: string; t: number };

async function makeState(returnTo: string): Promise<string> {
  const payload: StatePayload = { r: returnTo, t: Date.now() };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), encoder.encode(body)));
  return `${STATE_PREFIX}${body}.${toBase64Url(signature)}`;
}

/** 서명이 맞으면 state 안의 내용을, 아니면 null */
async function readState(state: string): Promise<StatePayload | null> {
  if (!state.startsWith(STATE_PREFIX) || state.length > 2000) return null;
  const [body, signature, extra] = state.slice(STATE_PREFIX.length).split('.');
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (typeof payload?.r !== 'string' || typeof payload?.t !== 'number') return null;
    return payload as StatePayload;
  } catch {
    return null;
  }
}

/** 돌아갈 주소의 # 뒤에 결과를 붙인다. (# 뒤는 서버로 전송되지 않는다) */
function withFragment(url: string, values: Record<string, string>): string {
  return `${url}#${new URLSearchParams(values)}`;
}

// ───────────────────────── 요청 처리 ─────────────────────────

async function handleStart(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request', message: '요청 형식이 올바르지 않습니다.' }, 400);
  }
  if (body.action !== 'start') return json({ error: 'bad_request', message: '알 수 없는 요청입니다.' }, 400);
  if (!isConfigured()) {
    return json({ error: 'not_configured', message: '구글 로그인이 아직 설정되지 않았습니다.' }, 503);
  }
  if (!isAllowedReturn(body.returnTo)) {
    return json({ error: 'bad_return', message: '돌아갈 주소가 올바르지 않습니다.' }, 400);
  }

  const nonce = randomBase64Url(32);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    nonce: await sha256Hex(nonce),
    state: await makeState(body.returnTo),
  });
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, nonce });
}

async function handleCallback(url: URL): Promise<Response> {
  const saved = await readState(url.searchParams.get('state') ?? '');
  if (!saved || !isAllowedReturn(saved.r)) {
    return redirect(withFragment(FALLBACK_RETURN, { error: 'invalid_state' }));
  }
  const returnTo = saved.r;
  if (Date.now() - saved.t > STATE_MAX_AGE_MS) {
    return redirect(withFragment(returnTo, { error: 'expired' }));
  }
  if (url.searchParams.get('error')) return redirect(withFragment(returnTo, { error: 'access_denied' }));

  const code = url.searchParams.get('code');
  if (!code) return redirect(withFragment(returnTo, { error: 'no_code' }));

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof data.id_token !== 'string') {
    console.error('google code exchange failed', String(data.error ?? response.status));
    return redirect(withFragment(returnTo, { error: 'exchange_failed' }));
  }

  // 로그인에는 id_token 만 쓴다. 구글 access token 은 앱으로 보내지 않는다.
  return redirect(withFragment(returnTo, { google_id_token: data.id_token }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && url.pathname.endsWith('/callback')) return await handleCallback(url);
    if (request.method === 'POST') return await handleStart(request);
    return json({ error: 'bad_request', message: '알 수 없는 요청입니다.' }, 405);
  } catch (error) {
    console.error('unexpected', error instanceof Error ? error.message : String(error));
    return json({ error: 'server', message: '서버에서 문제가 생겼습니다.' }, 500);
  }
});
