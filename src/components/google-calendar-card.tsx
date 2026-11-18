import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import {
  connectGoogleCalendar,
  describeGoogleResult,
  disconnectGoogleCalendar,
  fetchGoogleCalendars,
  fetchGoogleStatus,
  googleStatusKey,
  requestGoogleSync,
  selectGoogleCalendars,
  type GoogleCalendarStatus,
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
        멀어서 일정이 구글 캘린더의 &quot;멀어서&quot; 캘린더(그리고 아래에서 고른 캘린더)와 서로 맞춰져요. 휴대폰 캘린더, 노션 캘린더에서도
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

      {connected && !needsReauth && data ? (
        <CalendarPicker status={data} onReconnect={connect} busy={busy !== null} />
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

/**
 * 기본 캘린더처럼 원래 구글에 있던 캘린더도 골라서 함께 맞춘다.
 * 고른 캘린더의 일정은 앱에서도 보이고 고칠 수 있다(남이 만든 초대 등은 보기만).
 */
function CalendarPicker({
  status,
  onReconnect,
  busy,
}: {
  status: GoogleCalendarStatus;
  onReconnect: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const choices = useQuery({
    queryKey: ['google-calendar-choices'],
    enabled: open && status.canPickCalendars,
    queryFn: fetchGoogleCalendars,
    staleTime: 0,
  });

  if (!status.canPickCalendars) {
    return (
      <View style={styles.picker}>
        <ThemedText type="small" themeColor="textSecondary">
          기본 캘린더처럼 구글에 원래 있던 일정도 가져오려면, 다시 연결해서 캘린더 권한을 모두 허용해 주세요.
        </ThemedText>
        <Button
          label="다른 캘린더도 가져오기 (다시 연결)"
          variant="secondary"
          size="small"
          onPress={onReconnect}
          disabled={busy}
        />
      </View>
    );
  }

  // 아직 아무것도 누르지 않았으면 서버에 저장된 선택을 그대로 보여준다.
  const selected =
    picked ?? new Set((choices.data ?? []).filter((choice) => choice.selected).map((choice) => choice.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await selectGoogleCalendars([...selected]);
      setMessage(selected.size > 0 ? '고른 캘린더의 일정을 가져왔어요.' : '함께 맞추는 캘린더를 모두 뺐어요.');
      setPicked(null);
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const names = status.calendars.map((calendar) => calendar.name);

  return (
    <View style={styles.picker}>
      <ThemedText type="small" themeColor="textSecondary">
        {names.length > 0
          ? `함께 맞추는 캘린더: ${names.join(', ')}`
          : '구글에 원래 있던 캘린더(기본 캘린더 등)도 골라서 가져올 수 있어요.'}
      </ThemedText>

      {open ? (
        <View style={styles.list}>
          {choices.isLoading ? (
            <ThemedText type="small" themeColor="textSecondary">
              캘린더 목록을 불러오는 중…
            </ThemedText>
          ) : choices.isError ? (
            <ThemedText type="small" themeColor="danger">
              {errorMessage(choices.error)}
            </ThemedText>
          ) : (choices.data ?? []).length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              고를 수 있는 캘린더가 없어요.
            </ThemedText>
          ) : (
            (choices.data ?? []).map((choice) => {
              const readOnly = choice.accessRole !== 'owner' && choice.accessRole !== 'writer';
              const checked = selected.has(choice.id);
              return (
                <Pressable
                  key={choice.id}
                  style={styles.row}
                  onPress={() => toggle(choice.id)}
                  disabled={saving}
                  // 화면 낭독기에는 안쪽 체크 상자 하나만 읽히게 한다(두 번 읽지 않게).
                  accessible={false}>
                  <Checkbox checked={checked} onPress={() => toggle(choice.id)} label={choice.name} disabled={saving} />
                  <View style={[styles.dot, { backgroundColor: choice.color ?? '#9e9e9e' }]} />
                  <View style={styles.rowText}>
                    <ThemedText type="default" numberOfLines={1}>
                      {choice.name}
                    </ThemedText>
                    {choice.primary || readOnly ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {[choice.primary ? '기본 캘린더' : null, readOnly ? '보기만 할 수 있어요' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
          <ThemedText type="small" themeColor="textSecondary">
            새로 만드는 일정은 &quot;멀어서&quot; 캘린더에 들어가요. 남이 보낸 회의 초대는 앱에서 보기만 할 수 있어요.
            빼 버린 캘린더의 일정은 앱에서만 사라지고 구글에는 그대로 있어요.
          </ThemedText>
          <View style={styles.buttons}>
            <Button label="저장" size="small" onPress={save} loading={saving} disabled={saving || !choices.data} />
            <Button
              label="닫기"
              variant="secondary"
              size="small"
              onPress={() => {
                setOpen(false);
                setPicked(null);
              }}
              disabled={saving}
            />
          </View>
        </View>
      ) : (
        <Button
          label="가져올 캘린더 고르기"
          variant="secondary"
          size="small"
          onPress={() => {
            setOpen(true);
            setMessage(null);
            setError(null);
          }}
          disabled={busy}
        />
      )}

      {message ? <ThemedText type="small">{message}</ThemedText> : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  info: {
    gap: Spacing.one,
  },
  picker: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: Radius.full,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  buttons: {
    gap: Spacing.two,
  },
});
