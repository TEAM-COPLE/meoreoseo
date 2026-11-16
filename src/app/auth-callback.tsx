import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    let active = true;
    // 이 화면을 연 주소. 웹에서는 브라우저 주소창의 주소를 쓴다.
    const url = linkingUrl ?? (Platform.OS === 'web' ? window.location.href : '');

    completeSignInFromUrl(url).then((message) => {
      if (!active) return;
      setError(message);
      setDone(true);
    });

    return () => {
      active = false;
    };
  }, [linkingUrl]);

  if (session) return <Redirect href="/" />;

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

  if (loading || !done) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          로그인하는 중…
        </ThemedText>
      </View>
    );
  }

  // 처리할 로그인 결과가 없으면 로그인 화면으로 돌려보낸다.
  return <Redirect href="/sign-in" />;
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
