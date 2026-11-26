import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { FormModal } from '@/components/ui/form-modal';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { useSaveStudyProfile } from '@/hooks/use-study';
import { errorMessage } from '@/lib/format';
import { NICKNAME_MAX, nicknameProblem, type StudyProfile } from '@/lib/study';

const GOAL_OPTIONS = [60, 120, 180, 240, 300, 360, 480, 600].map((minutes) => ({
  value: minutes,
  label: `${minutes / 60}시간`,
}));

const RANKING_OPTIONS = [
  { value: 'on', label: '🏆 참여하기' },
  { value: 'off', label: '참여 안 함' },
] as const;

/**
 * 공부 프로필 만들기·고치기.
 * 닉네임은 그룹·랭킹에서 다른 사람에게 보이는 이름이다. (실제 이름이나 이메일은 보이지 않는다)
 */
export function StudyProfileForm({
  profile,
  onClose,
}: {
  profile: StudyProfile | null;
  onClose: () => void;
}) {
  const save = useSaveStudyProfile();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [message, setMessage] = useState(profile?.status_message ?? '');
  const [goal, setGoal] = useState(profile?.daily_goal_minutes ?? 180);
  const [ranking, setRanking] = useState<'on' | 'off'>(profile?.public_ranking ? 'on' : 'off');
  const [error, setError] = useState<string | null>(null);

  // 예전에 정한 목표가 위 목록에 없으면 목록에 끼워 넣는다.
  const goalOptions = GOAL_OPTIONS.some((option) => option.value === goal)
    ? GOAL_OPTIONS
    : [...GOAL_OPTIONS, { value: goal, label: `${Math.round(goal / 6) / 10}시간` }].sort(
        (a, b) => a.value - b.value,
      );

  async function submit() {
    const problem = nicknameProblem(nickname);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await save.mutateAsync({
        nickname: nickname.trim(),
        status_message: message.trim(),
        daily_goal_minutes: goal,
        public_ranking: ranking === 'on',
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={profile ? '공부 프로필 수정' : '공부 프로필 만들기'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending}
      error={error}>
      <TextField
        label="닉네임 (다른 사람에게 보이는 이름)"
        value={nickname}
        onChangeText={(text) => {
          setNickname(text);
          setError(null);
        }}
        placeholder="예: 합격하는곰"
        maxLength={NICKNAME_MAX}
        autoFocus={!profile}
      />
      <TextField
        label="한 줄 다짐 (선택)"
        value={message}
        onChangeText={setMessage}
        placeholder="예: 오늘도 3시간!"
        maxLength={40}
      />
      <Segmented label="하루 목표" options={goalOptions} value={goal} onChange={setGoal} />
      <Segmented label="전체 랭킹" options={RANKING_OPTIONS} value={ranking} onChange={setRanking} />
      <ThemedText type="small" themeColor="textSecondary">
        전체 랭킹에 참여하면 멀어서를 쓰는 모든 사람에게 닉네임과 공부 시간이 보여요. 스터디 그룹
        사람들에게는 참여 여부와 관계없이 보여요.
      </ThemedText>
    </FormModal>
  );
}
