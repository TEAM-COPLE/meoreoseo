/**
 * 은행·카드사에서 내려받은 거래내역 파일을 가계부 내역으로 바꾼다.
 *
 * 읽을 수 있는 파일
 *  - CSV (쉼표로 나눈 글 파일)
 *  - 은행 사이트가 주는 ".xls" 중 실제로는 웹 표(HTML)인 파일 (국내 은행에 많다)
 *  - (진짜 엑셀 .xlsx/.xls 는 엑셀 읽기 도구가 있어야 해서, 그 전까지는 CSV 로 저장해서 올린다)
 *
 * 파일마다 칸 이름이 다르므로, 위쪽 줄들에서 "날짜"와 "금액" 칸 이름이 있는 줄을 찾아 머리글로 쓴다.
 */

import { toISODate } from './dates';
import type { AutoEntry, AutoKind } from './money-auto';

export type Cell = string | number | Date | null | undefined;

export type StatementResult = {
  entries: AutoEntry[];
  /** 날짜·금액을 못 읽어서 건너뛴 줄 수 */
  skipped: number;
};

// ───────────────────────── 파일 → 표 ─────────────────────────

/** UTF-8 바이트를 글자로. 잘못된 바이트가 있으면 null (TextDecoder 가 없는 환경도 생각해 직접 읽는다) */
function decodeUtf8(bytes: Uint8Array): string | null {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let code: number;
    let extra: number;
    if (b < 0x80) [code, extra] = [b, 0];
    else if (b >= 0xc2 && b < 0xe0) [code, extra] = [b & 0x1f, 1];
    else if (b >= 0xe0 && b < 0xf0) [code, extra] = [b & 0x0f, 2];
    else if (b >= 0xf0 && b < 0xf5) [code, extra] = [b & 0x07, 3];
    else return null;
    for (let k = 1; k <= extra; k++) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
}

/** 파일 내용(바이트)을 글자로 바꾼다. UTF-8 이 아니면 한국어 옛 방식(EUC-KR)으로 읽어 본다. */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = decodeUtf8(bytes);
  if (utf8 !== null) return utf8.replace(/^﻿/, '');
  try {
    return new TextDecoder('euc-kr').decode(bytes);
  } catch {
    throw new Error(
      '파일의 글자 방식(EUC-KR)을 이 기기에서 읽을 수 없어요. 엑셀에서 "CSV UTF-8"로 저장하거나 웹에서 올려 주세요.',
    );
  }
}

/** CSV 글을 표(줄 × 칸)로 나눈다. 따옴표로 감싼 칸 안의 쉼표·줄바꿈도 처리한다. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  // 탭으로 나눈 파일도 있다: 첫 줄에 탭이 쉼표보다 많으면 탭으로 나눈다.
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (_, code: string) =>
      code.startsWith('#') ? String.fromCharCode(Number(code.slice(1))) : (ENTITIES[code.toLowerCase()] ?? ' '),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 웹 표(HTML <table>)를 표(줄 × 칸)로 바꾼다. */
export function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      htmlToText(m[1]),
    );
    if (cells.some((c) => c !== '')) rows.push(cells);
  }
  return rows;
}

/** 파일 내용을 표로 바꾼다. 읽을 수 없는 파일이면 오류를 낸다. */
export function readStatementFile(bytes: Uint8Array): string[][] {
  // 진짜 엑셀 파일은 맨 앞 글자로 알 수 있다: .xlsx 는 'PK', 옛 .xls 는 D0 CF 11 E0.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new Error('엑셀(.xlsx) 파일은 아직 바로 읽을 수 없어요. 엑셀에서 "CSV"로 저장해서 올려 주세요.');
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error('엑셀(.xls) 파일은 아직 바로 읽을 수 없어요. 엑셀에서 "CSV"로 저장해서 올려 주세요.');
  }
  const text = decodeText(bytes);
  if (/<table[\s>]/i.test(text)) return parseHtmlTable(text);
  return parseCsv(text);
}

// ───────────────────────── 표 → 가계부 내역 ─────────────────────────

const norm = (cell: Cell) => String(cell ?? '').replace(/\s+/g, '');

const DATE_HEADER = /거래일시|거래일자|거래일|이용일시|이용일자|이용일|승인일시|승인일자|승인일|사용일시|사용일자|사용일|결제일시|매출일|일시|일자|날짜/;
const TIME_HEADER = /거래시간|이용시간|승인시간|사용시간|시간|시각/;
const WITHDRAW_HEADER = /출금액|출금금액|찾으신금액|지출금액|지출|출금/;
const DEPOSIT_HEADER = /입금액|입금금액|맡기신금액|수입금액|수입|입금/;
const AMOUNT_HEADER = /이용금액|승인금액|거래금액|결제금액|사용금액|매출금액|금액/;
const NOT_AMOUNT_HEADER = /잔액|수수료|포인트|할인|적립|원금|이자|할부|해외|외화|환율|부가세/;
const TYPE_HEADER = /거래구분|거래유형|승인구분|입출금구분|취소여부|매출구분|구분|유형|상태/;
const MERCHANT_HEADERS = [
  /가맹점명|이용가맹점|가맹점/,
  /이용처|사용처|상호/,
  /받는분|보낸분|거래처|상대/,
  /거래내용|적요|내용|기재내용/,
  /메모/,
];

type Columns = {
  date: number;
  time: number;
  withdraw: number;
  deposit: number;
  amount: number;
  type: number;
  merchant: number;
  /** 카드 명세서인지 (금액이 양수여도 지출) */
  isCard: boolean;
};

function findColumn(header: string[], pattern: RegExp, avoid?: RegExp, exclude: number[] = []): number {
  return header.findIndex((h, i) => h !== '' && !exclude.includes(i) && pattern.test(h) && !(avoid && avoid.test(h)));
}

/** 위쪽 40줄 안에서 날짜·금액 칸 이름이 함께 있는 줄을 머리글로 고른다. */
function findHeader(rows: Cell[][]): { index: number; columns: Columns } | null {
  for (let index = 0; index < Math.min(rows.length, 40); index++) {
    const header = rows[index].map(norm);
    const date = findColumn(header, DATE_HEADER, /예정|결제예정|청구/);
    if (date === -1) continue;
    const withdraw = findColumn(header, WITHDRAW_HEADER, NOT_AMOUNT_HEADER);
    const deposit = findColumn(header, DEPOSIT_HEADER, NOT_AMOUNT_HEADER);
    const amount = findColumn(header, AMOUNT_HEADER, NOT_AMOUNT_HEADER, [withdraw, deposit]);
    if (amount === -1 && (withdraw === -1 || deposit === -1)) continue;
    let merchant = -1;
    for (const pattern of MERCHANT_HEADERS) {
      merchant = findColumn(header, pattern);
      if (merchant !== -1) break;
    }
    const time = findColumn(header, TIME_HEADER, /일시/, [date]);
    const type = findColumn(header, TYPE_HEADER, undefined, [date, time, merchant]);
    const isCard = header.some((h) => /가맹점|이용금액|승인금액|카드|할부/.test(h));
    return {
      index,
      columns: {
        date,
        time,
        withdraw: amount === -1 || (withdraw !== -1 && deposit !== -1) ? withdraw : -1,
        deposit: amount === -1 || (withdraw !== -1 && deposit !== -1) ? deposit : -1,
        amount,
        type,
        merchant,
        isCard,
      },
    };
  }
  return null;
}

/** 금액 칸을 숫자로. "12,000", "-12,000원", "(12,000)" 모두 읽는다. 못 읽으면 NaN */
export function parseAmountCell(cell: Cell): number {
  if (typeof cell === 'number') return cell;
  const text = String(cell ?? '').replace(/[\s,원₩]/g, '');
  if (text === '' || text === '-') return Number.NaN;
  const negative = /^\(.*\)$/.test(text);
  const value = Number(text.replace(/[()]/g, ''));
  return negative ? -value : value;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 날짜 칸에서 날짜(와 시각)를 읽는다. 예: '2026.11.18 14:30:21', '2026-11-18', 20261118, Date */
export function parseDateCell(
  cell: Cell,
  timeCell?: Cell,
): { date: string; time: { h: number; m: number; s: number } | null } | null {
  let date: string | null = null;
  let time: { h: number; m: number; s: number } | null = null;

  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    date = toISODate(cell);
    if (cell.getHours() || cell.getMinutes() || cell.getSeconds()) {
      time = { h: cell.getHours(), m: cell.getMinutes(), s: cell.getSeconds() };
    }
  } else {
    const text = String(cell ?? '').trim();
    const ymd =
      /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(text) ??
      /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(text.replace(/\D/g, '').length >= 8 ? text.replace(/\D/g, '') : '');
    if (ymd) {
      const [y, mo, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
      const check = new Date(y, mo - 1, d);
      if (check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === d) {
        date = `${y}-${pad(mo)}-${pad(d)}`;
      }
    }
    const hm = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
    if (hm) time = { h: Number(hm[1]), m: Number(hm[2]), s: Number(hm[3] ?? 0) };
  }
  if (!date) return null;

  if (!time && timeCell !== undefined && timeCell !== null) {
    const hm = /(\d{1,2}):?(\d{2})(?::?(\d{2}))?/.exec(String(timeCell).trim());
    if (hm) time = { h: Number(hm[1]), m: Number(hm[2]), s: Number(hm[3] ?? 0) };
  }
  if (time && (time.h > 23 || time.m > 59 || time.s > 59)) time = null;
  return { date, time };
}

/** 글자를 짧은 지문(해시)으로 바꾼다. 같은 줄을 다시 가져올 때 같은 이름이 나오게 한다. */
function shortHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/** 표에서 가계부 내역을 만든다. 머리글을 못 찾으면 오류를 낸다. */
export function rowsToEntries(rows: Cell[][]): StatementResult {
  const found = findHeader(rows);
  if (!found) {
    throw new Error('날짜와 금액 칸을 찾지 못했어요. 은행·카드사에서 내려받은 거래내역 파일인지 확인해 주세요.');
  }
  const { index, columns: c } = found;
  const entries: AutoEntry[] = [];
  const seenKeys = new Map<string, number>();
  let skipped = 0;

  for (const row of rows.slice(index + 1)) {
    const when = parseDateCell(row[c.date], c.time === -1 ? undefined : row[c.time]);
    if (!when) {
      // 합계 줄, 빈 줄 등
      skipped++;
      continue;
    }
    const typeText = c.type === -1 ? '' : norm(row[c.type]);
    // 승인이 거절된 줄은 돈이 오가지 않았다.
    if (/거절|실패|오류/.test(typeText)) {
      skipped++;
      continue;
    }

    let kind: AutoKind | null = null;
    let amount = Number.NaN;
    if (c.withdraw !== -1 || c.deposit !== -1) {
      const out = c.withdraw === -1 ? Number.NaN : Math.abs(parseAmountCell(row[c.withdraw]));
      const inc = c.deposit === -1 ? Number.NaN : Math.abs(parseAmountCell(row[c.deposit]));
      if (out > 0) {
        kind = 'expense';
        amount = out;
      } else if (inc > 0) {
        kind = 'income';
        amount = inc;
      }
    } else {
      const value = parseAmountCell(row[c.amount]);
      if (Number.isFinite(value) && value !== 0) {
        amount = Math.abs(value);
        if (/취소|환불/.test(typeText)) kind = value < 0 && !c.isCard ? 'expense' : 'income';
        else if (/입금|수입|받/.test(typeText)) kind = 'income';
        else if (/출금|지출|결제|승인|이체|송금|보냄|사용/.test(typeText)) kind = 'expense';
        // 카드 명세서는 양수가 쓴 돈, 은행 내역은 음수가 나간 돈이다.
        else if (c.isCard) kind = value > 0 ? 'expense' : 'income';
        else kind = value < 0 ? 'expense' : 'income';
      }
    }
    amount = Math.round(amount);
    if (!kind || !Number.isSafeInteger(amount) || amount <= 0) {
      skipped++;
      continue;
    }

    const rawMerchant = c.merchant === -1 ? '' : String(row[c.merchant] ?? '').replace(/\s+/g, ' ').trim();
    const cancelled = /취소|환불/.test(typeText) && kind === 'income';
    const merchant = cancelled
      ? `결제 취소${rawMerchant ? ` · ${rawMerchant}` : ''}`
      : rawMerchant || null;

    let occurredAt: string | null = null;
    if (when.time) {
      const [y, mo, d] = when.date.split('-').map(Number);
      occurredAt = new Date(y, mo - 1, d, when.time.h, when.time.m, when.time.s).toISOString();
    }

    // 같은 파일을 다시 올려도 같은 이름이 나오게 만든다(같은 내용의 줄이 여러 개면 순번을 붙인다).
    const timeKey = when.time ? `${pad(when.time.h)}${pad(when.time.m)}${pad(when.time.s)}` : '';
    const key = `${when.date}:${timeKey}:${kind}:${amount}:${shortHash(rawMerchant)}`;
    const count = (seenKeys.get(key) ?? 0) + 1;
    seenKeys.set(key, count);

    entries.push({
      kind,
      amount,
      merchant: merchant ? merchant.slice(0, 200) : null,
      occurredOn: when.date,
      occurredAt,
      source: 'import',
      externalId: `import:${key}#${count}`.slice(0, 200),
    });
  }
  return { entries, skipped };
}
