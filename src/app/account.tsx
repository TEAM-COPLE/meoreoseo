import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { NotificationSettingsCard } from '@/components/notification-settings-card';
import { ThemedText } from '@/components/themed-text';
import { VersionInfoCard } from '@/components/version-info-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode, type ThemeMode } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '라이트 모드' },
  { value: 'dark', label: '다크 모드' },
  { value: 'system', label: '기기 설정' },
];

export default function AccountScreen() {
  const theme = useTheme();
  const { mode, resolvedScheme, setMode } = useThemeMode();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) {
      setError(errorMessage(signOutError));
    }
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}>
      <Card>
        <ThemedText type="smallBold">화면 테마</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          현재 {resolvedScheme === 'dark' ? '다크 모드' : '라이트 모드'}가 적용되어 있습니다.
        </ThemedText>
        <Segmented options={THEME_OPTIONS} value={mode} onChange={setMode} />
      </Card>

      <NotificationSettingsCard />

      <Card>
        <ThemedText type="smallBold">로그인된 계정</ThemedText>
        <ThemedText type="default">{session?.user.email ?? '로그인된 계정'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          할 일, 일정, 습관, 메모, 가계부가 온라인 계정의 데이터베이스에 저장됩니다.
        </ThemedText>
      </Card>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <Button label="로그아웃" variant="secondary" onPress={signOut} loading={busy} />

      <VersionInfoCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
