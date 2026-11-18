import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { enterDevMode, useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { signInWith, type SocialProvider } from '@/lib/social-auth';

// 각 회사가 정해 둔 버튼 색. 밝은 화면·어두운 화면에서 똑같이 쓴다.
const GOOGLE_COLORS = { background: '#FFFFFF', text: '#1F1F1F' };
const KAKAO_COLORS = { background: '#FEE500', text: '#191919' };
// 개인정보처리방침·이용약관이 있는 웹사이트 (public/privacy.html, public/terms.html)
const SITE = 'https://meoreoseo.vercel.app';

export default function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session, isDevMode } = useAuth();
  // 지금 로그인을 진행 중인 서비스. 아무것도 안 하고 있으면 null.
  const [busy, setBusy] = useState<SocialProvider | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (session || isDevMode) return <Redirect href="/" />;

  async function signIn(provider: SocialProvider) {
    setBusy(provider);
    setError(null);
    try {
      setError(await signInWith(provider));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function startDevMode() {
    setBusy('dev');
    setError(null);
    try {
      await enterDevMode();
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
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + Spacing.five,
        },
      ]}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <ThemedText accessibilityRole="header" style={styles.brand}>
            멀어서
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            계정에 로그인하면 할 일, 일정, 습관, 메모, 가계부를 온라인에 안전하게 저장하고 여러
            기기에서 이어서 쓸 수 있습니다.
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
          <Button
            label="개발 모드 (로그인 없이 기기에만 저장)"
            variant="secondary"
            onPress={startDevMode}
            loading={busy === 'dev'}
            disabled={busy !== null}
          />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
        </View>

        {/* 구글이 "홈페이지에서 개인정보처리방침으로 갈 수 있어야 한다"고 요구해서 둔 링크 */}
        <View style={styles.links}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityRole="link"
            style={styles.link}
            onPress={() => Linking.openURL(`${SITE}/privacy`)}>
            개인정보처리방침
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ·
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityRole="link"
            style={styles.link}
            onPress={() => Linking.openURL(`${SITE}/terms`)}>
            이용약관
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
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
