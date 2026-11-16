import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NotificationSettingsCard } from '@/components/notification-settings-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function AccountScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(errorMessage(signOutError));
      setBusy(false);
    }
    // 로그아웃에 성공하면 src/app/_layout.tsx 가 로그인 화면으로 보낸다.
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            로그인한 계정
          </ThemedText>
          <ThemedText type="default">{session?.user.email ?? '알 수 없음'}</ThemedText>
        </Card>

        <NotificationSettingsCard />

        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}

        <Button label="로그아웃" variant="secondary" onPress={signOut} loading={busy} />
      </View>
    </View>
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
