import { Volume2, VolumeX, X } from 'lucide-react-native';
import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { FlightAudioSettings } from './use-flight-audio';

type SliderProps = {
  /** 0 ~ 100 정수 */
  percent: number;
  disabled?: boolean;
  tintColor: string;
  trackColor: string;
  thumbBorderColor: string;
  onChange: (nextPercent: number) => void;
  onRelease?: (finalPercent: number) => void;
};

/**
 * 0~100%를 1% 단위로 드래그·탭 조절할 수 있는 커스텀 볼륨 슬라이더.
 */
function VolumeSlider({
  percent,
  disabled = false,
  tintColor,
  trackColor,
  thumbBorderColor,
  onChange,
  onRelease,
}: SliderProps) {
  const trackRef = useRef<ComponentRef<typeof View>>(null);
  const boundsRef = useRef<{ x: number; width: number }>({ x: 0, width: 0 });
  const latestPercentRef = useRef(percent);

  function computePercent(pageX: number): number | null {
    const { x, width } = boundsRef.current;
    if (width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (pageX - x) / width));
    return Math.round(ratio * 100);
  }

  function emitFromPageX(pageX: number) {
    const next = computePercent(pageX);
    if (next === null) return;
    latestPercentRef.current = next;
    onChange(next);
  }

  function handleGrant(event: GestureResponderEvent) {
    if (disabled) return;
    const pageX = event.nativeEvent.pageX;
    const node = trackRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, _y, width) => {
        if (width > 0) {
          boundsRef.current = { x, width };
          emitFromPageX(pageX);
        }
      });
    } else {
      emitFromPageX(pageX);
    }
  }

  function handleMove(event: GestureResponderEvent) {
    if (disabled) return;
    emitFromPageX(event.nativeEvent.pageX);
  }

  function handleRelease(event: GestureResponderEvent) {
    if (disabled) return;
    const computed = computePercent(event.nativeEvent.pageX);
    const finalVal = computed ?? latestPercentRef.current;
    latestPercentRef.current = finalVal;
    onRelease?.(finalVal);
  }

  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <View
      ref={trackRef}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      onLayout={(e) => {
        boundsRef.current.width = e.nativeEvent.layout.width;
      }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      style={[styles.sliderTouchArea, { opacity: disabled ? 0.45 : 1 }]}>
      <View style={[styles.sliderTrack, { backgroundColor: trackColor }]}>
        <View
          style={[
            styles.sliderFill,
            {
              width: `${clamped}%`,
              backgroundColor: tintColor,
            },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          {
            left: `${clamped}%`,
            backgroundColor: tintColor,
            borderColor: thumbBorderColor,
          },
        ]}
      />
    </View>
  );
}

type Props = {
  visible: boolean;
  settings: FlightAudioSettings;
  onUpdate: (patch: Partial<FlightAudioSettings>) => void;
  onPreviewSignVolume?: (volume: number) => void;
  onPreviewSignPlay?: (volume: number) => void;
  onPreviewFlyVolume?: (volume: number) => void;
  onPreviewFlyRelease?: () => void;
  onClose: () => void;
};

/**
 * 비행 타이머 오디오 설정 팝업.
 * - 전체 오디오 ON/OFF
 * - 기내 사인음(시작·종료) 개별 ON/OFF + 0~100% 슬라이더 (조절 시 실시간 미리듣기)
 * - 비행 백색소음(반복) 개별 ON/OFF + 0~100% 슬라이더 (조절 시 실시간 미리듣기)
 */
export function FlightAudioPopup({
  visible,
  settings,
  onUpdate,
  onPreviewSignVolume,
  onPreviewSignPlay,
  onPreviewFlyVolume,
  onPreviewFlyRelease,
  onClose,
}: Props) {
  const theme = useTheme();
  if (!visible) return null;

  const anyActive = settings.enabled && (settings.signEnabled || settings.flyEnabled);
  const signPercent = Math.round(settings.signVolume * 100);
  const flyPercent = Math.round(settings.flyVolume * 100);

  return (
    <View style={styles.backdrop}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="오디오 설정 팝업 닫기"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.dialog,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}>
        {/* 헤더 */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {anyActive ? (
              <Volume2 size={18} color={theme.tint} strokeWidth={2} />
            ) : (
              <VolumeX size={18} color={theme.textSecondary} strokeWidth={2} />
            )}
            <ThemedText type="default" style={styles.title}>
              비행 오디오 설정
            </ThemedText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
            ]}>
            <X size={16} color={theme.text} strokeWidth={2} />
          </Pressable>
        </View>

        {/* 전체 ON/OFF */}
        <View
          style={[
            styles.masterRow,
            { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
          ]}>
          <View style={styles.masterText}>
            <ThemedText type="smallBold">오디오 재생</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {settings.enabled ? '비행 중 효과음과 백색소음을 재생해요' : '모든 비행 오디오가 꺼져 있어요'}
            </ThemedText>
          </View>

          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="전체 오디오 재생"
            accessibilityState={{ checked: settings.enabled }}
            onPress={() => onUpdate({ enabled: !settings.enabled })}
            style={({ pressed }) => [
              styles.togglePill,
              {
                backgroundColor: settings.enabled ? theme.tint : theme.backgroundElement,
                borderColor: settings.enabled ? theme.tint : theme.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            <ThemedText
              type="smallBold"
              style={{
                fontSize: 12,
                color: settings.enabled ? theme.onTint : theme.textSecondary,
              }}>
              {settings.enabled ? 'ON' : 'OFF'}
            </ThemedText>
          </Pressable>
        </View>

        {/* 개별 오디오 트랙 설정 */}
        <View style={[styles.tracksWrap, { opacity: settings.enabled ? 1 : 0.45 }]}>
          {/* 1. 기내 사인음 */}
          <View style={[styles.trackCard, { borderColor: theme.border }]}>
            <View style={styles.trackHeader}>
              <View style={styles.trackTitleCol}>
                <ThemedText type="smallBold">기내 사인음</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  시작·종료 딩동
                </ThemedText>
              </View>

              <View style={styles.trackRight}>
                <ThemedText type="smallBold" style={styles.percentText}>
                  {`${signPercent}%`}
                </ThemedText>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="기내 사인음 재생"
                  accessibilityState={{ checked: settings.signEnabled }}
                  onPress={() => onUpdate({ signEnabled: !settings.signEnabled })}
                  style={({ pressed }) => [
                    styles.togglePill,
                    {
                      backgroundColor: settings.signEnabled
                        ? theme.tint
                        : theme.backgroundSelected,
                      borderColor: settings.signEnabled ? theme.tint : theme.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{
                      fontSize: 11,
                      color: settings.signEnabled ? theme.onTint : theme.textSecondary,
                    }}>
                    {settings.signEnabled ? 'ON' : 'OFF'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <VolumeSlider
              percent={signPercent}
              disabled={!settings.signEnabled}
              tintColor={theme.tint}
              trackColor={theme.backgroundSelected}
              thumbBorderColor={theme.backgroundElement}
              onChange={(nextPercent) => {
                const nextVolume = nextPercent / 100;
                onUpdate({
                  signVolume: nextVolume,
                  ...(nextPercent > 0 && !settings.signEnabled ? { signEnabled: true } : {}),
                });
                if (settings.enabled) {
                  onPreviewSignVolume?.(nextVolume);
                }
              }}
              onRelease={(finalPercent) => {
                if (settings.enabled && settings.signEnabled) {
                  onPreviewSignPlay?.(finalPercent / 100);
                }
              }}
            />
          </View>

          {/* 2. 비행 백색소음 */}
          <View style={[styles.trackCard, { borderColor: theme.border }]}>
            <View style={styles.trackHeader}>
              <View style={styles.trackTitleCol}>
                <ThemedText type="smallBold">비행 백색소음</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  비행 중 페이드인·반복
                </ThemedText>
              </View>

              <View style={styles.trackRight}>
                <ThemedText type="smallBold" style={styles.percentText}>
                  {`${flyPercent}%`}
                </ThemedText>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="비행 백색소음 재생"
                  accessibilityState={{ checked: settings.flyEnabled }}
                  onPress={() => onUpdate({ flyEnabled: !settings.flyEnabled })}
                  style={({ pressed }) => [
                    styles.togglePill,
                    {
                      backgroundColor: settings.flyEnabled
                        ? theme.tint
                        : theme.backgroundSelected,
                      borderColor: settings.flyEnabled ? theme.tint : theme.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{
                      fontSize: 11,
                      color: settings.flyEnabled ? theme.onTint : theme.textSecondary,
                    }}>
                    {settings.flyEnabled ? 'ON' : 'OFF'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <VolumeSlider
              percent={flyPercent}
              disabled={!settings.flyEnabled}
              tintColor={theme.tint}
              trackColor={theme.backgroundSelected}
              thumbBorderColor={theme.backgroundElement}
              onChange={(nextPercent) => {
                const nextVolume = nextPercent / 100;
                onUpdate({
                  flyVolume: nextVolume,
                  ...(nextPercent > 0 && !settings.flyEnabled ? { flyEnabled: true } : {}),
                });
                if (settings.enabled) {
                  onPreviewFlyVolume?.(nextVolume);
                }
              }}
              onRelease={() => {
                onPreviewFlyRelease?.();
              }}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.doneBtn,
            { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.onTint }}>
            확인
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    zIndex: 40,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontWeight: '700',
    fontSize: 16,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  masterText: {
    flex: 1,
    gap: 2,
  },
  togglePill: {
    minWidth: 48,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tracksWrap: {
    gap: Spacing.two + 2,
  },
  trackCard: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three - 2,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  trackTitleCol: {
    flex: 1,
    gap: 1,
  },
  trackRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  percentText: {
    minWidth: 38,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  sliderTouchArea: {
    height: 34,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 6,
  },
  sliderTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginLeft: -10,
    top: 7,
  },
  doneBtn: {
    minHeight: 42,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
