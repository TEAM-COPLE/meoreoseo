import { Check, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  /** 전체 화면 배경색 (비행기: 파란색, 지하철: 종착역 호선 색) */
  backgroundColor: string;
  icon: LucideIcon;
  /** 상단 작은 배지 (예: "KE 1201" 또는 "2호선") */
  badge: string;
  /** 목적지 설명 (예: "인천(ICN) → 제주(CJU)" 또는 "강남역") */
  destination: string;
  /** 공부 기록 저장하기 버튼 동작 */
  onSave?: () => void;
  saving?: boolean;
  /** 화면을 터치했을 때 호출 */
  onDismiss: () => void;
};

/**
 * 비행기·지하철 목적지 도착 시 전체 화면 색이 부드럽게 바뀌며
 * "도착했습니다!" 문구와 공부 기록 저장 버튼을 띄우는 오버레이.
 * 화면을 터치하기 전까지 유지된다.
 */
export function ArrivalOverlay({
  visible,
  backgroundColor,
  icon: Icon,
  badge,
  destination,
  onSave,
  saving = false,
  onDismiss,
}: Props) {
  const [fade] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.9));
  const [translateY] = useState(() => new Animated.Value(18));

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      scale.setValue(0.9);
      translateY.setValue(18);
      return;
    }

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 16,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, fade, scale, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor,
          opacity: fade,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="도착 안내 닫기"
        accessibilityHint="화면을 터치하면 안내가 닫힙니다"
        onPress={onDismiss}
        style={styles.touchArea}>
        <Animated.View
          style={[
            styles.content,
            {
              transform: [{ scale }, { translateY }],
            },
          ]}>
          <View style={styles.iconCircle}>
            <Icon size={40} color="#FFFFFF" strokeWidth={1.9} />
          </View>

          <View style={styles.badge}>
            <ThemedText type="smallBold" style={styles.badgeText}>
              {badge}
            </ThemedText>
          </View>

          <ThemedText style={styles.title}>도착했습니다!</ThemedText>

          <ThemedText type="default" style={styles.destination}>
            {destination}
          </ThemedText>

          {onSave ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="공부 기록 저장하기"
              disabled={saving}
              onPress={(e) => {
                e.stopPropagation();
                onSave();
              }}
              style={({ pressed }) => [
                styles.saveBtn,
                { opacity: saving ? 0.65 : pressed ? 0.82 : 1 },
              ]}>
              {saving ? (
                <ActivityIndicator size="small" color={backgroundColor} />
              ) : (
                <>
                  <Check size={18} color={backgroundColor} strokeWidth={2.6} />
                  <ThemedText
                    type="default"
                    style={[styles.saveBtnText, { color: backgroundColor }]}>
                    공부 기록 저장하기
                  </ThemedText>
                </>
              )}
            </Pressable>
          ) : null}
        </Animated.View>

        <ThemedText type="small" style={styles.hint}>
          화면을 터치하면 돌아갑니다
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
  },
  touchArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  badgeText: {
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  destination: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    textAlign: 'center',
  },
  saveBtn: {
    marginTop: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  saveBtnText: {
    fontWeight: '700',
  },
  hint: {
    position: 'absolute',
    bottom: 48,
    color: 'rgba(255, 255, 255, 0.72)',
  },
});
