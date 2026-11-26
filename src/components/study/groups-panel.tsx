import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useCreateStudyGroup, useJoinStudyGroup, useMyStudyGroups } from '@/hooks/use-study';
import { errorMessage } from '@/lib/format';

/**
 * 공부 탭의 "그룹" 부분: 내가 들어간 스터디 그룹 목록, 그룹 만들기, 초대 코드로 들어가기.
 */
export function StudyGroupsPanel() {
  const groups = useMyStudyGroups();
  const [form, setForm] = useState<'create' | 'join' | null>(null);
  const list = groups.data ?? [];

  return (
    <>
      <View style={styles.actions}>
        <Button label="+ 그룹 만들기" size="small" onPress={() => setForm('create')} style={styles.flex} />
        <Button
          label="초대 코드로 들어가기"
          size="small"
          variant="secondary"
          onPress={() => setForm('join')}
          style={styles.flex}
        />
      </View>

      <ListStatus
        loading={groups.isPending}
        error={groups.error}
        empty={list.length === 0}
        emptyText={
          '아직 들어간 그룹이 없어요.\n친구와 그룹을 만들고 초대 코드를 보내면, 서로 오늘 몇 시간 공부했는지와 지금 공부 중인지 볼 수 있어요.'
        }
        onRetry={() => groups.refetch()}
      />

      {list.map((group) => (
        <Card
          key={group.id}
          onPress={() => router.push({ pathname: '/study-group/[id]', params: { id: group.id } })}
          accessibilityLabel={`${group.name} 그룹 열기`}>
          <View style={styles.rowBetween}>
            <ThemedText type="default" style={styles.groupName} numberOfLines={1}>
              {group.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              👥 {group.memberCount}명 ›
            </ThemedText>
          </View>
          {group.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {group.description}
            </ThemedText>
          ) : null}
        </Card>
      ))}

      {form === 'create' ? <CreateGroupForm onClose={() => setForm(null)} /> : null}
      {form === 'join' ? <JoinGroupForm onClose={() => setForm(null)} /> : null}
    </>
  );
}

function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const create = useCreateStudyGroup();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('그룹 이름을 입력해 주세요.');
      return;
    }
    try {
      const id = await create.mutateAsync({ name: name.trim(), description: description.trim() });
      onClose();
      router.push({ pathname: '/study-group/[id]', params: { id } });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title="스터디 그룹 만들기"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="만들기"
      submitting={create.isPending}
      error={error}>
      <TextField
        label="그룹 이름"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        placeholder="예: 수능 D-100 스터디"
        maxLength={30}
        autoFocus
      />
      <TextField
        label="소개 (선택)"
        value={description}
        onChangeText={setDescription}
        placeholder="예: 하루 5시간 이상 공부하기"
        maxLength={100}
      />
      <ThemedText type="small" themeColor="textSecondary">
        만들면 8글자 초대 코드가 생겨요. 친구에게 코드를 보내 함께 공부하세요. (최대 50명)
      </ThemedText>
    </FormModal>
  );
}

function JoinGroupForm({ onClose }: { onClose: () => void }) {
  const join = useJoinStudyGroup();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cleaned = code.replace(/\s/g, '').toUpperCase();
    if (cleaned.length !== 8) {
      setError('초대 코드는 8글자예요.');
      return;
    }
    try {
      const id = await join.mutateAsync(cleaned);
      onClose();
      router.push({ pathname: '/study-group/[id]', params: { id } });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title="초대 코드로 들어가기"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="들어가기"
      submitting={join.isPending}
      error={error}>
      <TextField
        label="초대 코드"
        value={code}
        onChangeText={(text) => {
          setCode(text.toUpperCase());
          setError(null);
        }}
        placeholder="예: AB12CD34"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        autoFocus
      />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  groupName: {
    fontWeight: '700',
    flexShrink: 1,
  },
});
