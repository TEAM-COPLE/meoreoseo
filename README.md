# 멀어서 (meoreoseo)

할 일, 일정, 습관, 메모, 가계부를 한곳에서 관리하는 생산성 앱.
코드 하나로 웹사이트와 Android 앱을 함께 만든다.

## 사용 기술

| 영역 | 기술 |
| --- | --- |
| 언어 | TypeScript |
| 웹 + 앱 | Expo (React Native), Expo Router |
| 데이터·로그인 | 기기 내 저장(AsyncStorage) 기본 + 선택적 계정 연동(Supabase Postgres, RLS) |
| 데이터 요청 | TanStack Query |
| 화면 모드 | 라이트 모드 / 다크 모드 / 기기 설정 연동 |

## 실행하기

처음 한 번만:

```bash
npm install
```

`.env.example` 을 `.env.local` 로 복사하고 Supabase 주소와 공개용 키를 채운다.

개발 서버 시작:

```bash
npx expo start
```

- 웹: 터미널에서 `w` 를 누르거나 브라우저로 http://localhost:8081 을 연다.
- Android: 휴대폰에 Expo Go 앱을 설치하고 터미널의 QR 코드를 찍는다(PC와 같은 Wi-Fi).

코드를 고친 뒤 확인:

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

## 로그인 설정 (구글, 카카오)

로그인은 구글 계정이나 카카오 계정으로 한다. 아래 설정을 한 번 해두어야 동작한다.
두 서비스 모두 "로그인 후 돌아갈 주소"로 Supabase 의 콜백 주소를 등록한다.

```
https://<프로젝트 ID>.supabase.co/auth/v1/callback
```

### 1. Google Cloud Console

1. https://console.cloud.google.com 에서 프로젝트를 만들거나 고른다.
2. Google Auth Platform 에서 Branding(앱 이름, 지원 이메일)과 Audience 를 설정한다.
   Data Access 에는 `openid` 범위를 추가한다(이메일, 프로필 범위는 기본으로 들어 있다).
3. Clients 에서 OAuth 클라이언트를 만든다. 애플리케이션 유형은 **Web application**.
   - Authorized JavaScript origins: `http://localhost:8081` (배포 후에는 실제 웹 주소도 추가)
   - Authorized redirect URIs: `https://<프로젝트 ID>.supabase.co/auth/v1/callback`
4. 만들어진 Client ID 와 Client Secret 을 복사해 둔다.

### 2. Kakao Developers

1. https://developers.kakao.com 에서 로그인하고 앱을 만든다.
2. 앱 설정 > 앱 > 일반 의 사업자 정보에서 **비즈 앱**으로 전환한다(개인 개발자도 무료).
   이메일 동의 항목은 비즈 앱에서만 쓸 수 있다.
3. 앱 설정 > 앱 > 플랫폼 키 에서 **REST API 키**를 누른다.
   - 카카오 로그인 리다이렉트 URI 에 위의 Supabase 콜백 주소를 넣는다.
   - 카카오 로그인 Client Secret 을 켜고 코드를 복사해 둔다.
   - REST API 키가 Client ID 가 된다.
4. 제품 설정 > 카카오 로그인 > 일반 에서 사용 설정을 ON 으로 바꾼다.
5. 제품 설정 > 카카오 로그인 > 동의항목 에서 닉네임, 프로필 사진, 카카오계정(이메일)을 설정한다.

### 3. Supabase 대시보드

1. Authentication > Sign In / Providers 에서 Google 과 Kakao 를 각각 켜고
   Client ID 와 Client Secret 을 붙여 넣는다.
2. Authentication > URL Configuration 의 Redirect URLs 에 로그인 후 돌아올 주소를 등록한다.
   - `http://localhost:8081/**` (개발용 웹)
   - `meoreoseo://**` (설치한 Android 앱)
   - `exp://**` (Expo Go 로 테스트할 때)
   - 배포 후에는 실제 웹 주소도 추가한다.

Client Secret 은 Supabase 대시보드에만 넣는다. 이 저장소나 `.env` 파일에는 넣지 않는다.

## 웹 배포 (Vercel)

웹사이트는 Vercel 에 배포한다. GitHub 의 `main` 브랜치에 올리면 자동으로 다시 배포된다.

- 주소: https://meoreoseo.vercel.app
- 빌드 설정은 `vercel.json` 에 있다(`expo export -p web` 으로 만든 `dist` 폴더를 올린다).
- Supabase 주소와 공개용 키는 Vercel 프로젝트의 환경 변수에 넣어 두었다.
- 배포된 주소에서 로그인하려면 Supabase 의 Redirect URLs 에 그 주소가 등록되어 있어야 한다.

## 폴더 구조

```
src/
  app/                  화면. 파일 하나가 주소 하나다.
    _layout.tsx         가장 바깥 틀. 화면 이동과 테마(라이트/다크)를 제공한다.
    sign-in.tsx         구글·카카오 로그인 (선택)
    auth-callback.tsx   로그인을 마치고 돌아오는 화면
    account.tsx         계정 연동 및 화면 테마(라이트·다크·기기 설정)
    (tabs)/             다섯 기능 탭 (비로그인 시 기기 저장, 로그인 시 DB 저장)
      index.tsx         할 일
      calendar.tsx      일정
      habits.tsx        습관
      notes.tsx         메모 목록 (검색)
      money.tsx         가계부
    note/[id].tsx       메모장 (전체 화면 편집, 자동 저장)
  components/           여러 화면이 함께 쓰는 부품 (버튼, 입력 칸, 달력 등)
  hooks/                기능별 데이터 요청 (use-todos.ts 등)
  lib/                  Supabase 연결, 로그인 상태, 구글·카카오 로그인, 날짜·금액 도우미
  constants/theme.ts    색, 간격 (밝은 화면 / 어두운 화면)
supabase/migrations/    데이터베이스 구조와 접근 규칙 (SQL)
```

## 데이터 보안

모든 테이블에 `user_id` 가 있고 Row Level Security 가 켜져 있다.
로그인한 사용자는 자기 데이터만 읽고 쓸 수 있고, 로그인하지 않으면 아무 데이터에도 접근할 수 없다.
규칙은 `supabase/migrations/20261115000000_init.sql` 에 있다.

## 일시정지 방지

Supabase 무료 요금제는 7일 동안 요청이 거의 없으면 프로젝트를 일시정지한다.
그래서 데이터베이스가 6시간마다 자기 API 로 작은 읽기 요청을 보낸다(`keep-alive-ping`).
설정은 `supabase/migrations/20261116000000_keep_alive.sql` 에 있다.
정지되더라도 90일 안에는 Supabase 대시보드의 **Resume project** 로 되살릴 수 있다.
