import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File as FsFile } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { isDevMode, requireUserId } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import {
  localListTransactions,
  localUpsertAutoTransactions,
} from "@/lib/local-db";
import {
  guessCategory,
  parsePaymentNotification,
  splitDuplicates,
  type AutoEntry,
  type Comparable,
} from "@/lib/money-auto";
import { check } from "@/lib/query";
import { readStatementFile, rowsToEntries } from "@/lib/statement-import";
import { supabase } from "@/lib/supabase";

import { PaymentNotifications } from "../../modules/payment-notifications";

const KEY = ["transactions"];

/** 한 번에 저장하는 최대 개수 (너무 큰 파일로 서버에 부담을 주지 않게) */
const MAX_IMPORT = 2000;

export type AutoSaveResult = { added: number; duplicates: number };

/** 자동 내역들이 걸친 기간의 기존 내역을 불러온다 (중복 비교용). */
async function loadExisting(entries: AutoEntry[]): Promise<Comparable[]> {
  if (entries.length === 0) return [];
  const dates = entries.map((entry) => entry.occurredOn).sort();
  // 시각 차이 때문에 날짜가 하루 넘어가는 경우까지 넉넉히 본다.
  const start = addDays(dates[0], -1);
  const end = addDays(dates[dates.length - 1], 1);
  if (isDevMode()) {
    const rows = await localListTransactions(start, end);
    return rows.map((row) => ({
      kind: row.kind,
      amount: row.amount,
      occurredOn: row.occurred_on,
      occurredAt: row.occurred_at,
    }));
  }
  const { data, error } = await supabase
    .from("transactions")
    .select("kind, amount, occurred_on, occurred_at")
    .gte("occurred_on", start)
    .lte("occurred_on", end);
  check(error);
  return (data ?? []).map((row) => ({
    kind: row.kind,
    amount: row.amount,
    occurredOn: row.occurred_on,
    occurredAt: row.occurred_at,
  }));
}

/** 이미 있는 내역과 겹치는 것을 빼고 나눈다 (저장은 하지 않는다). */
export async function previewAutoEntries(
  entries: AutoEntry[],
): Promise<{ fresh: AutoEntry[]; duplicates: AutoEntry[] }> {
  requireUserId();
  return splitDuplicates(entries, await loadExisting(entries));
}

/** 새 내역만 저장한다. 같은 external_id 가 이미 있으면 조용히 건너뛴다. */
async function insertEntries(entries: AutoEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((entry) => ({
    kind: entry.kind,
    amount: entry.amount,
    category: guessCategory(entry.merchant, entry.kind),
    memo: entry.merchant,
    occurred_on: entry.occurredOn,
    occurred_at: entry.occurredAt,
    source: entry.source,
    external_id: entry.externalId,
  }));
  if (isDevMode()) {
    await localUpsertAutoTransactions(rows);
    return;
  }
  const { error } = await supabase.from("transactions").upsert(rows, {
    onConflict: "user_id,external_id",
    ignoreDuplicates: true,
  });
  check(error);
}

/** 중복을 거른 뒤 저장한다. */
export async function saveAutoEntries(
  entries: AutoEntry[],
): Promise<AutoSaveResult> {
  const { fresh, duplicates } = await previewAutoEntries(entries);
  await insertEntries(fresh);
  return { added: fresh.length, duplicates: duplicates.length };
}

// ───────────────────────── 결제 알림 ─────────────────────────

/** 이 기기에서 결제 알림 읽기를 쓸 수 있는지 */
export type NotificationAccess = "unsupported" | "needs-update" | "off" | "on";

function currentAccess(): NotificationAccess {
  if (Platform.OS !== "android") return "unsupported";
  if (!PaymentNotifications) return "needs-update";
  try {
    return PaymentNotifications.isPermissionGranted() ? "on" : "off";
  } catch {
    return "off";
  }
}

/** 지금 돌고 있는 알림 기록 작업 (여러 화면이 동시에 불러도 한 번만 돌게) */
let syncing: Promise<AutoSaveResult> | null = null;

/** 휴대폰에 모아 둔 결제 알림을 꺼내 가계부에 기록한다. 기록한 알림은 대기열에서 지운다. */
export function syncPaymentNotifications(): Promise<AutoSaveResult> {
  syncing ??= syncOnce().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function syncOnce(): Promise<AutoSaveResult> {
  if (currentAccess() !== "on" || !PaymentNotifications)
    return { added: 0, duplicates: 0 };
  requireUserId();
  const pending = await PaymentNotifications.getPending();
  if (pending.length === 0) return { added: 0, duplicates: 0 };
  const entries = pending
    .sort((a, b) => a.postTime - b.postTime)
    .map((item) => parsePaymentNotification(item))
    .filter((entry): entry is AutoEntry => entry !== null);
  const result = await saveAutoEntries(entries);
  // 결제가 아니라고 본 알림까지 모두 처리했으므로 대기열에서 지운다.
  await PaymentNotifications.removePending(pending.map((item) => item.id));
  return result;
}

/**
 * 결제 알림 자동 입력 상태와 동작.
 * 앱이 앞으로 나올 때마다(그리고 처음 열 때) 쌓인 결제 알림을 가계부에 기록한다.
 */
export function usePaymentNotificationSync(enabled = true) {
  const client = useQueryClient();
  const [access, setAccess] = useState<NotificationAccess>(currentAccess);
  const [lastResult, setLastResult] = useState<AutoSaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 권한이 켜져 있으면 쌓인 알림을 가계부에 적는다. */
  const pull = useCallback((): Promise<void> => {
    if (!enabled || currentAccess() !== "on") return Promise.resolve();
    // 결과는 작업이 끝난 뒤(then 안에서)에만 화면 상태에 넣는다.
    return syncPaymentNotifications().then(
      async (result) => {
        setLastResult(result);
        setError(null);
        if (result.added > 0) await client.invalidateQueries({ queryKey: KEY });
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [client, enabled]);

  /** 권한 상태를 다시 확인한 뒤 가져온다 (설정에서 돌아왔을 때 등). */
  const run = useCallback(() => {
    setAccess(currentAccess());
    return pull();
  }, [pull]);

  useEffect(() => {
    // 처음 열 때는 권한 상태를 useState 에서 이미 읽었으므로 가져오기만 한다.
    pull();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => sub.remove();
  }, [pull, run]);

  const openSettings = useCallback(() => {
    PaymentNotifications?.openPermissionSettings();
  }, []);

  return { access, lastResult, error, syncNow: run, openSettings };
}

// ───────────────────────── 거래내역 파일 ─────────────────────────

export type StatementPreview = {
  fileName: string;
  fresh: AutoEntry[];
  duplicates: AutoEntry[];
  /** 날짜·금액을 못 읽어 건너뛴 줄 수 */
  skipped: number;
};

async function readPickedFile(
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<Uint8Array> {
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  if (Platform.OS === "web")
    return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
  return new Uint8Array(await new FsFile(asset.uri).arrayBuffer());
}

/** 파일을 골라 읽고, 중복을 거른 미리보기를 만든다. 고르지 않고 닫으면 null */
export async function pickStatementPreview(): Promise<StatementPreview | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "text/plain",
      "text/html",
      "application/vnd.ms-excel",
      "*/*",
    ],
    multiple: false,
    base64: false,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  if (asset.size && asset.size > 5 * 1024 * 1024) {
    throw new Error(
      "파일이 너무 커요(5MB 넘음). 기간을 나눠서 내려받아 주세요.",
    );
  }
  const bytes = await readPickedFile(asset);
  const { entries, skipped } = rowsToEntries(readStatementFile(bytes));
  if (entries.length === 0) throw new Error("가져올 거래를 찾지 못했어요.");
  if (entries.length > MAX_IMPORT) {
    throw new Error(
      `한 번에 ${MAX_IMPORT}건까지 가져올 수 있어요. 기간을 나눠서 내려받아 주세요.`,
    );
  }
  const { fresh, duplicates } = await previewAutoEntries(entries);
  return { fileName: asset.name, fresh, duplicates, skipped };
}

/** 미리보기에서 고른 새 내역을 저장한다. 저장 직전에 다시 한 번 중복을 거른다. */
export function useImportStatement() {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const importEntries = useCallback(
    async (entries: AutoEntry[]): Promise<AutoSaveResult> => {
      setSaving(true);
      try {
        const result = await saveAutoEntries(entries);
        await client.invalidateQueries({ queryKey: KEY });
        return result;
      } finally {
        setSaving(false);
      }
    },
    [client],
  );
  return { importEntries, saving };
}
