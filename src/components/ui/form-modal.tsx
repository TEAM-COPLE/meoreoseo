import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { ConfirmOverlaySlot, dismissActiveConfirm } from './confirm-modal';

type Props = PropsWithChildren<{
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** 넘기면 "삭제" 버튼이 함께 보인다 (수정할 때만 사용) */
  onDelete?: () => void;
  /** 저장 실패 등 보여줄 오류 문장 */
  error?: string | null;
}>;

/** 추가·수정 양식을 화면 위에 띄우는 창. */
export function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel = '저장',
  submitting = false,
  onDelete,
  error,
  children,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!dismissActiveConfirm()) onClose();
      }}>
      <View style={styles.modalRoot}>
        <KeyboardAvoidingView
          // 키보드가 올라오면 그만큼 아래를 비워 입력 칸이 가려지지 않게 한다.
          behavior="padding"
          style={[
            styles.backdrop,
            { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          <View
            accessibilityViewIsModal
            style={[
              styles.card,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <ThemedText type="default" style={styles.title}>
              {title}
            </ThemedText>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.body}
              style={styles.scroll}>
              {children}
              {error ? (
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {onDelete ? (
                <Button label="삭제" variant="danger" onPress={onDelete} disabled={submitting} />
              ) : null}
              <View style={styles.spacer} />
              <Button label="취소" variant="secondary" onPress={onClose} disabled={submitting} />
              <Button label={submitLabel} onPress={onSubmit} loading={submitting} />
            </View>
          </View>
        </KeyboardAvoidingView>
        <ConfirmOverlaySlot />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    gap: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spacer: {
    flex: 1,
  },
});
