import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/format';
import { signInWith, type SocialProvider } from '@/lib/social-auth';

// 각 회사가 정해 둔 버튼 색. 밝은 화면·어두운 화면에서 똑같이 쓴다.
const GOOGLE_COLORS = { background: '#FFFFFF', text: '#1F1F1F' };
const KAKAO_COLORS = { background: '#FEE500', text: '#191919' };

export default function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // 지금 로그인을 진행 중인 서비스. 아무것도 안 하고 있으면 null.
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: SocialProvider) {
    setBusy(provider);
    setError(null);
    try {
      // 성공하면 화면 이동은 src/app/_layout.tsx 가 알아서 처리한다.
      setError(await signInWith(provider));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + Spacing.five,
          paddingBottom: insets.bottom + Spacing.five,
        },
      ]}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <ThemedText accessibilityRole="header" style={styles.brand}>
            멀어서
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            할 일, 일정, 습관, 메모, 가계부를 한곳에서.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Button
            label="Google 계정으로 계속하기"
            colors={GOOGLE_COLORS}
            // 흰 버튼이 밝은 배경에 묻히지 않게 테두리를 준다.
            style={[styles.outlined, { borderColor: theme.border }]}
            onPress={() => signIn('google')}
            loading={busy === 'google'}
            disabled={busy !== null}
          />
          <Button
            label="카카오 로그인"
            colors={KAKAO_COLORS}
            onPress={() => signIn('kakao')}
            loading={busy === 'kakao'}
            disabled={busy !== null}
          />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            처음 로그인하면 자동으로 가입됩니다.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: Spacing.five,
  },
  heading: {
    gap: Spacing.two,
  },
  brand: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: 700,
  },
  actions: {
    gap: Spacing.three,
  },
  outlined: {
    borderWidth: 1,
  },
});
