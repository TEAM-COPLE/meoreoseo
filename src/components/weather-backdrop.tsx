import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useThemeMode } from '@/hooks/use-theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export type WeatherKind = 'clear-day' | 'clear-night' | 'cloudy' | 'rain' | 'snow' | 'storm';

export function classifyWeather(code: number, isDay: boolean): WeatherKind {
  if (code >= 95) return 'storm';
  if (code === 66 || code === 67 || (code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow';
  }
  if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy';
  return isDay ? 'clear-day' : 'clear-night';
}

export type WeatherAtmosphere = {
  kind: WeatherKind;
  background: string;
  border: string;
  glowPrimary: string;
  glowSecondary: string;
  particle: string;
};

const LIGHT_PALETTE: Record<WeatherKind, Omit<WeatherAtmosphere, 'kind'>> = {
  'clear-day': {
    background: '#EDF5FF',
    border: '#C2DCFF',
    glowPrimary: 'rgba(251, 191, 36, 0.28)',
    glowSecondary: 'rgba(59, 130, 246, 0.14)',
    particle: 'rgba(245, 158, 11, 0.35)',
  },
  'clear-night': {
    background: '#EFEBFD',
    border: '#D3C9FA',
    glowPrimary: 'rgba(99, 102, 241, 0.18)',
    glowSecondary: 'rgba(167, 139, 250, 0.14)',
    particle: 'rgba(99, 102, 241, 0.35)',
  },
  cloudy: {
    background: '#EEF2F7',
    border: '#D5DEE9',
    glowPrimary: 'rgba(148, 163, 184, 0.24)',
    glowSecondary: 'rgba(100, 116, 139, 0.14)',
    particle: 'rgba(100, 116, 139, 0.22)',
  },
  rain: {
    background: '#E7F3FC',
    border: '#B8DCF8',
    glowPrimary: 'rgba(14, 165, 233, 0.20)',
    glowSecondary: 'rgba(56, 189, 248, 0.14)',
    particle: 'rgba(14, 165, 233, 0.36)',
  },
  snow: {
    background: '#EFF8FF',
    border: '#C6E5FC',
    glowPrimary: 'rgba(186, 230, 253, 0.45)',
    glowSecondary: 'rgba(125, 211, 252, 0.22)',
    particle: 'rgba(56, 189, 248, 0.38)',
  },
  storm: {
    background: '#EFEAFB',
    border: '#CFC0FA',
    glowPrimary: 'rgba(139, 92, 246, 0.22)',
    glowSecondary: 'rgba(245, 158, 11, 0.18)',
    particle: 'rgba(139, 92, 246, 0.36)',
  },
};

const DARK_PALETTE: Record<WeatherKind, Omit<WeatherAtmosphere, 'kind'>> = {
  'clear-day': {
    background: '#1C243D',
    border: 'rgba(251, 191, 36, 0.35)',
    glowPrimary: 'rgba(251, 191, 36, 0.22)',
    glowSecondary: 'rgba(96, 165, 250, 0.16)',
    particle: 'rgba(253, 224, 71, 0.45)',
  },
  'clear-night': {
    background: '#181832',
    border: 'rgba(165, 180, 252, 0.28)',
    glowPrimary: 'rgba(129, 140, 248, 0.20)',
    glowSecondary: 'rgba(196, 181, 253, 0.14)',
    particle: 'rgba(224, 231, 255, 0.55)',
  },
  cloudy: {
    background: '#212636',
    border: '#353D52',
    glowPrimary: 'rgba(148, 163, 184, 0.16)',
    glowSecondary: 'rgba(100, 116, 139, 0.12)',
    particle: 'rgba(203, 213, 225, 0.25)',
  },
  rain: {
    background: '#16243A',
    border: 'rgba(56, 189, 248, 0.30)',
    glowPrimary: 'rgba(56, 189, 248, 0.18)',
    glowSecondary: 'rgba(37, 99, 235, 0.15)',
    particle: 'rgba(125, 211, 252, 0.48)',
  },
  snow: {
    background: '#1B283C',
    border: 'rgba(186, 230, 253, 0.30)',
    glowPrimary: 'rgba(224, 242, 254, 0.18)',
    glowSecondary: 'rgba(125, 211, 252, 0.14)',
    particle: 'rgba(240, 249, 255, 0.65)',
  },
  storm: {
    background: '#211938',
    border: 'rgba(167, 139, 250, 0.36)',
    glowPrimary: 'rgba(167, 139, 250, 0.24)',
    glowSecondary: 'rgba(250, 204, 21, 0.16)',
    particle: 'rgba(196, 181, 253, 0.50)',
  },
};

export function getWeatherAtmosphere(
  code: number,
  isDay: boolean,
  scheme: 'light' | 'dark',
): WeatherAtmosphere {
  const kind = classifyWeather(code, isDay);
  const palette = scheme === 'dark' ? DARK_PALETTE[kind] : LIGHT_PALETTE[kind];
  return { kind, ...palette };
}

const PARTICLE_SLOTS = [
  { left: '14%', top: '18%', size: 5 },
  { left: '34%', top: '62%', size: 4 },
  { left: '56%', top: '24%', size: 6 },
  { left: '74%', top: '52%', size: 4 },
  { left: '88%', top: '22%', size: 5 },
] as const;

/**
 * 현재 날씨(맑음, 밤, 흐림, 비, 눈, 뇌우)에 맞춰 날씨 카드 뒤에 은은하게 깔리는 배경 효과.
 */
export function WeatherBackdrop({ code, isDay }: { code: number; isDay: boolean }) {
  const { resolvedScheme } = useThemeMode();
  const atmosphere = getWeatherAtmosphere(code, isDay, resolvedScheme);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const orbScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const driftY = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: atmosphere.kind === 'rain' ? [-6, 10] : [-4, 6],
  });
  const particleOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 0.9, 0.35],
  });

  return (
    <View pointerEvents="none" style={styles.root}>
      <Animated.View
        style={[
          styles.orbPrimary,
          {
            backgroundColor: atmosphere.glowPrimary,
            transform: [{ scale: orbScale }],
          },
        ]}
      />
      <View
        style={[
          styles.orbSecondary,
          {
            backgroundColor: atmosphere.glowSecondary,
          },
        ]}
      />

      {(atmosphere.kind === 'rain' ||
        atmosphere.kind === 'snow' ||
        atmosphere.kind === 'clear-night' ||
        atmosphere.kind === 'storm') &&
        PARTICLE_SLOTS.map((slot, idx) => (
          <Animated.View
            key={idx}
            style={[
              atmosphere.kind === 'rain' || atmosphere.kind === 'storm'
                ? styles.rainStreak
                : styles.dot,
              {
                left: slot.left,
                top: slot.top,
                width:
                  atmosphere.kind === 'rain' || atmosphere.kind === 'storm' ? 2 : slot.size,
                height:
                  atmosphere.kind === 'rain' || atmosphere.kind === 'storm' ? 14 : slot.size,
                backgroundColor: atmosphere.particle,
                opacity: particleOpacity,
                transform: [{ translateY: driftY }, { rotate: atmosphere.kind === 'rain' ? '14deg' : '0deg' }],
              },
            ]}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  orbPrimary: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    top: -48,
    right: -28,
  },
  orbSecondary: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    bottom: -54,
    left: -32,
  },
  rainStreak: {
    position: 'absolute',
    borderRadius: 999,
  },
  dot: {
    position: 'absolute',
    borderRadius: 999,
  },
});
