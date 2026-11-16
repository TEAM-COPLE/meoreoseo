import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNote, type Note } from '@/hooks/use-notes';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/format';
import { createNoteAutosaver, type NoteDraft, type SaveStatus } from '@/lib/note-autosave';

const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  dirty: '저장 전',
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패',
};

/** 메모 목록으로 돌아간다. 이 화면을 주소로 바로 연 경우에는 돌아갈 곳이 없으므로 목록을 새로 연다. */
function leave() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/notes');
  }
}

/**
 * 메모장 화면. 주소는 /note/<메모 id> 이고, 새 메모는 /note/new 다.
 * 여기서는 메모를 불러오기만 하고, 실제 편집은 아래 NoteEditor 가 맡는다.
 */
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const note = useNote(isNew ? null : id);

  if (isNew) return <NoteEditor key="new" initial={null} />;

  if (note.isPending) {
    return (
      <Message>
        <ActivityIndicator />
      </Message>
    );
  }
  if (note.error) {
    return (
      <Message text="메모를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.">
        <Button label="다시 시도" variant="secondary" onPress={() => note.refetch()} />
        <Button label="목록으로" variant="secondary" onPress={leave} />
      </Message>
    );
  }
  if (!note.data) {
    return (
      <Message text="메모를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.">
        <Button label="목록으로" variant="secondary" onPress={leave} />
      </Message>
    );
  }
  return <NoteEditor key={note.data.id} initial={note.data} />;
}

function NoteEditor({ initial }: { initial: Note | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [status, setStatus] = useState<SaveStatus>(initial ? 'saved' : 'idle');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 자동 저장기는 화면이 열려 있는 동안 하나만 만들어 계속 쓴다.
  const [saver] = useState(() => createNoteAutosaver(initial?.id ?? null, setStatus));

  // 화면을 떠날 때 아직 저장하지 않은 내용이 있으면 바로 저장한다.
  useEffect(() => {
    return () => {
      saver.flush();
    };
  }, [saver]);

  /** 바뀐 값만 받아 화면에 반영하고, 전체 내용을 자동 저장기에 넘긴다. */
  function change(next: Partial<NoteDraft>) {
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    if (next.pinned !== undefined) setPinned(next.pinned);
    saver.schedule({ title, body, pinned, ...next });
  }

  async function deleteNote() {
    // 아무것도 적지 않은 새 메모는 물어보지 않고 그냥 닫는다.
    const untouched = initial === null && !title.trim() && !body.trim();
    if (!untouched && !(await confirm('이 메모를 삭제할까요?'))) return;
    setDeleting(true);
    setDeleteError(null);
    const message = await saver.remove();
    if (message) {
      setDeleteError('삭제하지 못했습니다. 다시 시도해 주세요.');
      setDeleting(false);
    } else {
      leave();
    }
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.root, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.column,
          { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.two },
        ]}>
        <View style={styles.bar}>
          <Button label="‹ 목록" variant="secondary" size="small" onPress={leave} />

          <View style={styles.status}>
            <ThemedText
              type="small"
              themeColor={status === 'error' ? 'danger' : 'textSecondary'}
              numberOfLines={1}>
              {/* 저장에 실패했을 때는 좁은 화면에서도 잘리지 않게 글자 수를 뺀다. */}
              {status === 'error'
                ? STATUS_LABELS.error
                : [STATUS_LABELS[status], `${body.length}자`].filter(Boolean).join(' · ')}
            </ThemedText>
            {status === 'error' ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => saver.flush()}>
                <ThemedText type="small" themeColor="tint">
                  다시 시도
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          <Button
            label={pinned ? '고정 해제' : '고정'}
            variant="secondary"
            size="small"
            onPress={() => change({ pinned: !pinned })}
          />
          <Button
            label="삭제"
            variant="danger"
            size="small"
            onPress={deleteNote}
            loading={deleting}
          />
        </View>

        {deleteError ? (
          <ThemedText type="small" themeColor="danger">
            {deleteError}
          </ThemedText>
        ) : null}

        <TextInput
          accessibilityLabel="제목"
          value={title}
          onChangeText={(text) => change({ title: text })}
          placeholder="제목"
          placeholderTextColor={theme.textSecondary}
          maxLength={200}
          style={[styles.title, { color: theme.text }]}
        />
        <TextInput
          accessibilityLabel="내용"
          value={body}
          onChangeText={(text) => change({ body: text })}
          placeholder="여기에 적어 보세요. 입력을 멈추면 자동으로 저장됩니다."
          placeholderTextColor={theme.textSecondary}
          multiline
          autoFocus={initial === null}
          textAlignVertical="top"
          style={[styles.body, { color: theme.text }]}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** 불러오는 중이거나 문제가 있을 때 화면 가운데에 보여주는 안내. */
function Message({ text, children }: { text?: string; children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.root, styles.message, { backgroundColor: theme.background }]}>
      {text ? (
        <ThemedText type="default" style={styles.centered}>
          {text}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  status: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    paddingVertical: Spacing.two,
  },
  body: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  message: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
});
