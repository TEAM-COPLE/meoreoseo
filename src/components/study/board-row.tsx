import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock, rankLabel } from '@/lib/study';

import { LiveBadge } from './common';

/** 그룹·랭킹 목록의 한 줄: 등수, 닉네임, 공부 중 표시, 한 줄 다짐, 공부 시간 */
export function BoardRow({
  rank,
  nickname,
  statusMessage,
  seconds,
  live,
  liveSubject,
  isMe,
  isOwner = false,
  onLongPress,
}: {
  rank: number;
  nickname: string;
  statusMessage: string;
  seconds: number;
  live: boolean;
  liveSubject?: string | null;
  isMe: boolean;
  isOwner?: boolean;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const top = rank <= 3;
  return (
    <Pressable
      disabled={!onLongPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      accessibilityLabel={`${rank}등 ${nickname}${live ? ' 공부 중' : ''}`}
      style={[
        styles.row,
        {
          backgroundColor: isMe ? theme.tintSoft : theme.backgroundElement,
          borderColor: isMe ? theme.tint : theme.border,
        },
      ]}>
      <ThemedText style={[styles.rank, top && styles.medal]} themeColor={top ? 'text' : 'textSecondary'}>
        {rankLabel(rank)}
      </ThemedText>
      <View style={styles.body}>
        <View style={styles.nameLine}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
            {isOwner ? '👑 ' : ''}
            {nickname}
            {isMe ? ' (나)' : ''}
          </ThemedText>
          {live ? <LiveBadge label={liveSubject ? `${liveSubject} 공부 중` : '공부 중'} /> : null}
        </View>
        {statusMessage ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {statusMessage}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText
        style={[styles.time, { color: live ? theme.success : theme.text }]}
        accessibilityLabel={`${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`}>
        {formatClock(seconds)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  rank: {
    width: 30,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 15,
  },
  medal: {
    fontSize: 22,
    lineHeight: 28,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  name: {
    flexShrink: 1,
  },
  time: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
