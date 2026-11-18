import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { activeUserId } from '@/lib/auth';

const KEY_PREFIX = 'meoreoseo:monthly-budget:';

function storageKey() {
  return `${KEY_PREFIX}${activeUserId() ?? 'anon'}`;
}

/**
 * 이번 달 목표 예산을 기기에 저장하고 불러오는 훅.
 * 설정하지 않았으면 null 을 돌려준다.
 */
export function useMonthlyBudget() {
  const [budget, setBudgetState] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey())
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
          setBudgetState(parsed);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function setBudget(next: number | null) {
    if (next === null || !Number.isFinite(next) || next <= 0) {
      setBudgetState(null);
      AsyncStorage.removeItem(storageKey()).catch(() => {});
      return;
    }
    const rounded = Math.round(next);
    setBudgetState(rounded);
    AsyncStorage.setItem(storageKey(), String(rounded)).catch(() => {});
  }

  return { budget, setBudget };
}
