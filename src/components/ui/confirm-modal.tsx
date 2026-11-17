import { useEffect, useId, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ConfirmOptions = {
  /** 제목 (예: '할 일 3개를 삭제할까요?') */
  title?: string;
  /** 상세 설명 */
  message: string;
  /** 확인 버튼 글자 (기본: '삭제') */
  confirmLabel?: string;
  /** 취소 버튼 글자 (기본: '취소') */
  cancelLabel?: string;
  /** true 면 빨간 삭제 스타일, false 면 기본 강조 스타일 (기본: true) */
  destructive?: boolean;
};

type ActiveConfirm = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (accepted: boolean) => void;
};

let activeConfirm: ActiveConfirm | null = null;
const overlaySlotStack: string[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 현재 등록된 호스트가 있는지 확인한다. */
export function hasConfirmHost(): boolean {
  return listeners.size > 0;
}

/** 현재 확인 창이 열려 있는지 확인한다. */
export function hasActiveConfirm(): boolean {
  return activeConfirm !== null;
}

/**
 * 디자인된 확인 창을 띄우고 사용자의 선택(true/false)을 돌려준다.
 * FormModal 이 열려 있으면 그 안의 오버레이 슬롯에서, 아니면 루트 Modal 에서 띄운다.
 */
export function showConfirm(
  input: string | ConfirmOptions,
  confirmLabel = '삭제',
): Promise<boolean> {
  Keyboard.dismiss();

  if (activeConfirm) {
    activeConfirm.resolve(false);
    activeConfirm = null;
  }

  const options: ConfirmOptions = typeof input === 'string' ? { message: input, confirmLabel } : input;
  const destructive = options.destructive ?? true;
  const label = options.confirmLabel ?? confirmLabel;

  return new Promise<boolean>((resolve) => {
    activeConfirm = {
      title: options.title ?? (destructive ? '정말 삭제할까요?' : '확인해 주세요'),
      message: options.message,
      confirmLabel: label,
      cancelLabel: options.cancelLabel ?? '취소',
      destructive,
      resolve,
    };
    notify();
  });
}

function finishConfirm(accepted: boolean) {
  if (!activeConfirm) return;
  const current = activeConfirm;
  activeConfirm = null;
  notify();
  current.resolve(accepted);
}

/** 열려 있는 확인 창을 취소로 닫는다. 닫을 창이 있었으면 true. */
export function dismissActiveConfirm(): boolean {
  if (!activeConfirm) return false;
  finishConfirm(false);
  return true;
}

/** 루트 레이아웃(_layout.tsx)에 한 번만 두는 확인 창 호스트. */
export function ConfirmRootHost() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1));
  }, []);

  if (!activeConfirm || overlaySlotStack.length > 0) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => finishConfirm(false)}>
      <ConfirmBackdrop confirm={activeConfirm} />
    </Modal>
  );
}

/**
 * FormModal 처럼 이미 Modal 을 띄운 화면 안에서 확인 창을 겹쳐 띄우기 위한 슬롯.
 * iOS 등에서 네이티브 Modal 두 개를 동시에 띄울 때 생기는 충돌을 피한다.
 */
export function ConfirmOverlaySlot() {
  const slotId = useId();
  const [, setTick] = useState(0);

  useEffect(() => {
    overlaySlotStack.push(slotId);
    const unsub = subscribe(() => setTick((t) => t + 1));
    notify();
    return () => {
      unsub();
      const idx = overlaySlotStack.lastIndexOf(slotId);
      if (idx !== -1) overlaySlotStack.splice(idx, 1);
      notify();
    };
  }, [slotId]);

  const topSlot = overlaySlotStack[overlaySlotStack.length - 1];
  if (!activeConfirm || topSlot !== slotId) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlaySlot]} pointerEvents="box-none">
      <ConfirmBackdrop confirm={activeConfirm} />
    </View>
  );
}

function ConfirmBackdrop({ confirm }: { confirm: ActiveConfirm }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const accentColor = confirm.destructive ? theme.danger : theme.tint;
  const softBg = confirm.destructive ? theme.dangerSoft : theme.tintSoft;
  const confirmBg = confirm.destructive ? theme.dangerSolid : theme.tint;
  const confirmText = confirm.destructive ? theme.onDanger : theme.onTint;

  return (
    <View
      style={[
        styles.backdrop,
        {
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + Spacing.three,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="확인 창 닫기"
        style={StyleSheet.absoluteFill}
        onPress={() => finishConfirm(false)}
      />

      <View
        accessibilityViewIsModal
        style={[
          styles.dialog,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
          },
        ]}>
        <View style={[styles.iconBadge, { backgroundColor: softBg }]}>
          {confirm.destructive ? (
            <TrashGlyph color={accentColor} surfaceColor={softBg} />
          ) : (
            <InfoGlyph color={accentColor} />
          )}
        </View>

        <View style={styles.textGroup}>
          <ThemedText accessibilityRole="header" style={styles.title}>
            {confirm.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {confirm.message}
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => finishConfirm(false)}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: theme.backgroundElement,
                opacity: pressed ? 0.72 : 1,
              },
            ]}>
            <ThemedText type="default" style={[styles.cancelText, { color: theme.text }]}>
              {confirm.cancelLabel}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => finishConfirm(true)}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: confirmBg,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <ThemedText type="default" style={[styles.confirmText, { color: confirmText }]}>
              {confirm.confirmLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** 플랫폼마다 들쭉날쭉한 이모지 대신 깔끔한 도형으로 그린 휴지통 아이콘. */
function TrashGlyph({ color, surfaceColor }: { color: string; surfaceColor: string }) {
  return (
    <View style={styles.glyphWrap}>
      <View style={[styles.trashHandle, { borderColor: color }]} />
      <View style={[styles.trashLid, { backgroundColor: color }]} />
      <View style={[styles.trashBody, { backgroundColor: color }]}>
        <View style={[styles.trashSlot, { backgroundColor: surfaceColor }]} />
        <View style={[styles.trashSlot, { backgroundColor: surfaceColor }]} />
      </View>
    </View>
  );
}

function InfoGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyphWrap}>
      <View style={[styles.infoBar, { backgroundColor: color }]} />
      <View style={[styles.infoDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlaySlot: {
    zIndex: 100,
    elevation: 24,
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    gap: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
  glyphWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashHandle: {
    width: 8,
    height: 3.5,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    marginBottom: 1,
  },
  trashLid: {
    width: 18,
    height: 2.2,
    borderRadius: 1.5,
    marginBottom: 2,
  },
  trashBody: {
    width: 14,
    height: 13,
    borderBottomLeftRadius: 3.5,
    borderBottomRightRadius: 3.5,
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  trashSlot: {
    width: 1.8,
    height: 7.5,
    borderRadius: 1,
  },
  infoBar: {
    width: 3,
    height: 11,
    borderRadius: 2,
    marginBottom: 3,
  },
  infoDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: Radius.full,
  },
});
