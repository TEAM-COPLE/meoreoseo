import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ThemeModeProvider, useColorScheme } from '@/hooks/use-theme';
import { NotificationSync } from '@/components/notification-sync';
import { AuthProvider, useAuth } from '@/lib/auth';
import { notificationsSupported } from '@/lib/notifications';
import { queryClient } from '@/lib/query';
import { useWidgetBridge } from '@/lib/widget-sync';

// 초기 상태를 확인할 때까지 시작 화면(스플래시)을 그대로 둔다.
SplashScreen.preventAutoHideAsync();

/**
 * 앱의 가장 바깥 틀.
 * 데이터 저장소, 로그인 상태(선택), 밝은/어두운 화면 설정을 모든 화면에 제공한다.
 */
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <AuthProvider>
          <ThemedRootNavigator />
        </AuthProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  );
}

function ThemedRootNavigator() {
  const colorScheme = useColorScheme();
  const { loading } = useAuth();
  useWidgetBridge();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <>
        {/* 로그인해 있는 동안 휴대폰의 예약 알림을 데이터와 맞춘다. 화면에는 보이지 않는다. */}
        {signedIn && notificationsSupported ? <NotificationSync /> : null}

        <Stack screenOptions={{ headerShown: false }}>
          {/* 로그인한 사용자만 들어갈 수 있는 화면 */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            {/* 메모장. 탭 위에 전체 화면으로 열린다. */}
            <Stack.Screen name="note/[id]" />
            {/* 습관 관리. 오늘 화면에서 연다. */}
            <Stack.Screen name="habits" />
            <Stack.Screen
              name="account"
              options={{ headerShown: true, title: '계정 및 설정', headerBackTitle: '뒤로' }}
            />
          </Stack.Protected>

          {/* 로그인하지 않았을 때만 보이는 화면 */}
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen
              name="sign-in"
              options={{ headerShown: true, title: '로그인', headerBackTitle: '뒤로' }}
            />
          </Stack.Protected>

          {/* 구글·카카오 로그인을 마치고 돌아오는 화면. 로그인 전후 모두 열릴 수 있어야 한다. */}
          <Stack.Screen name="auth-callback" />
        </Stack>
      </>
    </ThemeProvider>
  );
}
