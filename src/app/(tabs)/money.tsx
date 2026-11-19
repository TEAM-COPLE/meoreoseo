import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { DuplicateReviewCard, MoneyAutoCard, SourceBadge } from '@/components/money-auto-panel';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { FormModal } from '@/components/ui/form-modal';
import { MonthSwitcher } from '@/components/ui/month-switcher';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { SelectionBar, SelectionHeaderActions, SelectionIndicator } from '@/components/ui/selection-bar';
import { TextField, type TextFieldRef } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useMonthlyBudget } from '@/hooks/use-budget';
import { hasSelectionModifier, useMultiSelect } from '@/hooks/use-multi-select';
import { useTheme } from '@/hooks/use-theme';
import { useWebSearchShortcut } from '@/hooks/use-web-shortcut';
import {
  CATEGORIES,
  useDeleteTransaction,
  useDeleteTransactions,
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

const KIND_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
] as const;

type KindFilter = (typeof KIND_FILTERS)[number]['value'];

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
  const pathname = usePathname();
  const isMoneyRoute = pathname === '/money';
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const theme = useTheme();
  const [month, setMonth] = useState(() => yearMonthOf(todayISO()));
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<TextFieldRef | null>(null);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useWebSearchShortcut(() => searchRef.current?.focus());

  const { budget, setBudget } = useMonthlyBudget();
  const transactions = useTransactions(month);
  const removeMany = useDeleteTransactions();
  const multi = useMultiSelect();

  const keyword = deferredQuery.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return (transactions.data ?? []).filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (keyword) {
        const hay = `${item.category} ${item.memo ?? ''}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  }, [transactions.data, kindFilter, keyword]);

  const itemIds = filteredItems.map((item) => item.id);
  const selectedVisibleIds = itemIds.filter((id) => multi.isSelected(id));
  const isSelecting = itemIds.length > 0 && (multi.active || selectedVisibleIds.length > 0);

  function changeMonth(next: typeof month) {
    setMonth(next);
    multi.clear();
    setBulkError(null);
  }

  async function deleteSelected() {
    if (selectedVisibleIds.length === 0) return;
    const count = selectedVisibleIds.length;
    const ok = await confirm({
      title: `가계부 내역 ${count}개를 삭제할까요?`,
      message: '선택한 수입·지출 내역은 삭제 후 다시 복구할 수 없습니다.',
      confirmLabel: `${count}개 삭제`,
    });
    if (!ok) return;
    setBulkError(null);
    try {
      await removeMany.mutateAsync(selectedVisibleIds);
      multi.clear();
    } catch (e) {
      setBulkError(errorMessage(e));
    }
  }

  const activeEditing: Transaction | 'new' | null =
    editing ??
    (isMoneyRoute && add
      ? 'new'
      : isMoneyRoute && editId
        ? ((transactions.data ?? []).find((tx) => tx.id === editId) ?? null)
        : null);

  function closeForm() {
    setEditing(null);
    if (add || editId) {
      router.setParams({ add: undefined, editId: undefined });
    }
  }

  const { income, expense, categories, groups } = useMemo(() => {
    const list = transactions.data ?? [];
    let totalIncome = 0;
    let totalExpense = 0;
    for (const item of list) {
      if (item.kind === 'income') totalIncome += item.amount;
      else if (item.kind === 'expense') totalExpense += item.amount;
    }
    return {
      income: totalIncome,
      expense: totalExpense,
      categories: expenseByCategory(list),
      groups: groupByDate(filteredItems),
    };
  }, [transactions.data, filteredItems]);

  const budgetRatio = budget && budget > 0 ? expense / budget : 0;
  const budgetColor =
    budgetRatio >= 1 ? theme.danger : budgetRatio >= 0.75 ? theme.accentWarm : theme.tint;

  // 새 내역의 기본 날짜: 보고 있는 달이 이번 달이면 오늘, 아니면 그 달의 1일.
  const today = todayISO();
  const range = monthRange(month);
  const defaultDate = today >= range.start && today <= range.end ? today : range.start;

  return (
    <Screen
      title="가계부"
      onRefresh={() => transactions.refetch()}
      action={
        <SelectionHeaderActions
          selecting={isSelecting}
          canSelect={itemIds.length > 0}
          onAdd={() => setEditing('new')}
          onStartSelect={() => {
            setBulkError(null);
            multi.enter();
          }}
          onCancelSelect={() => {
            multi.clear();
            setBulkError(null);
          }}
        />
      }
      overlay={
        isSelecting ? (
          <SelectionBar
            count={selectedVisibleIds.length}
            totalCount={itemIds.length}
            deleting={removeMany.isPending}
            onSelectAll={() => multi.selectAll(itemIds)}
            onDeselectAll={() => {
              multi.deselectAll();
              setBulkError(null);
            }}
            onClear={() => {
              multi.clear();
              setBulkError(null);
            }}
            onDelete={deleteSelected}
          />
        ) : undefined
      }>
      <Card>
        <MonthSwitcher month={month} onChange={changeMonth} />
        <View style={styles.summary}>
          <Stat label="수입" value={formatWon(income)} color={theme.success} />
          <Stat label="지출" value={formatWon(expense)} color={theme.danger} />
          <Stat label="남은 돈" value={formatWon(income - expense)} color={theme.text} />
        </View>

        <View style={[styles.budgetSection, { borderTopColor: theme.border }]}>
          <View style={styles.budgetHeader}>
            <ThemedText type="smallBold">이번 달 목표 예산</ThemedText>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setEditingBudget(true)}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="small" themeColor="tint">
                {budget ? '예산 변경 ›' : '예산 설정 ›'}
              </ThemedText>
            </Pressable>
          </View>
          {budget ? (
            <>
              <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: budgetColor,
                      width: `${Math.min(100, Math.max(0, budgetRatio * 100))}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.budgetMeta}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatWon(expense)} / {formatWon(budget)}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: budgetColor }}>
                  {Math.round(budgetRatio * 100)}%
                </ThemedText>
              </View>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              목표 예산을 설정하면 지출 진행률을 바로 확인할 수 있습니다.
            </ThemedText>
          )}
        </View>
      </Card>

      <MoneyAutoCard />
      <DuplicateReviewCard transactions={transactions.data ?? []} />

      <Segmented
        options={KIND_FILTERS}
        value={kindFilter}
        onChange={(next) => {
          setKindFilter(next);
          multi.clear();
        }}
      />
      <TextField
        inputRef={searchRef}
        label="검색"
        placeholder="분류 또는 메모로 검색…"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      {bulkError ? (
        <ThemedText type="small" themeColor="danger">
          {bulkError}
        </ThemedText>
      ) : null}

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
                    {
                      backgroundColor: theme.tint,
                      width: `${expense > 0 ? Math.min(100, Math.max(0, (total / expense) * 100)) : 0}%`,
                    },
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
        empty={filteredItems.length === 0}
        emptyText={
          keyword || kindFilter !== 'all'
            ? '조건에 맞는 내역이 없습니다.'
            : '이 달에는 기록이 없습니다. "추가"를 눌러 수입이나 지출을 적어 보세요.'
        }
        onRetry={transactions.refetch}
      />

      {groups.map((group) => (
        <View key={group.date} style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(group.date)}
          </ThemedText>
          <Card>
            {group.items.map((item) => {
              const selected = multi.isSelected(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.category} ${formatWon(item.amount)} ${isSelecting ? '선택' : '수정'}`}
                  accessibilityState={selected ? { selected: true } : undefined}
                  delayLongPress={320}
                  onPress={(e) => {
                    if (isSelecting) {
                      multi.handlePress(item.id, itemIds, e);
                    } else if (hasSelectionModifier(e)) {
                      setBulkError(null);
                      multi.start(item.id);
                    } else {
                      setEditing(item);
                    }
                  }}
                  onLongPress={() => {
                    setBulkError(null);
                    multi.start(item.id);
                  }}
                  style={({ pressed }) => [
                    styles.itemRow,
                    isSelecting && Platform.OS === 'web' && styles.noSelect,
                    selected && {
                      backgroundColor: theme.tintSoft,
                      borderColor: theme.tint,
                    },
                    pressed && styles.pressed,
                  ]}>
                  {isSelecting ? <SelectionIndicator selected={selected} /> : null}
                  <View style={styles.itemBody}>
                    <View style={styles.itemTitle}>
                      <ThemedText type="default">{item.category}</ThemedText>
                      <SourceBadge source={item.source} />
                    </View>
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
              );
            })}
          </Card>
        </View>
      ))}

      {activeEditing ? (
        <TransactionForm
          transaction={activeEditing === 'new' ? null : activeEditing}
          defaultDate={add ? today : defaultDate}
          onClose={closeForm}
        />
      ) : null}

      {editingBudget ? (
        <BudgetForm
          initialBudget={budget}
          onSave={(next) => {
            setBudget(next);
            setEditingBudget(false);
          }}
          onClose={() => setEditingBudget(false)}
        />
      ) : null}
    </Screen>
  );
}

function BudgetForm({
  initialBudget,
  onSave,
  onClose,
}: {
  initialBudget: number | null;
  onSave: (next: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialBudget ? String(initialBudget) : '');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const cleaned = text.replace(/,/g, '').trim();
    if (!cleaned) {
      onSave(null);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('0보다 큰 금액을 입력해 주세요.');
      return;
    }
    onSave(parsed);
  }

  return (
    <FormModal
      title="이번 달 목표 예산"
      submitLabel="저장"
      onSubmit={submit}
      onClose={onClose}
      error={error}>
      <TextField
        label="예산 금액 (원)"
        placeholder="예: 1000000"
        keyboardType="numeric"
        value={text}
        onChangeText={setText}
        autoFocus
      />
      {initialBudget ? (
        <Button label="예산 초기화" variant="danger" size="small" onPress={() => onSave(null)} />
      ) : null}
    </FormModal>
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
    if (
      !transaction ||
      !(await confirm({
        title: '가계부 내역을 삭제할까요?',
        message: `${transaction.category} ${formatWon(transaction.amount)} 내역이 영구적으로 삭제됩니다.`,
        confirmLabel: '삭제',
      }))
    ) {
      return;
    }
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
  budgetSection: {
    marginTop: Spacing.one,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginHorizontal: -Spacing.two,
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // userSelect 는 웹 전용이라 RN ViewStyle 타입에 없어 캐스팅한다.
  noSelect: {
    userSelect: 'none',
  } as ViewStyle,
  pressed: {
    opacity: 0.6,
  },
});
