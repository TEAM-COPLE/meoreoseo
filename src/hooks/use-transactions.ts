import { useQuery } from '@tanstack/react-query';

import { requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { monthRange, type YearMonth } from '@/lib/dates';
import { check, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type Transaction = Tables<'transactions'>;
export type TransactionKind = 'expense' | 'income';

export type TransactionInput = {
  id?: string;
  kind: TransactionKind;
  amount: number;
  category: string;
  memo: string | null;
  occurred_on: string;
};

/** 분류 목록. 지출과 수입에서 고를 수 있는 분류가 다르다. */
export const CATEGORIES: Record<TransactionKind, readonly string[]> = {
  expense: ['식비', '교통', '주거', '생활', '쇼핑', '의료', '문화', '기타'],
  income: ['급여', '용돈', '부수입', '기타'],
};

const KEY = ['transactions'];

/** 한 달 동안의 수입·지출 내역. 최근 날짜가 먼저 온다. */
export function useTransactions(month: YearMonth) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { start, end } = monthRange(month);

  return useQuery({
    queryKey: [...KEY, userId, start, end],
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('occurred_on', start)
        .lte('occurred_on', end)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      check(error);
      return data ?? [];
    },
  });
}

export function useSaveTransaction() {
  return useInvalidatingMutation(KEY, async ({ id, ...values }: TransactionInput) => {
    requireUserId();
    const { error } = id
      ? await supabase.from('transactions').update(values).eq('id', id)
      : await supabase.from('transactions').insert(values);
    check(error);
  });
}

export function useDeleteTransaction() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    requireUserId();
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    check(error);
  });
}
