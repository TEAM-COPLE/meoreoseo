/**
 * 가계부 자동 입력에 쓰는 계산들 (화면·데이터베이스와 상관없는 순수 함수만 모았다).
 *  - 결제 알림 글자에서 금액·지출/수입·가게 이름 골라내기
 *  - 가게 이름으로 분류 짐작하기
 *  - 같은 결제가 두 번 들어오지 않게 중복 찾기
 */

import { toISODate } from './dates';

export type AutoKind = 'expense' | 'income';
export type AutoSource = 'notification' | 'import';

/** 자동으로 만든 가계부 내역 한 건 (저장하기 전) */
export type AutoEntry = {
  kind: AutoKind;
  /** 원 단위 양수 */
  amount: number;
  /** 가게·받는 사람 이름 (모르면 null) */
  merchant: string | null;
  /** 'YYYY-MM-DD' */
  occurredOn: string;
  /** 결제 시각 (ISO 문자열, 모르면 null) */
  occurredAt: string | null;
  source: AutoSource;
  /** 같은 것이 두 번 저장되지 않게 하는 이름 */
  externalId: string;
  /** 어디서 왔는지 (알림을 보낸 앱 이름 등). 같은 묶음 안 중복을 가릴 때 쓴다. */
  origin?: string;
};

/** 중복을 비교할 때 필요한 칸만 (이미 저장된 내역도 이 모양으로 비교한다) */
export type Comparable = {
  kind: string;
  amount: number;
  occurredOn: string;
  occurredAt: string | null;
};

// ───────────────────────── 결제 알림 읽기 ─────────────────────────

export type PaymentNotificationInput = {
  packageName: string;
  title: string;
  text: string;
  /** 알림이 온 시각 (밀리초) */
  postTime: number;
};

/** 결제 알림이 아닌 메신저 앱 (카카오톡, 라인, 텔레그램, 문자 대화 등) */
const MESSENGER_RE =
  /^(com\.kakao\.talk|jp\.naver\.line\.android|org\.telegram\.messenger|com\.facebook\.orca|com\.instagram\.android|com\.discord|com\.whatsapp)$/;

const AMOUNT_RE = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/g;
/** 결제가 아닌 알림 (광고, 청구 예정, 실패 등) */
const SKIP_RE = /광고|이벤트|혜택|쿠폰|청구\s*예정|결제\s*예정|명세서|한도|실패|거절|잔액\s*부족|미납|연체/;
/** 결제 취소·환불: 돈이 돌아오므로 수입으로 본다 */
const REFUND_RE = /취소|환불|환급/;
const INCOME_RE = /입금|받았|님이[^\n]*보냈|캐시백|이자\s*지급|급여/;
const EXPENSE_RE = /결제|승인|출금|송금|이체|사용|납부|님에게|에게[^\n]*보냈/;

/** 금액 앞에 이런 말이 있으면 결제 금액이 아니다 (예: "잔액 120,000원") */
const NOT_PAYMENT_AMOUNT_RE = /(잔액|누적|한도|이용가능|남은|포인트|적립|할인)\s*:?\s*$/;

/** 알림 글자에서 가게 이름을 고를 때 지우는 낱말 */
const NOISE_RE =
  /\[[^\]]*\]|\([^)]*\)|[0-9]{1,3}(?:,[0-9]{3})+\s*원|[0-9]+\s*원|[0-9]{1,2}\/[0-9]{1,2}|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?|[0-9]{4}[.\-/][0-9]{1,2}[.\-/][0-9]{1,2}|\*+[0-9]*|결제\s*취소|승인\s*취소|결제(?:했어요|되었습니다|완료)?|승인|일시불|할부\s*[0-9]*\s*개월|[가-힣A-Za-z]*카드|[가-힣]\*+[가-힣]|취소되었어요|취소됐어요|출금|입금|송금|이체|완료|사용|누적|잔액|토스뱅크|토스페이|토스|Web발신|님이|님에게|님|보냈어요|받았어요|했어요|되었습니다|합니다|입니다|원/g;

function toAmount(text: string): number {
  return Number(text.replace(/,/g, ''));
}

/** 알림 글자에서 결제 금액을 찾는다. "잔액 ○○원" 같은 금액은 건너뛴다. */
function findAmount(text: string): number | null {
  for (const match of text.matchAll(AMOUNT_RE)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index ?? 0);
    if (NOT_PAYMENT_AMOUNT_RE.test(before)) continue;
    const amount = toAmount(match[1]);
    if (Number.isSafeInteger(amount) && amount > 0) return amount;
  }
  return null;
}

/** 알림 글자에서 가게 이름을 짐작한다. 못 찾으면 null */
export function guessMerchant(title: string, text: string): string | null {
  // "12,000원 결제 | 스타벅스" 처럼 | 뒤에 가게 이름이 오는 경우가 많다.
  const candidates: string[] = [];
  for (const line of [text, title]) {
    const parts = line.split(/[|｜\n]/).map((part) => part.trim());
    candidates.push(...parts.reverse());
  }
  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(NOISE_RE, ' ')
      .replace(/[·:,.~!?]+/g, ' ')
      .replace(/\s+/g, ' ')
      // 지우고 남은 조사(을·를·이·가 등)를 뗀다.
      .replace(/(^|\s)(을|를|이|가|은|는|의|에|에서|으로|로)(?=\s|$)/g, ' ')
      // "맘스터치에서 결제"처럼 이름에 붙은 "에서/에게"도 뗀다.
      .replace(/(\S{2,})(에서|에게)(?=\s|$)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    // 한두 글자는 이름보다는 남은 조각일 때가 많다. 숫자만 남은 것도 버린다.
    if (cleaned.length >= 2 && cleaned.length <= 40 && !/^[0-9\s]+$/.test(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

/**
 * 결제 알림 하나를 가계부 내역으로 바꾼다. 결제·입금 알림이 아니면 null.
 * 예) "토스뱅크 체크카드 12,000원 결제 | 스타벅스 강남점" → 지출 12,000원, 스타벅스 강남점
 */
export function parsePaymentNotification(input: PaymentNotificationInput): AutoEntry | null {
  // 메신저 대화 속 "결제했어?" 같은 말은 결제가 아니다 (휴대폰 쪽에서도 거르지만 한 번 더).
  if (MESSENGER_RE.test(input.packageName)) return null;
  const joined = `${input.title}\n${input.text}`;
  if (SKIP_RE.test(joined)) return null;

  const amount = findAmount(joined);
  if (amount === null) return null;

  let kind: AutoKind | null = null;
  if (REFUND_RE.test(joined)) kind = 'income';
  else if (INCOME_RE.test(joined)) kind = 'income';
  else if (EXPENSE_RE.test(joined)) kind = 'expense';
  if (!kind) return null;

  const at = new Date(input.postTime);
  if (Number.isNaN(at.getTime())) return null;

  const merchant = guessMerchant(input.title, input.text);
  return {
    kind,
    amount,
    merchant: REFUND_RE.test(joined) ? `결제 취소${merchant ? ` · ${merchant}` : ''}` : merchant,
    occurredOn: toISODate(at),
    occurredAt: at.toISOString(),
    source: 'notification',
    externalId: `noti:${input.packageName}:${input.postTime}:${amount}`.slice(0, 200),
    origin: input.packageName,
  };
}

// ───────────────────────── 분류 짐작 ─────────────────────────

const EXPENSE_CATEGORY_RULES: [RegExp, string][] = [
  [/카페|커피|스타벅스|투썸|이디야|메가|빽다방|폴바셋|베이커리|빵|파리바게뜨|뚜레쥬르|식당|김밥|치킨|피자|버거|맥도날드|롯데리아|맘스터치|배달의민족|배민|요기요|쿠팡이츠|편의점|GS25|CU|세븐일레븐|이마트24|분식|국밥|고기|횟집|마라|떡볶이/i, '식비'],
  [/택시|카카오T|버스|지하철|교통|티머니|코레일|KTX|SRT|주유|GS칼텍스|SK에너지|S-OIL|현대오일|주차|하이패스|따릉이/i, '교통'],
  [/월세|관리비|전기|가스|수도|도시가스|한전|통신|SKT|KT|LG유플러스|인터넷/i, '주거'],
  [/병원|의원|약국|치과|한의원|안과|피부과|정형외과/i, '의료'],
  [/CGV|메가박스|롯데시네마|영화|넷플릭스|유튜브|멜론|스포티파이|왓챠|티빙|웨이브|도서|서점|교보|예스24|알라딘|공연|전시|게임|스팀|PC방|노래방/i, '문화'],
  [/쿠팡|무신사|지마켓|G마켓|11번가|옥션|네이버페이|SSG|올리브영|다이소|이마트|홈플러스|롯데마트|코스트코|백화점|아울렛|ABC마트|유니클로/i, '쇼핑'],
];

const INCOME_CATEGORY_RULES: [RegExp, string][] = [
  [/급여|월급|상여|보너스/, '급여'],
  [/용돈/, '용돈'],
];

/** 가게 이름으로 분류를 짐작한다. 모르면 '기타' */
export function guessCategory(merchant: string | null, kind: AutoKind): string {
  if (!merchant) return '기타';
  const rules = kind === 'expense' ? EXPENSE_CATEGORY_RULES : INCOME_CATEGORY_RULES;
  for (const [pattern, category] of rules) {
    if (pattern.test(merchant)) return category;
  }
  return '기타';
}

// ───────────────────────── 중복 찾기 ─────────────────────────

/** 두 기록의 시각이 이만큼 안이면 같은 결제로 본다 (알림이 조금 늦게 오는 것을 생각해서) */
export const SAME_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

function parseTimeMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function paymentBucketKey(item: Pick<Comparable, 'kind' | 'amount'>): string {
  return `${item.kind}:${item.amount}`;
}

function isSameTimeOrDate(
  aOn: string,
  aMs: number | null,
  bOn: string,
  bMs: number | null,
): boolean {
  if (aMs !== null && bMs !== null) {
    return Math.abs(aMs - bMs) <= SAME_PAYMENT_WINDOW_MS;
  }
  return aOn === bOn;
}

/**
 * 같은 결제인지. 지출/수입과 금액이 같고,
 *  - 둘 다 시각을 알면 10분 안,
 *  - 하나라도 시각을 모르면 같은 날짜.
 */
export function isSamePayment(a: Comparable, b: Comparable): boolean {
  if (a.kind !== b.kind || a.amount !== b.amount) return false;
  return isSameTimeOrDate(
    a.occurredOn,
    parseTimeMs(a.occurredAt),
    b.occurredOn,
    parseTimeMs(b.occurredAt),
  );
}

/**
 * 새로 들어온 내역에서 중복을 걸러낸다.
 * - 이미 저장된 내역 하나는 새 내역 하나와만 짝지어진다(같은 날 같은 금액을 두 번 쓴 경우를 지키려고).
 * - 같은 묶음 안에서는, 서로 다른 앱이 같은 결제를 알린 것(예: 토스와 카드사 앱)만 하나로 친다.
 *   엑셀의 같은 금액 여러 줄은 실제로 여러 번 쓴 것일 수 있어서 그대로 둔다.
 */
export function splitDuplicates<T extends AutoEntry>(
  incoming: T[],
  existing: Comparable[],
): { fresh: T[]; duplicates: T[] } {
  type ExistingSlot = { item: Comparable; ms: number | null; used: boolean };
  type SeenNotiSlot = { entry: T; ms: number | null };

  const poolByKey = new Map<string, ExistingSlot[]>();
  for (const item of existing) {
    const key = paymentBucketKey(item);
    let bucket = poolByKey.get(key);
    if (!bucket) {
      bucket = [];
      poolByKey.set(key, bucket);
    }
    bucket.push({ item, ms: parseTimeMs(item.occurredAt), used: false });
  }

  const fresh: T[] = [];
  const duplicates: T[] = [];
  // 이번 묶음에서 이미 본 알림 (중복으로 빠진 것 포함)
  const seenNotiByKey = new Map<string, SeenNotiSlot[]>();

  for (const entry of incoming) {
    const key = paymentBucketKey(entry);
    const ms = parseTimeMs(entry.occurredAt);

    if (entry.source === 'notification') {
      let seenBucket = seenNotiByKey.get(key);
      const sameInBatch =
        seenBucket !== undefined &&
        seenBucket.some(
          (seen) =>
            seen.entry.origin !== entry.origin &&
            isSameTimeOrDate(seen.entry.occurredOn, seen.ms, entry.occurredOn, ms),
        );
      if (!seenBucket) {
        seenBucket = [];
        seenNotiByKey.set(key, seenBucket);
      }
      seenBucket.push({ entry, ms });
      if (sameInBatch) {
        duplicates.push(entry);
        continue;
      }
    }

    const poolBucket = poolByKey.get(key);
    const match = poolBucket?.find(
      (slot) =>
        !slot.used && isSameTimeOrDate(slot.item.occurredOn, slot.ms, entry.occurredOn, ms),
    );
    if (match) {
      match.used = true;
      duplicates.push(entry);
      continue;
    }
    fresh.push(entry);
  }
  return { fresh, duplicates };
}

/**
 * 이미 저장된 내역 중 같은 결제로 보이는 묶음을 찾는다 (사용자가 직접 지울 수 있게 보여준다).
 * 자동으로 들어온 내역이 하나라도 섞인 묶음만 보여준다.
 */
export function findSuspectedDuplicates<
  T extends Comparable & { id: string; source: string },
>(items: T[]): T[][] {
  if (items.length < 2) return [];
  const msList = items.map((item) => parseTimeMs(item.occurredAt));
  const indicesByKey = new Map<string, number[]>();
  for (let i = 0; i < items.length; i += 1) {
    const key = paymentBucketKey(items[i]);
    let list = indicesByKey.get(key);
    if (!list) {
      list = [];
      indicesByKey.set(key, list);
    }
    list.push(i);
  }

  const groups: T[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const base = items[i];
    if (seen.has(base.id)) continue;
    const candidates = indicesByKey.get(paymentBucketKey(base));
    if (!candidates || candidates.length < 2) continue;

    const group = [base];
    const baseMs = msList[i];
    for (const j of candidates) {
      if (j <= i) continue;
      const other = items[j];
      if (!seen.has(other.id) && isSameTimeOrDate(base.occurredOn, baseMs, other.occurredOn, msList[j])) {
        group.push(other);
      }
    }
    if (group.length > 1 && group.some((item) => item.source !== 'manual')) {
      for (const item of group) seen.add(item.id);
      groups.push(group);
    }
  }
  return groups;
}
