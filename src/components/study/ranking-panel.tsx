import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, ListStatus } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { useSaveStudyProfile, useStudyRanking } from '@/hooks/use-study';
import { errorMessage } from '@/lib/format';
import {
  boardSeconds,
  formatDuration,
  PERIOD_OPTIONS,
  periodRange,
  type StudyPeriod,
  type StudyProfile,
} from '@/lib/study';

import { BoardRow } from './board-row';
import { useNow } from './common';

/**
 * 공부 탭의 "랭킹" 부분: 전체 랭킹에 참여한 사람들의 오늘·이번 주·이번 달 순위.
 */
export function StudyRankingPanel({ profile }: { profile: StudyProfile }) {
  const [period, setPeriod] = useState<StudyPeriod>('day');
  const range = useMemo(() => periodRange(period), [period]);
  const ranking = useStudyRanking(range.from, range.to);
  const save = useSaveStudyProfile();
  const [error, setError] = useState<string | null>(null);
  const anyLive = useMemo(
    () => (ranking.data ?? []).some((row) => row.live_started_at),
    [ranking.data],
  );
  const now = useNow(anyLive);

  async function join() {
    setError(null);
    try {
      await save.mutateAsync({
        nickname: profile.nickname,
        status_message: profile.status_message,
        daily_goal_minutes: profile.daily_goal_minutes,
        public_ranking: true,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // 공부 중인 사람의 시간은 실시간으로 올려서 다시 줄 세운다.
  const live = useMemo(
    () =>
      (ranking.data ?? [])
        .map((row) => ({ ...row, seconds: boardSeconds(row, range, now) }))
        .sort((a, b) => b.seconds - a.seconds || a.rank - b.rank),
    [ranking.data, range, now],
  );
  const myIndex = useMemo(() => live.findIndex((row) => row.is_me), [live]);
  const me = myIndex >= 0 ? live[myIndex] : null;
  const ahead = myIndex > 0 ? live[myIndex - 1] : null;

  return (
    <>
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />

      {!profile.public_ranking ? (
        <Card highlight>
          <ThemedText type="smallBold">🏆 전체 랭킹에 참여해 볼까요?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            참여하면 닉네임({profile.nickname})과 공부 시간이 랭킹에 보여요. 실제 이름이나 이메일은
            보이지 않고, 언제든 프로필에서 끌 수 있어요.
          </ThemedText>
          <Button label="랭킹 참여하기" size="small" loading={save.isPending} onPress={join} />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
        </Card>
      ) : me ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            내 순위
          </ThemedText>
          <ThemedText type="default" style={styles.myRank}>
            {me.rank > 100 ? me.rank : myIndex + 1}등 · {formatDuration(me.seconds)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {ahead
              ? `한 계단 위(${ahead.nickname})까지 ${formatDuration(ahead.seconds - me.seconds + 60)} 남았어요. 힘내요!`
              : '지금 1등이에요! 👑'}
          </ThemedText>
        </Card>
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            이 기간에 아직 기록이 없어요. 타이머를 켜면 랭킹에 올라가요!
          </ThemedText>
        </Card>
      )}

      <ListStatus
        loading={ranking.isPending}
        error={ranking.error}
        empty={live.length === 0}
        emptyText="아직 랭킹에 기록이 없어요. 첫 번째 주인공이 되어 보세요!"
        onRetry={() => ranking.refetch()}
      />

      <View style={styles.list}>
        {live.map((row, index) => (
          <BoardRow
            key={row.nickname}
            rank={row.rank > 100 ? row.rank : index + 1}
            nickname={row.nickname}
            statusMessage={row.status_message}
            seconds={row.seconds}
            live={row.live_started_at !== null}
            isMe={row.is_me}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        상위 100명까지 보여요. 1분마다 새로 고쳐져요.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  myRank: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
  },
  footnote: {
    textAlign: 'center',
  },
});
