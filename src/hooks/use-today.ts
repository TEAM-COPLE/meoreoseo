import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { todayISO } from '@/lib/dates';

/**
 * 오늘 날짜('YYYY-MM-DD')를 돌려주고, 자정이 지나거나 앱이 다시 앞으로 나오면 자동으로 갱신한다.
 * 화면을 켠 채로 자정을 넘겨도 어제 날짜에 멈추지 않고, 매 렌더마다 불필요한 Date 생성을 막는다.
 */
export function useTodayISO(): string {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const sync = () => {
      const next = todayISO();
      setToday((prev) => (prev === next ? prev : next));
    };

    sync();

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      300,
    );
    const delayMs = Math.max(1_000, nextMidnight.getTime() - now.getTime());
    const midnightTimer = setTimeout(sync, delayMs);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') sync();
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        clearTimeout(midnightTimer);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      clearTimeout(midnightTimer);
      sub.remove();
    };
  }, [today]);

  return today;
}
