import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { FormModal } from '@/components/ui/form-modal';
import { TextField } from '@/components/ui/text-field';
import { useDeleteStudySubject, useSaveStudySubject } from '@/hooks/use-study';
import { confirm, errorMessage } from '@/lib/format';
import type { StudySubject } from '@/lib/study';
import { TAG_COLOR_KEYS, type TagColor } from '@/lib/tags';

import { ColorPicker } from './common';

/** 과목 추가·수정 양식 */
export function StudySubjectForm({
  subject,
  usedColors,
  onClose,
}: {
  subject: StudySubject | null;
  /** 이미 다른 과목이 쓰는 색 (새 과목은 안 쓴 색부터 골라 준다) */
  usedColors: readonly string[];
  onClose: () => void;
}) {
  const save = useSaveStudySubject();
  const remove = useDeleteStudySubject();
  const [name, setName] = useState(subject?.name ?? '');
  const [color, setColor] = useState<TagColor>(() => {
    if (subject && (TAG_COLOR_KEYS as string[]).includes(subject.color)) return subject.color as TagColor;
    return TAG_COLOR_KEYS.find((key) => !usedColors.includes(key)) ?? 'blue';
  });
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('과목 이름을 입력해 주세요.');
      return;
    }
    try {
      await save.mutateAsync({ id: subject?.id, values: { name: name.trim(), color } });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteSubject() {
    if (
      !subject ||
      !(await confirm({
        title: '과목을 삭제할까요?',
        message: `'${subject.name}' 과목을 지워도 공부한 시간 기록은 남아요. (과목 없음으로 바뀌어요)`,
        confirmLabel: '삭제',
      }))
    ) {
      return;
    }
    try {
      await remove.mutateAsync(subject.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={subject ? '과목 수정' : '새 과목'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending}
      onDelete={subject ? deleteSubject : undefined}
      error={error}>
      <TextField
        label="과목 이름"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        placeholder="예: 수학, 토익, 코딩"
        maxLength={20}
        autoFocus={!subject}
      />
      <ThemedText type="small" themeColor="textSecondary">
        색
      </ThemedText>
      <ColorPicker value={color} onChange={setColor} />
    </FormModal>
  );
}
