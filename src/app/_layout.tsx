import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { ThemeModeProvider, useColorScheme } from '@/hooks/use-theme';
import { NotificationSync } from '@/components/notification-sync';
import { SafeBoundary } from '@/components/safe-boundary';
import { WidgetSync } from '@/components/widget-sync';
import { ConfirmRootHost } from '@/components/ui/confirm-modal';
import { InitialDbLoadingOverlay } from '@/components/ui/loading-animation';
import { useAutoUpdateOnAppActive } from '@/lib/app-version';
import { AuthProvider, useAuth } from '@/lib/auth';
import { installGlobalErrorHandler } from '@/lib/error-report';
import { notificationsSupported } from '@/lib/notifications';
import { queryClient } from '@/lib/query';

// 초기 상태를 확인할 때까지 시작 화면(스플래시)을 그대로 둔다.
SplashScreen.preventAutoHideAsync().catch(() => {});

// 앱이 멈출 정도의 큰 오류도 휴대폰 알림으로 알리고 DB 에 기록한다(src/lib/error-report.ts).
installGlobalErrorHandler();

/**
 * 화면을 그리다 생긴 오류로 앱이 종료되지 않게, Expo Router 가 이 화면을 대신 보여준다.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={fallbackStyles.root}>
      <Text style={fallbackStyles.title}>앱에서 문제가 발생했습니다</Text>
      <Text style={fallbackStyles.message} numberOfLines={8}>
        {error?.message ?? String(error)}
      </Text>
      <Pressable accessibilityRole="button" onPress={retry} style={fallbackStyles.button}>
        <Text style={fallbackStyles.buttonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

/**
 * 앱의 가장 바깥 틀.
 * 데이터 저장소, 로그인 상태(필수), 밝은/어두운 화면 설정을 모든 화면에 제공한다.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeModeProvider>
          <AuthProvider>
            <ThemedRootNavigator />
          </AuthProvider>
        </ThemeModeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const AMOLED_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.tint,
    background: Colors.dark.background,
    card: '#0A0A0C',
    text: Colors.dark.text,
    border: Colors.dark.border,
    notification: Colors.dark.tint,
  },
};

const CLEAN_LIGHT_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.tint,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
    notification: Colors.light.tint,
  },
};

function ThemedRootNavigator() {
  const colorScheme = useColorScheme();
  const { session, isDevMode, loading } = useAuth();
  const signedIn = session !== null || isDevMode;
  const backgroundSyncReady = useDeferredReady(signedIn && !loading);
  useAutoUpdateOnAppActive();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? AMOLED_DARK_THEME : CLEAN_LIGHT_THEME}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* 로그인된 상태에서 휴대폰의 예약 알림과 홈 화면 위젯을 데이터와 맞춘다. 화면에는 보이지 않는다.
          로그인·첫 화면 전환이 끝난 뒤에 시작해, 실행 직후 부담과 충돌을 줄인다. */}
      {backgroundSyncReady && notificationsSupported ? (
        <SafeBoundary name="notification-sync">
          <NotificationSync />
        </SafeBoundary>
      ) : null}
      {backgroundSyncReady ? (
        <SafeBoundary name="widget-sync">
          <WidgetSync />
        </SafeBoundary>
      ) : null}

      {!loading ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={signedIn} redirectTo="/sign-in">
            <Stack.Screen name="(tabs)" />
            {/* 메모장. 탭 위에 전체 화면으로 열린다. */}
            <Stack.Screen name="note/[id]" />
            {/* 습관 관리. 오늘 화면에서 연다. */}
            <Stack.Screen name="habits" />
            {/* 하루 루틴 관리. 오늘 화면에서 연다. */}
            <Stack.Screen name="routines" />
            <Stack.Screen
              name="settings"
              options={{ headerShown: true, title: '설정', headerBackTitle: '뒤로' }}
            />
            {/* 예전 주소. 설정 화면으로 바로 넘어간다. */}
            <Stack.Screen name="account" />
          </Stack.Protected>

          <Stack.Protected guard={!signedIn} redirectTo="/">
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>

          {/* 구글·카카오 로그인을 마치고 돌아오는 화면 */}
          <Stack.Screen name="auth-callback" />
        </Stack>
      ) : null}
      <ConfirmRootHost />
      <InitialDbLoadingOverlay authLoading={loading} signedIn={signedIn} />
    </ThemeProvider>
  );
}

/**
 * active 가 true 가 된 뒤, 화면 전환 애니메이션이 끝날 만큼 잠시 기다렸다가 true 를 돌려준다.
 * active 가 false 가 되면 즉시 false 로 돌아간다.
 */
function useDeferredReady(active: boolean, delayMs = 1500): boolean {
  const [ready, setReady] = useState(false);
  const [prevActive, setPrevActive] = useState(active);

  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) setReady(false);
  }

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return active && ready;
}

const fallbackStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#000000',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#8B8B96',
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  buttonText: {
    color: '#000000',
    fontWeight: '700',
  },
});
