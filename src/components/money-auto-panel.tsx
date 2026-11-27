/**
 * 가계부 자동 입력에 쓰는 화면 부품들.
 *
 * - MoneyAutoCard: 결제 알림 자동 입력 상태 + 거래내역 파일(CSV) 가져오기 버튼
 * - ImportPreviewModal: 파일에서 읽은 내역을 저장하기 전에 보여주고 고르게 하는 창
 * - DuplicateReviewCard: 이미 저장된 내역 중 "같은 결제가 두 번 들어간 것 같은" 묶음을 보여주고 직접 지우게 하는 상자
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Card } from '@/components/ui/screen';
import { SelectionIndicator } from '@/components/ui/selection-bar';
import { Radius, Spacing } from '@/constants/theme';
import {
  pickStatementPreview,
  useImportStatement,
  usePaymentNotificationSync,
  type StatementPreview,
} from '@/hooks/use-money-auto';
import { useTheme } from '@/hooks/use-theme';
import { useDeleteTransaction, type Transaction } from '@/hooks/use-transactions';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { confirm, errorMessage, formatWon } from '@/lib/format';
import { findSuspectedDuplicates, guessCategory, type AutoEntry } from '@/lib/money-auto';

/** 내역이 어디서 왔는지 짧게 */
export function sourceLabel(source: string): string | null {
  if (source === 'notification') return '알림';
  if (source === 'import') return '파일';
  return null;
}

/** 자동으로 들어온 내역 옆에 붙는 작은 꼬리표 */
export function SourceBadge({ source }: { source: string }) {
  const theme = useTheme();
  const label = sourceLabel(source);
  if (!label) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.tintSoft }]}>
      <ThemedText type="small" themeColor="tint" style={styles.badgeText}>
        {label}
      </ThemedText>
    </View>
  );
}

/** ISO 시각 → '오후 3:05' (없으면 빈 문자열) */
function timeOf(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, '0');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 ? '오전' : '오후'} ${h12}:${minute}`;
}

// ───────────────────────── 자동 입력 상자 ─────────────────────────

export function MoneyAutoCard() {
  const theme = useTheme();
  const sync = usePaymentNotificationSync();
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFile() {
    setPicking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await pickStatementPreview();
      if (result) setPreview(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPicking(false);
    }
  }

  const notificationText = (() => {
    switch (sync.access) {
      case 'unsupported':
        return '결제 알림 자동 입력은 안드로이드 앱에서만 쓸 수 있어요.';
      case 'needs-update':
        return '결제 알림 자동 입력은 새 버전 앱을 설치하면 쓸 수 있어요.';
      case 'off':
        return '휴대폰 설정에서 "알림 접근"을 허용하면 카드·토스·은행 결제 알림을 읽어 자동으로 적어요.';
      case 'on':
        return sync.lastResult && sync.lastResult.added + sync.lastResult.duplicates > 0
          ? `켜짐 · 방금 ${sync.lastResult.added}건 기록${
              sync.lastResult.duplicates > 0 ? `, 중복 ${sync.lastResult.duplicates}건은 건너뜀` : ''
            }`
          : '켜짐 · 앱을 열 때마다 새 결제 알림을 가계부에 적어요.';
    }
  })();

  return (
    <Card>
      <ThemedText type="smallBold">자동 입력</ThemedText>

      <View style={styles.section}>
        <ThemedText type="small">결제 알림</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {notificationText}
        </ThemedText>
        {sync.error ? (
          <ThemedText type="small" themeColor="danger">
            {sync.error}
          </ThemedText>
        ) : null}
        {sync.access === 'off' ? (
          <Button label="알림 접근 허용하러 가기" size="small" onPress={sync.openSettings} />
        ) : null}
        {sync.access === 'on' ? (
          <Button label="지금 가져오기" size="small" variant="secondary" onPress={sync.syncNow} />
        ) : null}
      </View>

      <View style={[styles.section, styles.divided, { borderTopColor: theme.border }]}>
        <ThemedText type="small">거래내역 파일</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          토스·은행·카드 앱에서 거래내역을 CSV(엑셀)로 내려받아 올리면, 이미 적힌 내역은 빼고 넣어요.
        </ThemedText>
        <Button
          label="파일 가져오기"
          size="small"
          variant="secondary"
          loading={picking}
          onPress={pickFile}
        />
        {message ? (
          <ThemedText type="small" themeColor="success">
            {message}
          </ThemedText>
        ) : null}
        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}
      </View>

      {preview ? (
        <ImportPreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          onSaved={(text) => {
            setPreview(null);
            setMessage(text);
          }}
        />
      ) : null}
    </Card>
  );
}

// ───────────────────────── 가져오기 미리보기 ─────────────────────────

/** 미리보기 목록에 한 번에 그리는 최대 줄 수 (너무 많으면 화면이 느려진다) */
const PREVIEW_LIMIT = 200;

function ImportPreviewModal({
  preview,
  onClose,
  onSaved,
}: {
  preview: StatementPreview;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const theme = useTheme();
  const { importEntries, saving } = useImportStatement();
  // 저장하지 않을 내역 (externalId 로 기억)
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => preview.fresh.filter((entry) => !excluded.has(entry.externalId)),
    [preview.fresh, excluded],
  );

  const toggle = useCallback((id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function submit() {
    if (chosen.length === 0) {
      onClose();
      return;
    }
    setError(null);
    try {
      const result = await importEntries(chosen);
      const dup = preview.duplicates.length + result.duplicates;
      onSaved(`${result.added}건을 가계부에 넣었어요.${dup > 0 ? ` 중복 ${dup}건은 뺐어요.` : ''}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title="거래내역 가져오기"
      submitLabel={chosen.length > 0 ? `${chosen.length}건 저장` : '닫기'}
      submitting={saving}
      onSubmit={submit}
      onClose={onClose}
      error={error}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {preview.fileName}
      </ThemedText>
      <View style={styles.counts}>
        <Count label="새 내역" value={preview.fresh.length} color={theme.tint} />
        <Count label="중복이라 뺌" value={preview.duplicates.length} color={theme.textSecondary} />
        <Count label="못 읽은 줄" value={preview.skipped} color={theme.textSecondary} />
      </View>

      {preview.fresh.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          새로 넣을 내역이 없어요. 파일의 내역이 모두 이미 가계부에 있어요.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            넣지 않을 내역은 눌러서 선택을 풀어 주세요.
          </ThemedText>
          <View style={styles.previewList}>
            {preview.fresh.slice(0, PREVIEW_LIMIT).map((entry) => (
              <EntryRow
                key={entry.externalId}
                entry={entry}
                selected={!excluded.has(entry.externalId)}
                onToggle={toggle}
              />
            ))}
            {preview.fresh.length > PREVIEW_LIMIT ? (
              <ThemedText type="small" themeColor="textSecondary">
                그 밖에 {preview.fresh.length - PREVIEW_LIMIT}건도 함께 저장돼요.
              </ThemedText>
            ) : null}
          </View>
        </>
      )}

      {preview.duplicates.length > 0 ? (
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setShowDuplicates((v) => !v)}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="tint">
              {showDuplicates ? '중복이라 뺀 내역 숨기기 ‹' : '중복이라 뺀 내역 보기 ›'}
            </ThemedText>
          </Pressable>
          {showDuplicates
            ? preview.duplicates
                .slice(0, PREVIEW_LIMIT)
                .map((entry) => <EntryRow key={entry.externalId} entry={entry} muted />)
            : null}
        </View>
      ) : null}
    </FormModal>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.count}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default" style={[styles.countValue, { color }]}>
        {value}
      </ThemedText>
    </View>
  );
}

const EntryRow = memo(function EntryRow({
  entry,
  selected,
  muted = false,
  onToggle,
}: {
  entry: AutoEntry;
  selected?: boolean;
  muted?: boolean;
  onToggle?: (externalId: string) => void;
}) {
  const theme = useTheme();
  const body = (
    <>
      {selected !== undefined ? <SelectionIndicator selected={selected} /> : null}
      <View style={styles.rowBody}>
        <ThemedText type="small" numberOfLines={1}>
          {guessCategory(entry.merchant, entry.kind)}
          {entry.merchant ? ` · ${entry.merchant}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[formatDate(entry.occurredOn), timeOf(entry.occurredAt)].filter(Boolean).join(' ')}
        </ThemedText>
      </View>
      <ThemedText
        type="small"
        style={{ color: muted ? theme.textSecondary : entry.kind === 'income' ? theme.success : theme.text }}>
        {entry.kind === 'income' ? '+' : '-'}
        {formatWon(entry.amount)}
      </ThemedText>
    </>
  );
  if (!onToggle) return <View style={[styles.row, muted && styles.muted]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      onPress={() => onToggle(entry.externalId)}
      style={({ pressed }) => [styles.row, !selected && styles.muted, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
});

// ───────────────────────── 중복 의심 목록 ─────────────────────────

const DISMISS_PREFIX = 'meoreoseo:money-not-duplicate:';
const DISMISS_QUERY_KEY = ['money-not-duplicate'] as const;
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

function dismissKey(userId: string | null) {
  return `${DISMISS_PREFIX}${userId ?? 'anon'}`;
}

/** 묶음을 가리키는 이름 (안에 든 내역 id 들을 정렬해 잇는다) */
function groupKey(group: Transaction[]): string {
  return group
    .map((item) => item.id)
    .sort()
    .join('+');
}

/** "중복 아님"이라고 고른 묶음을 기기에 기억한다. */
function useDismissedGroups() {
  const { userId } = useAuth();
  const client = useQueryClient();

  const query = useQuery({
    queryKey: [...DISMISS_QUERY_KEY, userId],
    enabled: userId !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<ReadonlySet<string>> => {
      if (!userId) return EMPTY_STRING_SET;
      try {
        const raw = await AsyncStorage.getItem(dismissKey(userId));
        if (!raw) return EMPTY_STRING_SET;
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
          ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
          : EMPTY_STRING_SET;
      } catch {
        return EMPTY_STRING_SET;
      }
    },
  });

  const dismiss = useCallback(
    (key: string) => {
      const cacheKey = [...DISMISS_QUERY_KEY, userId];
      const current = client.getQueryData<ReadonlySet<string>>(cacheKey) ?? EMPTY_STRING_SET;
      const next = new Set(current);
      next.add(key);
      client.setQueryData<ReadonlySet<string>>(cacheKey, next);
      // 너무 많이 쌓이지 않게 최근 300개만 남긴다.
      AsyncStorage.setItem(dismissKey(userId), JSON.stringify([...next].slice(-300))).catch(() => {});
    },
    [client, userId],
  );

  return { dismissed: query.data ?? EMPTY_STRING_SET, dismiss };
}

/**
 * 같은 결제가 두 번 들어간 것 같은 묶음(자동 입력이 하나라도 섞인 것)을 보여준다.
 * 각 내역 옆 "삭제"로 직접 지우거나, "중복 아님"으로 숨길 수 있다.
 */
export function DuplicateReviewCard({ transactions }: { transactions: Transaction[] }) {
  const theme = useTheme();
  const remove = useDeleteTransaction();
  const { dismissed, dismiss } = useDismissedGroups();
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const items = transactions.map((tx) => ({
      ...tx,
      occurredOn: tx.occurred_on,
      occurredAt: tx.occurred_at,
    }));
    return findSuspectedDuplicates(items).filter((group) => !dismissed.has(groupKey(group)));
  }, [transactions, dismissed]);

  if (groups.length === 0) return null;

  async function deleteOne(tx: Transaction) {
    const ok = await confirm({
      title: '이 내역을 삭제할까요?',
      message: `${formatDate(tx.occurred_on)} ${tx.memo ?? tx.category} ${formatWon(tx.amount)} 내역이 삭제됩니다.`,
      confirmLabel: '삭제',
    });
    if (!ok) return;
    setError(null);
    try {
      await remove.mutateAsync(tx.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card style={{ borderColor: theme.accentWarm }}>
      <ThemedText type="smallBold">중복 같은 내역 {groups.length}묶음</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        금액과 시간이 거의 같은 내역이에요. 같은 결제라면 하나를 지워 주세요.
      </ThemedText>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      {groups.map((group) => (
        <View
          key={groupKey(group)}
          style={[styles.dupGroup, { borderColor: theme.border, backgroundColor: theme.background }]}>
          {group.map((tx) => (
            <View key={tx.id} style={styles.row}>
              <View style={styles.rowBody}>
                <View style={styles.titleLine}>
                  <ThemedText type="small" numberOfLines={1} style={styles.shrink}>
                    {tx.category}
                    {tx.memo ? ` · ${tx.memo}` : ''}
                  </ThemedText>
                  <SourceBadge source={tx.source} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {[
                    formatDate(tx.occurred_on),
                    timeOf(tx.occurred_at),
                    tx.source === 'manual' ? '직접 입력' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              </View>
              <ThemedText type="small">{formatWon(tx.amount)}</ThemedText>
              <Button
                label="삭제"
                size="small"
                variant="danger"
                disabled={remove.isPending}
                onPress={() => deleteOne(tx)}
              />
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => dismiss(groupKey(group))}
            style={({ pressed }) => [styles.notDup, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              중복 아님 (숨기기)
            </ThemedText>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.one,
  },
  divided: {
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.one + 2,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 16,
  },
  counts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  count: {
    flex: 1,
  },
  countValue: {
    fontWeight: 700,
  },
  previewList: {
    gap: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
  },
  rowBody: {
    flex: 1,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  shrink: {
    flexShrink: 1,
  },
  muted: {
    opacity: 0.5,
  },
  dupGroup: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  notDup: {
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.6,
  },
});
