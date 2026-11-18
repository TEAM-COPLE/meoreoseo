import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { AppLoadingScreen } from '@/components/ui/loading-animation';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { completeSignInFromUrl } from '@/lib/social-auth';

/**
 * 구글·카카오 로그인을 마치고 돌아오는 화면.
 * 주소에 담긴 로그인 결과를 처리한 뒤, 성공하면 첫 화면으로 보내고 실패하면 이유를 보여준다.
 */
export default function AuthCallbackScreen() {
  const theme = useTheme();
  const { session, loading } = useAuth();
  const linkingUrl = Linking.useLinkingURL();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!session || navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace('/');
  }, [session]);

  useEffect(() => {
    let active = true;
    // 이 화면을 연 주소. 웹에서는 브라우저 주소창의 주소를 쓴다.
    const url = linkingUrl ?? (Platform.OS === 'web' ? window.location.href : '');
    if (!url) {
      const fallbackTimer = setTimeout(() => {
        if (active) setDone(true);
      }, 1500);
      return () => {
        active = false;
        clearTimeout(fallbackTimer);
      };
    }

    completeSignInFromUrl(url)
      .then((message) => {
        if (!active) return;
        setError(message);
        setDone(true);
      })
      .catch(() => {
        if (!active) return;
        setError('로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.');
        setDone(true);
      });

    return () => {
      active = false;
    };
  }, [linkingUrl]);

  useEffect(() => {
    if (session || error || loading || !done || navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace('/sign-in');
  }, [done, error, loading, session]);

  if (error) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <ThemedText type="default" style={styles.centered}>
          로그인하지 못했습니다.
        </ThemedText>
        <ThemedText type="small" themeColor="danger" style={styles.centered}>
          {error}
        </ThemedText>
        <Button
          label="로그인 화면으로"
          variant="secondary"
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    );
  }

  return <AppLoadingScreen statusText="로그인하는 중…" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
});
