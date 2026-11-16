import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { MonthSwitcher } from '@/components/ui/month-switcher';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  CATEGORIES,
  useDeleteTransaction,
  useSaveTransaction,
  useTransactions,
  type Transaction,
  type TransactionKind,
} from '@/hooks/use-transactions';
import { formatDate, monthRange, todayISO, yearMonthOf } from '@/lib/dates';
import { confirm, errorMessage, formatWon } from '@/lib/format';

const KINDS = [
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
] as const;

/** 내역을 날짜별로 묶는다. 입력 순서(최근 날짜 먼저)를 그대로 유지한다. */
function groupByDate(items: Transaction[]): { date: string; items: Transaction[] }[] {
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.occurred_on) {
      last.items.push(item);
    } else {
      groups.push({ date: item.occurred_on, items: [item] });
    }
  }
  return groups;
}

/** 지출을 분류별로 더해 큰 금액부터 늘어놓는다. */
function expenseByCategory(items: Transaction[]): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== 'expense') continue;
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export default function MoneyScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(() => yearMonthOf(todayISO()));
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);

  const transactions = useTransactions(month);
  const items = transactions.data ?? [];

  const income = items.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = items.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const categories = expenseByCategory(items);

  // 새 내역의 기본 날짜: 보고 있는 달이 이번 달이면 오늘, 아니면 그 달의 1일.
  const today = todayISO();
  const range = monthRange(month);
  const defaultDate = today >= range.start && today <= range.end ? today : range.start;

  return (
    <Screen
      title="가계부"
      action={<Button label="추가" size="small" onPress={() => setEditing('new')} />}>
      <Card>
        <MonthSwitcher month={month} onChange={setMonth} />
        <View style={styles.summary}>
          <Stat label="수입" value={formatWon(income)} color={theme.success} />
          <Stat label="지출" value={formatWon(expense)} color={theme.danger} />
          <Stat label="남은 돈" value={formatWon(income - expense)} color={theme.text} />
        </View>
      </Card>

      {categories.length > 0 ? (
        <Card>
          <ThemedText type="smallBold">분류별 지출</ThemedText>
          {categories.map(({ category, total }) => (
            <View key={category} style={styles.categoryRow}>
              <ThemedText type="small" style={styles.categoryName}>
                {category}
              </ThemedText>
              <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: theme.tint, width: `${(total / expense) * 100}%` },
                  ]}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.categoryTotal}>
                {formatWon(total)}
              </ThemedText>
            </View>
          ))}
        </Card>
      ) : null}

      <ListStatus
        loading={transactions.isPending}
        error={transactions.error}
        empty={items.length === 0}
        emptyText={'이 달에는 기록이 없습니다. "추가"를 눌러 수입이나 지출을 적어 보세요.'}
        onRetry={transactions.refetch}
      />

      {groupByDate(items).map((group) => (
        <View key={group.date} style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(group.date)}
          </ThemedText>
          <Card>
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.category} ${formatWon(item.amount)} 수정`}
                onPress={() => setEditing(item)}
                style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}>
                <View style={styles.itemBody}>
                  <ThemedText type="default">{item.category}</ThemedText>
                  {item.memo ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.memo}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText
                  type="default"
                  style={{ color: item.kind === 'income' ? theme.success : theme.text }}>
                  {item.kind === 'income' ? '+' : '-'}
                  {formatWon(item.amount)}
                </ThemedText>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      {editing ? (
        <TransactionForm
          transaction={editing === 'new' ? null : editing}
          defaultDate={defaultDate}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default" style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function TransactionForm({
  transaction,
  defaultDate,
  onClose,
}: {
  transaction: Transaction | null;
  defaultDate: string;
  onClose: () => void;
}) {
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();

  const [kind, setKind] = useState<TransactionKind>(
    transaction?.kind === 'income' ? 'income' : 'expense',
  );
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [category, setCategory] = useState(transaction?.category ?? CATEGORIES.expense[0]);
  const [date, setDate] = useState(transaction?.occurred_on ?? defaultDate);
  const [memo, setMemo] = useState(transaction?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  // 예전에 저장한 분류가 지금 목록에 없더라도 고를 수 있게 함께 보여준다.
  const categoryNames = CATEGORIES[kind].includes(category)
    ? CATEGORIES[kind]
    : [category, ...CATEGORIES[kind]];

  function changeKind(next: TransactionKind) {
    setKind(next);
    setCategory(CATEGORIES[next][0]);
  }

  async function submit() {
    const value = Number(amount);
    if (!amount || !Number.isSafeInteger(value) || value <= 0) {
      setError('금액을 숫자로 입력해 주세요.');
      return;
    }
    try {
      await save.mutateAsync({
        id: transaction?.id,
        kind,
        amount: value,
        category,
        memo: memo.trim() || null,
        occurred_on: date,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteTransaction() {
    if (!transaction || !(await confirm('이 내역을 삭제할까요?'))) return;
    try {
      await remove.mutateAsync(transaction.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={transaction ? '내역 수정' : '새 내역'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending}
      onDelete={transaction ? deleteTransaction : undefined}
      error={error}>
      <Segmented options={KINDS} value={kind} onChange={changeKind} />
      <TextField
        label="금액 (원)"
        value={amount}
        // 숫자만 남긴다.
        onChangeText={(text) => setAmount(text.replace(/\D/g, ''))}
        placeholder="0"
        keyboardType="number-pad"
        maxLength={12}
        autoFocus={!transaction}
      />
      <Segmented
        label="분류"
        options={categoryNames.map((name) => ({ value: name, label: name }))}
        value={category}
        onChange={setCategory}
      />
      <DateField label="날짜" value={date} onChange={(value) => value && setDate(value)} />
      <TextField label="메모" value={memo} onChangeText={setMemo} maxLength={200} />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  stat: {
    flex: 1,
    gap: Spacing.half,
  },
  statValue: {
    fontWeight: 700,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  categoryName: {
    width: 44,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: Radius.full,
  },
  categoryTotal: {
    minWidth: 84,
    textAlign: 'right',
  },
  group: {
    gap: Spacing.two,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
  },
  itemBody: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
