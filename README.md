# 멀어서 (meoreoseo)

할 일, 일정, 습관, 메모, 가계부를 한곳에서 관리하는 생산성 앱.
코드 하나로 웹사이트와 Android 앱을 함께 만든다.

## 함께 작업하기

저장소는 GitHub 의 TEAM-COPLE 조직에 있다: https://github.com/TEAM-COPLE/meoreoseo

1. 저장소를 내려받고 아래 "실행하기"대로 준비한다. `.env.local` 에 넣을 값은 팀원에게 받는다
   (Supabase 주소와 공개용 키. APK 빌드용으로 Expo 서버의 환경 변수에 등록된 것과 같은 값이다).
2. `main` 에 바로 올리지 않는다. 작업마다 가지(branch)를 만들고 Pull Request 로 합친다.
   `main` 에 합쳐지면 웹사이트가 자동으로 다시 배포된다.
3. 올리기 전에 `npx tsc --noEmit` 과 `npx expo lint` 를 돌린다.
4. 데이터베이스 구조를 바꿀 때는 `supabase/migrations/` 에 SQL 파일을 추가한다.

비밀 값(Supabase secret key, 구글·카카오 Client Secret)은 저장소에 올리지 않는다.

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

## Android 앱 만들기 (APK)

Expo 의 클라우드 빌드(EAS Build)로 설치 파일(APK)을 만든다. 설정은 `eas.json` 에 있다.

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build -p android --profile preview
```

빌드가 끝나면 나오는 링크를 휴대폰에서 열어 설치한다.
알림처럼 휴대폰 기능을 쓰는 라이브러리를 새로 넣으면 APK 를 다시 만들어야 한다.

## 앱 업데이트 보내기 (EAS Update)

화면·기능 코드(JavaScript)만 바꿨다면 APK 를 다시 만들지 않고 휴대폰 앱으로 바로 보낼 수 있다(1~2분).
휴대폰에서 앱을 껐다 켜면 뒤에서 새 버전을 받고, 한 번 더 껐다 켜면 적용된다.

```bash
npx eas-cli@latest update --channel preview --environment preview --message "바꾼 내용 한 줄"
```

- `preview` 프로필로 만든 APK 는 `preview` 채널의 업데이트를 받는다(`eas.json`).
- 업데이트는 **같은 앱 버전**(`app.json` 의 `version`)의 APK 에만 간다(`runtimeVersion` 정책 `appVersion`).
- 아래처럼 휴대폰 쪽(네이티브) 부분이 바뀌면 업데이트로는 안 된다.
  `app.json` 의 `version` 을 올리고(예: 1.0.0 → 1.1.0) APK 를 새로 만든다.
  - 새 라이브러리 설치(`npx expo install ...`) 중 네이티브 코드가 있는 것
  - `app.json` 의 아이콘, 위젯 종류, 플러그인, 권한 같은 설정
  - `plugins/`, `scripts/patch-expo-widgets.js` 수정
- 웹은 이와 상관없이 `main` 에 합치면 Vercel 이 자동으로 배포한다.

## 알림

휴대폰 앱의 계정 화면에서 켠다. 서버가 보내는 알림이 아니라 휴대폰이 스스로 띄우는 예약 알림이다.

| 종류 | 알리는 때 |
| --- | --- |
| 아침 브리핑 | 매일 오전 7시: 날씨(최저·최고 기온, 비 올 확률, 우산 안내), 그날까지 할 일 개수, 그날 첫 일정 |
| 할 일 | 마감일 오전 9시 |
| 일정 | 시작 10분 전 (하루 종일 일정은 오전 9시) |
| 습관 | 매일 오후 9시 (그날 다 체크했으면 알리지 않음) |

- 무엇을 언제 알릴지는 `src/lib/reminders.ts` 가 계산하고, 실제 예약은 `src/lib/notifications.ts` 가 한다.
- `src/components/notification-sync.tsx` 가 데이터가 바뀔 때마다 예약을 다시 맞춘다.
- 다른 기기(웹 포함)에서 추가한 할 일·일정은 휴대폰 앱을 한 번 열어야 알림에 반영된다.
- 아침 브리핑은 3일 치를 미리 예약한다. 날씨는 앱을 열었을 때 받아 둔 3일 예보를 쓰므로,
  며칠 동안 앱을 열지 않으면 날씨 줄 없이 할 일·일정만 나온다.
- 웹에서는 알림을 지원하지 않는다.

## 반복 할 일·일정

할 일과 일정을 만들 때 "반복"에서 매일·평일·매주·매월·매년을 고를 수 있다.

- 반복 할 일: 완료하면 다음 날짜의 할 일이 자동으로 하나 생긴다. 완료를 취소하면 자동으로 생긴 다음 할 일(아직 안 한 것)은 지워진다.
  매월 31일처럼 없는 날짜는 그달의 마지막 날로 맞춘다(`repeat_start` 를 기준으로 계산해 날짜가 밀리지 않는다).
- 반복 일정: DB 에는 한 번만 저장하고, 달력에 보여줄 때 날짜마다 펼쳐서 보여준다. "반복 종료일"을 비우면 계속 반복한다.
  일정을 고치거나 지우면 반복 전체에 적용된다. "○월 ○일부터 반복 그만하기"를 누르면 그 전 날짜는 남기고 반복을 끝낸다.
- 반복 날짜 계산은 `src/lib/repeat.ts` 에 있다. DB 구조는 `supabase/migrations/20261117030000_repeat.sql`.

## 웹앱으로 설치하기 (PWA)

웹사이트를 휴대폰·컴퓨터에 앱처럼 설치할 수 있다(주소창 없이 열리고, 홈 화면에 아이콘이 생긴다).

- 안드로이드 크롬: 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"
- 아이폰 사파리: 공유 버튼 → "홈 화면에 추가"
- 컴퓨터 크롬·엣지: 주소창 오른쪽의 설치 아이콘
- 설정은 `public/manifest.json`(이름·색·아이콘)과 `public/index.html`(웹 페이지 머리말)에 있다.
  아이콘은 `public/icons/` 에 있으며 `assets/images/icon.png` 로 만들었다.

### 오류 알림

앱에서 오류가 나면(데이터 불러오기·저장 실패, 앱이 멈추는 오류) 그 휴대폰에 바로 알림을 띄운다.

- 계정 화면의 "오류 알림" 스위치로 켜고 끈다(기본: 켜짐). "알림 받기"와는 따로 동작한다.
- 자동 재시도 때문에 알림이 쏟아지지 않도록, 같은 오류는 5분에 한 번만 알린다.
- 로그인한 상태면 오류 내용을 DB 의 `error_logs` 표에도 남긴다. 사용자는 쓰기만 할 수 있고 읽을 수 없으며,
  개발자가 Supabase 대시보드(Table Editor 또는 SQL)에서 읽어 원인을 찾는다.
  ```sql
  select created_at, source, message, platform, app_version from error_logs order by created_at desc limit 20;
  ```
- 코드는 `src/lib/error-report.ts` 에 있다. 데이터 요청 오류는 `src/lib/query.ts` 가 여기로 보낸다.
- 웹은 알림 없이 DB 기록만 한다.

## 날씨

오늘 화면 맨 위에 고른 지역의 지금 날씨, 체감 기온, 최고·최저 기온, 비 올 확률을 보여준다.
비 올 확률이 50% 이상이면 우산을 챙기라고 알려준다.

- 지역은 "지역 변경"에서 이름을 직접 입력해 찾고(예: 해운대, 판교, 도쿄), 결과 중 하나를 누른다.
- 고른 지역(기본: 서울)은 로그인했으면 계정의 `user_settings` 표에 저장해 휴대폰·웹 어디서나 같고,
  로그인하지 않았으면 기기 안에 저장한다. 로그인하면 기기에서 골라 둔 지역을 계정으로 옮긴다.
- 위치 권한은 묻지 않는다.
- 날씨 출처
  - 국내 지역: 기상청 단기예보(공공데이터포털). 기상청이 실패하면 Open-Meteo 로 한 번 더 시도한다.
  - 해외 지역: [Open-Meteo](https://open-meteo.com) (API 키 없음).
- 지역 검색: OpenStreetMap [Nominatim](https://nominatim.org) (API 키 없음).
- 기상청 API 키는 앱에 넣지 않는다. Supabase 서버 함수 `kma-weather`(`supabase/functions/kma-weather/index.ts`)가
  키를 갖고 기상청에 대신 물어본다. 우리 앱의 공개용 키로 온 요청만 받는다.

### 기상청 API 키 넣기

1. [공공데이터포털](https://www.data.go.kr)에서 "기상청_단기예보 ((구)_동네예보) 조회서비스"를 활용 신청한다.
2. 마이페이지 → 개발계정 → 그 서비스에서 **일반 인증키 (Decoding)** 을 복사한다. (Encoding 키를 넣어도 동작한다.)
3. Supabase 대시보드 → Edge Functions → Secrets 에 이름 `KMA_SERVICE_KEY`, 값에 복사한 키를 넣고 저장한다.
   키는 저장소나 채팅에 올리지 않는다.
4. 키를 넣기 전에는 국내 지역도 Open-Meteo 로 보여준다.

서버 함수를 고친 뒤 다시 올리기:

```bash
npx supabase functions deploy kma-weather --no-verify-jwt
```

- 서버 함수는 오늘·내일·모레 3일 예보(`days`)도 함께 돌려준다. 아침 브리핑 알림에 쓴다.
- Nominatim 이용 규칙상 글자를 칠 때마다가 아니라 "검색"을 눌렀을 때만 찾는다.
- 코드는 `src/lib/weather.ts`, `src/hooks/use-weather.ts`, `src/components/weather-city-picker.tsx` 에 있다.

## 폴더 구조

```
src/
  app/                  화면. 파일 하나가 주소 하나다.
    _layout.tsx         가장 바깥 틀. 화면 이동과 테마(라이트/다크)를 제공한다.
    sign-in.tsx         구글·카카오 로그인 (선택)
    auth-callback.tsx   로그인을 마치고 돌아오는 화면
    account.tsx         계정 연동 및 화면 테마(라이트·다크·기기 설정), 알림 설정, 로그아웃
    (tabs)/             로그인 후의 다섯 탭 (비로그인 시 기기 저장, 로그인 시 DB 저장; Android 는 탭을 5개까지만 놓을 수 있다)
      index.tsx         오늘 (오늘 볼 할 일·일정·습관·지출을 모은 첫 화면)
      todos.tsx         할 일
      calendar.tsx      일정
      notes.tsx         메모 목록 (검색)
      money.tsx         가계부
    habits.tsx          습관 관리 (오늘 화면의 "관리"에서 연다)
    note/[id].tsx       메모장 (전체 화면 편집, 자동 저장)
  components/           여러 화면이 함께 쓰는 부품 (버튼, 입력 칸, 달력 등)
  hooks/                기능별 데이터 요청 (use-todos.ts 등)
  lib/                  Supabase 연결, 로그인 상태, 구글·카카오 로그인, 알림, 날짜·금액 도우미
  constants/theme.ts    색, 간격 (밝은 화면 / 어두운 화면)
public/                 웹에 그대로 올라가는 파일 (웹앱 설치 정보 manifest.json, 아이콘, index.html)
supabase/migrations/    데이터베이스 구조와 접근 규칙 (SQL)
supabase/functions/     Supabase 서버 함수 (kma-weather: 기상청 날씨)
```

## 데이터 보안

모든 테이블에 `user_id` 가 있고 Row Level Security 가 켜져 있다.
로그인한 사용자는 자기 데이터만 읽고 쓸 수 있고, 로그인하지 않으면 아무 데이터에도 접근할 수 없다.
규칙은 `supabase/migrations/20261115000000_init.sql` 에 있다.

### 휴대폰에 저장되는 정보

| 저장되는 것 | 저장 방식 |
| --- | --- |
| 로그인 정보(토큰) | Android Keystore 로 암호화해 저장한다(`src/lib/auth-storage.ts`, expo-secure-store). |
| 알림 설정 | 켜고 끈 값뿐이라 암호화하지 않는다. |
| Supabase 주소·공개용 키 | 앱에 들어 있지만 공개되어도 되는 값이다. 데이터는 위의 접근 규칙이 지킨다. |

- Android 백업을 껐다(`app.json` 의 `allowBackup: false`). 백업 파일로 앱 데이터를 빼낼 수 없다.
- 비밀 키(Supabase secret key, 구글·카카오 Client Secret)는 앱이나 이 저장소에 넣지 않는다.
- 웹에서는 브라우저 저장소(localStorage)에 로그인 정보를 둔다. 브라우저에는 Keystore 같은 보안 영역이 없다.
- 루팅된 휴대폰에서 관리자 권한으로 앱을 직접 들여다보는 공격까지 막지는 못한다.

## 일시정지 방지

Supabase 무료 요금제는 7일 동안 요청이 거의 없으면 프로젝트를 일시정지한다.
그래서 데이터베이스가 6시간마다 자기 API 로 작은 읽기 요청을 보낸다(`keep-alive-ping`).
설정은 `supabase/migrations/20261116000000_keep_alive.sql` 에 있다.
정지되더라도 90일 안에는 Supabase 대시보드의 **Resume project** 로 되살릴 수 있다.
