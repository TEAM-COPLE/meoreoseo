import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { BoardRow } from '@/components/study/board-row';
import { useNow } from '@/components/study/common';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import {
  useKickStudyGroupMember,
  useLeaveStudyGroup,
  useMyStudyGroups,
  useStudyGroupBoard,
  useUpdateStudyGroup,
} from '@/hooks/use-study';
import { useTheme } from '@/hooks/use-theme';
import { confirm, errorMessage } from '@/lib/format';
import {
  boardSeconds,
  formatDuration,
  PERIOD_OPTIONS,
  periodRange,
  type StudyGroup,
  type StudyPeriod,
} from '@/lib/study';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/study');
}

/**
 * 스터디 그룹 자세히 보기.
 * 그룹 사람들의 오늘·이번 주·이번 달 공부 시간 순위와 "지금 공부 중" 표시를 보여 준다.
 */
export default function StudyGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const groups = useMyStudyGroups();
  const group = (groups.data ?? []).find((item) => item.id === id) ?? null;
  const [period, setPeriod] = useState<StudyPeriod>('day');
  const range = periodRange(period);
  const board = useStudyGroupBoard(group ? id : undefined, range.from, range.to);
  const leaveGroup = useLeaveStudyGroup();
  const kick = useKickStudyGroupMember();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = board.data ?? [];
  const liveCount = rows.filter((row) => row.live_started_at).length;
  const now = useNow(liveCount > 0);
  const me = rows.find((row) => row.is_me);
  const iAmOwner = me?.is_owner ?? false;

  const ranked = rows
    .map((row) => ({ ...row, seconds: boardSeconds(row, range, now) }))
    .sort((a, b) => b.seconds - a.seconds || a.nickname.localeCompare(b.nickname));
  const total = ranked.reduce((sum, row) => sum + row.seconds, 0);

  async function shareCode() {
    if (!group) return;
    const text = `멀어서 스터디 그룹 "${group.name}"에 들어와요! 공부 탭 → 그룹 → 초대 코드로 들어가기: ${group.invite_code}\nhttps://meoreoseo.vercel.app/study`;
    try {
      if (Platform.OS === 'web') {
        const nav = globalThis.navigator as Navigator | undefined;
        if (nav?.share) {
          await nav.share({ text });
        } else if (nav?.clipboard) {
          await nav.clipboard.writeText(text);
          setMessage('초대 문구를 복사했어요. 친구에게 붙여 넣어 보내세요.');
        } else {
          setMessage(`초대 코드: ${group.invite_code}`);
        }
        return;
      }
      await Share.share({ message: text });
    } catch {
      // 공유 창을 닫은 경우 등은 무시한다.
    }
  }

  async function leaveThisGroup() {
    if (!group) return;
    if (
      !(await confirm({
        title: '그룹에서 나갈까요?',
        message: iAmOwner
          ? '방장이 나가면 가장 먼저 들어온 사람이 방장이 돼요. 혼자 있었다면 그룹이 없어져요.'
          : '다시 들어오려면 초대 코드가 필요해요.',
        confirmLabel: '나가기',
      }))
    ) {
      return;
    }
    try {
      await leaveGroup.mutateAsync(group.id);
      leave();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function kickMember(userId: string, nickname: string) {
    if (!group) return;
    if (
      !(await confirm({
        title: `${nickname} 님을 내보낼까요?`,
        message: '내보낸 사람은 초대 코드로 다시 들어올 수 있어요.',
        confirmLabel: '내보내기',
      }))
    ) {
      return;
    }
    try {
      await kick.mutateAsync({ groupId: group.id, userId });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  if (!groups.isPending && !group) {
    return (
      <Screen title="스터디 그룹" onBack={leave}>
        <ListStatus
          loading={false}
          error={groups.error}
          empty
          emptyText="그룹을 찾을 수 없어요. 그룹에서 나갔거나 그룹이 없어졌을 수 있어요."
          onRetry={() => groups.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={group?.name ?? '스터디 그룹'}
      onBack={leave}
      onRefresh={() => Promise.all([groups.refetch(), board.refetch()])}
      action={
        iAmOwner ? (
          <Button label="수정" size="small" variant="secondary" onPress={() => setEditing(true)} />
        ) : undefined
      }>
      {group ? (
        <Card>
          {group.description ? <ThemedText type="small">{group.description}</ThemedText> : null}
          <View style={styles.codeRow}>
            <View style={[styles.codeBox, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                초대 코드
              </ThemedText>
              <ThemedText selectable style={styles.code}>
                {group.invite_code}
              </ThemedText>
            </View>
            <Button label="친구 초대" size="small" onPress={shareCode} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            👥 {rows.length}명 · 지금 {liveCount}명 공부 중 · {PERIOD_OPTIONS.find((o) => o.value === period)?.label}{' '}
            모두 합쳐 {formatDuration(total)}
          </ThemedText>
        </Card>
      ) : null}

      {message ? (
        <ThemedText type="small" themeColor="accentWarm">
          {message}
        </ThemedText>
      ) : null}

      <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />

      <ListStatus
        loading={groups.isPending || board.isPending}
        error={board.error}
        empty={ranked.length === 0}
        emptyText="아직 아무도 없어요."
        onRetry={() => board.refetch()}
      />

      <View style={styles.list}>
        {ranked.map((row, index) => (
          <BoardRow
            key={row.user_id}
            rank={index + 1}
            nickname={row.nickname}
            statusMessage={row.status_message}
            seconds={row.seconds}
            live={row.live_started_at !== null}
            liveSubject={row.live_subject}
            isMe={row.is_me}
            isOwner={row.is_owner}
            onLongPress={iAmOwner && !row.is_me ? () => kickMember(row.user_id, row.nickname) : undefined}
          />
        ))}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        30초마다 새로 고쳐지고, 공부 중인 사람의 시간은 실시간으로 올라가요.
        {iAmOwner ? '\n방장은 사람을 길게 눌러 내보낼 수 있어요.' : ''}
      </ThemedText>

      <Button
        label="그룹 나가기"
        variant="danger"
        size="small"
        loading={leaveGroup.isPending}
        onPress={leaveThisGroup}
      />

      {editing && group ? <EditGroupForm group={group} onClose={() => setEditing(false)} /> : null}
    </Screen>
  );
}

function EditGroupForm({ group, onClose }: { group: StudyGroup; onClose: () => void }) {
  const update = useUpdateStudyGroup();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('그룹 이름을 입력해 주세요.');
      return;
    }
    try {
      await update.mutateAsync({ id: group.id, name: name.trim(), description: description.trim() });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal title="그룹 수정" onClose={onClose} onSubmit={submit} submitting={update.isPending} error={error}>
      <TextField label="그룹 이름" value={name} onChangeText={setName} maxLength={30} />
      <TextField label="소개" value={description} onChangeText={setDescription} maxLength={100} />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  codeBox: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  code: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: 3,
  },
  list: {
    gap: Spacing.two,
  },
  footnote: {
    textAlign: 'center',
  },
});
