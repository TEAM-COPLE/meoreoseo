import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { NotificationSettingsCard } from '@/components/notification-settings-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode, type ThemeMode } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { syncAllWidgets } from '@/lib/widget-sync';

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
  const [syncingWidget, setSyncingWidget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn = session !== null;

  async function signOut() {
    setBusy(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) {
      setError(errorMessage(signOutError));
    }
  }

  async function refreshWidgets() {
    setSyncingWidget(true);
    try {
      await syncAllWidgets(true);
    } finally {
      setSyncingWidget(false);
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

      <Card>
        <ThemedText type="smallBold">안드로이드 홈 화면 위젯</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          홈 화면을 길게 눌러 &quot;멀어서 통합 위젯&quot; 또는 기능별 위젯(할 일, 일정, 습관, 메모,
          가계부)을 배치하면 앱을 열지 않고도 모든 기능을 확인하고 바로 체크·기록할 수 있습니다.
        </ThemedText>
        <Button
          label="위젯 지금 새로고침"
          variant="secondary"
          size="small"
          onPress={refreshWidgets}
          loading={syncingWidget}
        />
      </Card>

      <NotificationSettingsCard />

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <Card>
        <ThemedText type="smallBold">데이터 저장 방식</ThemedText>
        {signedIn ? (
          <>
            <ThemedText type="default">{session.user.email ?? '로그인된 계정'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              계정에 로그인되어 있어 할 일, 일정, 습관, 메모, 가계부가 데이터베이스에 저장됩니다.
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText type="default">기기 내 저장 (비로그인)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              계정 없이도 모든 기능을 이용할 수 있으며, 작성한 데이터는 이 기기 안에 저장됩니다.
              계정에 로그인하면 데이터를 데이터베이스에 저장하고 다른 기기와 동기화할 수 있습니다.
            </ThemedText>
          </>
        )}
      </Card>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      {signedIn ? (
        <Button label="로그아웃" variant="secondary" onPress={signOut} loading={busy} />
      ) : (
        <Button label="계정 로그인 / 연동하기" onPress={() => router.push('/sign-in')} />
      )}
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
