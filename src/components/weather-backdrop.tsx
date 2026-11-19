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
  gradient: string;
  border: string;
  glowPrimary: string;
  glowSecondary: string;
  particle: string;
};

const LIGHT_PALETTE: Record<WeatherKind, Omit<WeatherAtmosphere, 'kind'>> = {
  'clear-day': {
    background: '#DCEEFF',
    gradient: 'linear-gradient(135deg, #DCEEFF 0%, #BFE0FF 55%, #FFF0D1 100%)',
    border: '#B8D8FC',
    glowPrimary: 'rgba(251, 191, 36, 0.28)',
    glowSecondary: 'rgba(59, 130, 246, 0.14)',
    particle: 'rgba(245, 158, 11, 0.35)',
  },
  'clear-night': {
    background: '#E4E2FB',
    gradient: 'linear-gradient(135deg, #E4E2FB 0%, #D4D0FA 55%, #E9E1FC 100%)',
    border: '#C9C2F7',
    glowPrimary: 'rgba(99, 102, 241, 0.18)',
    glowSecondary: 'rgba(167, 139, 250, 0.14)',
    particle: 'rgba(99, 102, 241, 0.35)',
  },
  cloudy: {
    background: '#E8EDF4',
    gradient: 'linear-gradient(135deg, #ECF0F6 0%, #DCE3EE 55%, #CFD8E6 100%)',
    border: '#C8D3E3',
    glowPrimary: 'rgba(148, 163, 184, 0.24)',
    glowSecondary: 'rgba(100, 116, 139, 0.14)',
    particle: 'rgba(100, 116, 139, 0.22)',
  },
  rain: {
    background: '#D8ECFA',
    gradient: 'linear-gradient(135deg, #DCEFFA 0%, #C2E0F7 55%, #B2D4F0 100%)',
    border: '#A9D2F2',
    glowPrimary: 'rgba(14, 165, 233, 0.20)',
    glowSecondary: 'rgba(56, 189, 248, 0.14)',
    particle: 'rgba(14, 165, 233, 0.36)',
  },
  snow: {
    background: '#EAF6FF',
    gradient: 'linear-gradient(135deg, #F0F9FF 0%, #D8EEFC 55%, #C6E3FA 100%)',
    border: '#B9DDF8',
    glowPrimary: 'rgba(186, 230, 253, 0.45)',
    glowSecondary: 'rgba(125, 211, 252, 0.22)',
    particle: 'rgba(56, 189, 248, 0.38)',
  },
  storm: {
    background: '#E6DFF9',
    gradient: 'linear-gradient(135deg, #E8E1FA 0%, #D5C8F5 55%, #EADBF0 100%)',
    border: '#C7B6F2',
    glowPrimary: 'rgba(139, 92, 246, 0.22)',
    glowSecondary: 'rgba(245, 158, 11, 0.18)',
    particle: 'rgba(139, 92, 246, 0.36)',
  },
};

const DARK_PALETTE: Record<WeatherKind, Omit<WeatherAtmosphere, 'kind'>> = {
  'clear-day': {
    background: '#133E7C',
    gradient: 'linear-gradient(135deg, #0D2F6B 0%, #1652A8 55%, #277BD6 100%)',
    border: 'rgba(96, 165, 250, 0.38)',
    glowPrimary: 'rgba(251, 191, 36, 0.26)',
    glowSecondary: 'rgba(56, 189, 248, 0.18)',
    particle: 'rgba(253, 224, 71, 0.55)',
  },
  'clear-night': {
    background: '#11163A',
    gradient: 'linear-gradient(135deg, #070B22 0%, #141B47 55%, #27225E 100%)',
    border: 'rgba(165, 180, 252, 0.28)',
    glowPrimary: 'rgba(129, 140, 248, 0.22)',
    glowSecondary: 'rgba(196, 181, 253, 0.14)',
    particle: 'rgba(224, 231, 255, 0.65)',
  },
  cloudy: {
    background: '#232B3A',
    gradient: 'linear-gradient(135deg, #171D28 0%, #2A3345 55%, #3E4B61 100%)',
    border: 'rgba(148, 163, 184, 0.30)',
    glowPrimary: 'rgba(203, 213, 225, 0.16)',
    glowSecondary: 'rgba(100, 116, 139, 0.14)',
    particle: 'rgba(226, 232, 240, 0.30)',
  },
  rain: {
    background: '#122B46',
    gradient: 'linear-gradient(135deg, #0A182B 0%, #133354 55%, #1F5178 100%)',
    border: 'rgba(56, 189, 248, 0.32)',
    glowPrimary: 'rgba(56, 189, 248, 0.20)',
    glowSecondary: 'rgba(37, 99, 235, 0.16)',
    particle: 'rgba(147, 197, 253, 0.52)',
  },
  snow: {
    background: '#213D5B',
    gradient: 'linear-gradient(135deg, #15273B 0%, #26486B 55%, #3C6E99 100%)',
    border: 'rgba(186, 230, 253, 0.34)',
    glowPrimary: 'rgba(224, 242, 254, 0.22)',
    glowSecondary: 'rgba(125, 211, 252, 0.16)',
    particle: 'rgba(240, 249, 255, 0.72)',
  },
  storm: {
    background: '#231640',
    gradient: 'linear-gradient(135deg, #120C24 0%, #2A194C 52%, #44235E 100%)',
    border: 'rgba(167, 139, 250, 0.36)',
    glowPrimary: 'rgba(167, 139, 250, 0.24)',
    glowSecondary: 'rgba(250, 204, 21, 0.18)',
    particle: 'rgba(250, 204, 21, 0.55)',
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
  const hasParticles =
    atmosphere.kind === 'rain' ||
    atmosphere.kind === 'snow' ||
    atmosphere.kind === 'clear-night' ||
    atmosphere.kind === 'storm';
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!hasParticles) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasParticles, pulse]);

  const driftY = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: atmosphere.kind === 'rain' ? [-4, 8] : [-3, 5],
  });
  const particleOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.75, 0.3],
  });

  return (
    <View pointerEvents="none" style={[styles.root, { backgroundImage: atmosphere.gradient }]}>
      {hasParticles
        ? PARTICLE_SLOTS.map((slot, idx) => (
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
                  transform: [
                    { translateY: driftY },
                    { rotate: atmosphere.kind === 'rain' ? '14deg' : '0deg' },
                  ],
                },
              ]}
            />
          ))
        : null}
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
  rainStreak: {
    position: 'absolute',
    borderRadius: 999,
  },
  dot: {
    position: 'absolute',
    borderRadius: 999,
  },
});
