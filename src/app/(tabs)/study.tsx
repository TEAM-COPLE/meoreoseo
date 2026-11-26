import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StudyGroupsPanel } from '@/components/study/groups-panel';
import { StudyProfileForm } from '@/components/study/profile-form';
import { StudyRankingPanel } from '@/components/study/ranking-panel';
import { StudyRecordsPanel } from '@/components/study/records-panel';
import { StudyTimerPanel } from '@/components/study/timer-panel';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { useStudyProfile } from '@/hooks/use-study';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';

type Section = 'timer' | 'records' | 'groups' | 'ranking';

const SECTIONS = [
  { value: 'timer', label: '⏱ 타이머' },
  { value: 'records', label: '📊 기록' },
  { value: 'groups', label: '👥 그룹' },
  { value: 'ranking', label: '🏆 랭킹' },
] as const;

/**
 * 공부 탭.
 * - 타이머: 과목별로 공부 시간을 잰다
 * - 기록: 연속 공부 일수, 주간 그래프, 월간 달력
 * - 그룹: 친구와 스터디 그룹을 만들어 서로의 공부 시간을 본다
 * - 랭킹: 참여한 모든 사람의 순위
 */
export default function StudyScreen() {
  const { session } = useAuth();
  const profile = useStudyProfile();
  const [section, setSection] = useState<Section>('timer');
  const [editingProfile, setEditingProfile] = useState(false);

  // 로그인 없이 쓰는 개발 모드에서는 기록을 서버에 저장할 수 없다.
  if (!session) {
    return (
      <Screen title="공부">
        <Card>
          <ThemedText type="smallBold">공부 타이머는 로그인해야 쓸 수 있어요</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            공부 시간은 서버에 저장되어 친구와 비교하는 데 쓰여요. 구글이나 카카오로 로그인해 주세요.
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  const needsProfile = (section === 'groups' || section === 'ranking') && profile.data === null;

  return (
    <Screen
      title="공부"
      onRefresh={() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['study-sessions'] }),
          queryClient.invalidateQueries({ queryKey: ['study-board'] }),
          queryClient.invalidateQueries({ queryKey: ['study-ranking'] }),
          queryClient.invalidateQueries({ queryKey: ['study-groups'] }),
          profile.refetch(),
        ])
      }
      action={
        profile.data ? (
          <Button
            label={`🙂 ${profile.data.nickname}`}
            size="small"
            variant="secondary"
            onPress={() => setEditingProfile(true)}
          />
        ) : undefined
      }>
      <Segmented options={SECTIONS} value={section} onChange={setSection} />

      {profile.data?.status_message && section === 'timer' ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.motto}>
          “{profile.data.status_message}”
        </ThemedText>
      ) : null}

      {needsProfile ? (
        <Card highlight>
          <ThemedText type="smallBold">먼저 공부 프로필을 만들어 주세요</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            그룹과 랭킹에서는 닉네임으로 보여요. 실제 이름이나 이메일은 다른 사람에게 보이지 않아요.
          </ThemedText>
          <View style={styles.row}>
            <Button label="프로필 만들기" size="small" onPress={() => setEditingProfile(true)} />
          </View>
        </Card>
      ) : null}

      {section === 'timer' ? <StudyTimerPanel profile={profile.data} /> : null}
      {section === 'records' ? <StudyRecordsPanel profile={profile.data} /> : null}
      {section === 'groups' && profile.data ? <StudyGroupsPanel /> : null}
      {section === 'ranking' && profile.data ? <StudyRankingPanel profile={profile.data} /> : null}

      {editingProfile ? (
        <StudyProfileForm profile={profile.data ?? null} onClose={() => setEditingProfile(false)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  motto: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
