import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';

// 로그인 여부를 확인할 때까지 시작 화면(스플래시)을 그대로 둔다.
SplashScreen.preventAutoHideAsync();

/**
 * 앱의 가장 바깥 틀.
 * 데이터 저장소, 로그인 상태, 밝은/어두운 화면 설정을 모든 화면에 제공한다.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const signedIn = session !== null;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 로그인한 사용자만 들어갈 수 있는 화면 */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        {/* 메모장. 탭 위에 전체 화면으로 열린다. */}
        <Stack.Screen name="note/[id]" />
        <Stack.Screen
          name="account"
          options={{ headerShown: true, title: '계정', headerBackTitle: '뒤로' }}
        />
      </Stack.Protected>

      {/* 로그인하지 않았을 때만 보이는 화면 */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      {/* 구글 로그인을 마치고 돌아오는 화면. 로그인 전후 모두 열릴 수 있어야 한다. */}
      <Stack.Screen name="auth-callback" />
    </Stack>
  );
}
