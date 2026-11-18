import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import {
  connectGoogleCalendar,
  describeGoogleResult,
  disconnectGoogleCalendar,
  fetchGoogleStatus,
  googleStatusKey,
  requestGoogleSync,
} from '@/lib/google-calendar';

/** '2026-11-18T05:00:00Z' → '11월 18일 오후 2:00' */
function formatSynced(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** 구글에서 돌아올 때 받은 결과(google=…). 화면이 다시 만들어져도 안내를 보여주려고 잠깐 기억한다. */
let rememberedResult: string | null = null;

/** 계정 화면의 "구글 캘린더 연동" 카드 */
export function GoogleCalendarCard() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const client = useQueryClient();
  const key = googleStatusKey(userId);
  const status = useQuery({
    queryKey: key,
    enabled: userId !== null,
    queryFn: fetchGoogleStatus,
  });
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'sync' | null>(null);

  // 웹: 구글 로그인을 마치고 /account?google=connected 로 돌아왔을 때 안내를 띄운다.
  // 화면이 처음 열릴 때의 값만 기억해 두고, 주소에서는 바로 지운다.
  const { google } = useLocalSearchParams<{ google?: string }>();
  // (로그인 상태를 확인하는 동안 화면이 한 번 다시 만들어질 수 있어 밖에도 적어 둔다.)
  const [arrival] = useState(() => {
    const value = google ?? rememberedResult;
    rememberedResult = null;
    return value;
  });
  const [message, setMessage] = useState<string | null>(() =>
    arrival === 'connected' ? describeGoogleResult(arrival) : null,
  );
  const [error, setError] = useState<string | null>(() =>
    arrival !== 'connected' ? describeGoogleResult(arrival) : null,
  );
  useEffect(() => {
    if (!describeGoogleResult(google)) return;
    rememberedResult = google ?? null;
    router.setParams({ google: undefined });
    client.invalidateQueries({ queryKey: key });
    // 첫 동기화가 서버에서 도는 동안 잠시 뒤에 일정을 다시 불러온다.
    if (google === 'connected') {
      setTimeout(() => {
        client.invalidateQueries({ queryKey: ['events'] });
        client.invalidateQueries({ queryKey: key });
      }, 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google]);

  async function connect() {
    setBusy('connect');
    setError(null);
    setMessage(null);
    try {
      const result = await connectGoogleCalendar();
      // 휴대폰에서는 여기로 결과가 돌아온다. (웹은 페이지가 이동하므로 오지 않는다)
      const text = describeGoogleResult(result);
      if (result === 'connected') setMessage(text);
      else if (text) setError(text);
      await client.invalidateQueries({ queryKey: key });
      if (result === 'connected') requestGoogleSync(8000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy('sync');
    setError(null);
    setMessage(null);
    requestGoogleSync(0);
    // 맞추는 데 몇 초 걸린다. 버튼은 잠깐만 돌게 한다.
    setTimeout(() => setBusy(null), 3000);
  }

  async function disconnect() {
    setBusy('disconnect');
    setError(null);
    setMessage(null);
    try {
      await disconnectGoogleCalendar();
      setMessage('연결을 끊었어요. 구글 캘린더의 "멀어서" 캘린더는 남아 있으니 필요 없으면 구글에서 지워 주세요.');
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const data = status.data;
  const connected = data?.connected === true;
  const needsReauth = connected && data?.status === 'reauth';

  return (
    <Card>
      <ThemedText type="smallBold">구글 캘린더 연동</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        멀어서 일정이 구글 캘린더의 &quot;멀어서&quot; 캘린더와 서로 맞춰져요. 휴대폰 캘린더, 노션 캘린더에서도
        보고 고칠 수 있어요. (자동으로 5분마다, 그리고 일정을 고칠 때마다)
      </ThemedText>

      {status.isLoading ? (
        <ThemedText type="small" themeColor="textSecondary">
          연결 상태를 확인하는 중…
        </ThemedText>
      ) : status.isError ? (
        <ThemedText type="small" themeColor="danger">
          연결 상태를 불러오지 못했어요.
        </ThemedText>
      ) : data && !data.configured ? (
        <ThemedText type="small" themeColor="textSecondary">
          아직 서버 설정이 끝나지 않아 연결할 수 없어요. (구글 비밀 값 필요)
        </ThemedText>
      ) : connected ? (
        <View style={styles.info}>
          <ThemedText type="default">{data?.email ?? '구글 계정'}</ThemedText>
          <ThemedText type="small" themeColor={needsReauth ? 'danger' : 'textSecondary'}>
            {needsReauth
              ? '구글 연결이 끊어졌어요. 다시 연결해 주세요.'
              : data?.lastSyncedAt
                ? `마지막으로 맞춘 때: ${formatSynced(data.lastSyncedAt)}`
                : '처음 맞추는 중이에요…'}
          </ThemedText>
          {!needsReauth && data?.lastError ? (
            <ThemedText type="small" themeColor="danger">
              최근 오류: {data.lastError}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {message ? <ThemedText type="small">{message}</ThemedText> : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      {data?.configured ? (
        <View style={styles.buttons}>
          {!connected || needsReauth ? (
            <Button
              label={needsReauth ? '다시 연결하기' : '구글 캘린더 연결하기'}
              onPress={connect}
              loading={busy === 'connect'}
              disabled={busy !== null}
            />
          ) : (
            <Button
              label="지금 맞추기"
              variant="secondary"
              onPress={syncNow}
              loading={busy === 'sync'}
              disabled={busy !== null}
            />
          )}
          {connected ? (
            <Button
              label="연결 끊기"
              variant="danger"
              onPress={disconnect}
              loading={busy === 'disconnect'}
              disabled={busy !== null}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  info: {
    gap: Spacing.one,
  },
  buttons: {
    gap: Spacing.two,
  },
});
