/**
 * 웹용 widget-sync.
 * 홈 화면 위젯은 Android 에만 있다. 위젯 라이브러리(expo-widgets, @expo/ui)는
 * 휴대폰 전용이라 웹에서 불러오기만 해도 오류로 화면이 하얗게 멈춘다.
 * 그래서 웹에서는 이 파일이 대신 쓰이고, 아무 일도 하지 않는다.
 */

/** 웹에는 위젯이 없으므로 아무것도 하지 않는다. */
export async function syncAllWidgets(_force = false): Promise<void> {}

/** 웹에는 위젯이 없으므로 아무것도 하지 않는다. */
export function useWidgetBridge(): void {}
