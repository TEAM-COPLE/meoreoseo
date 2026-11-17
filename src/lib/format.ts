import { Alert, Platform } from "react-native";

/** 12300 → '12,300원' */
export function formatWon(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const digits = Math.abs(Math.round(safe)).toLocaleString("ko-KR");
  return `${safe < 0 ? "-" : ""}${digits}원`;
}

/**
 * "정말 삭제할까요?" 같은 확인 창을 띄우고 사용자의 선택을 돌려준다.
 * 웹과 휴대폰에서 확인 창을 띄우는 방법이 달라 여기에서 맞춘다.
 */
export function confirm(
  message: string,
  confirmLabel = "삭제",
): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("확인", message, [
      { text: "취소", style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]);
  });
}

/**
 * 어떤 오류든 화면에 보여줄 안전한 문장으로 바꾼다.
 * 데이터베이스 내부 제약 조건 이름이나 원시 SQL 오류가 그대로 노출되지 않게 정제한다.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) {
    return "알 수 없는 오류가 발생했습니다.";
  }
  const msg = error.message;
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("Network request failed")
  ) {
    return "네트워크 연결을 확인해 주세요.";
  }
  if (
    msg.includes("violates check constraint") ||
    msg.includes("violates row-level security") ||
    msg.includes("violates foreign key") ||
    msg.includes("duplicate key value")
  ) {
    return "입력한 값을 저장할 수 없습니다. 입력 내용을 다시 확인해 주세요.";
  }
  if (msg.includes("JWT") || msg.includes("token") || msg.includes("PGRST")) {
    return "요청을 처리하지 못했습니다. 다시 로그인하거나 잠시 후 시도해 주세요.";
  }
  return msg.slice(0, 200);
}
