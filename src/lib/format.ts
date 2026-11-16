import { Alert, Platform } from 'react-native';

/** 12300 → '12,300원' */
export function formatWon(amount: number): string {
  const digits = String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${digits}원`;
}

/**
 * "정말 삭제할까요?" 같은 확인 창을 띄우고 사용자의 선택을 돌려준다.
 * 웹과 휴대폰에서 확인 창을 띄우는 방법이 달라 여기에서 맞춘다.
 */
export function confirm(message: string, confirmLabel = '삭제'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert('확인', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** 어떤 오류든 화면에 보여줄 문장으로 바꾼다. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}
