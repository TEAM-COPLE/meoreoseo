/**
 * 앱 전체에서 쓰는 색과 간격.
 * 밝은 화면(light)과 어두운 화면(dark) 색을 나란히 정의하고,
 * 화면에서는 useTheme() 으로 지금 모드에 맞는 색을 꺼내 쓴다.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111114',
    textSecondary: '#6E6E7A',
    background: '#F6F6F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECECF0',
    border: '#E2E2E8',
    tint: '#111114',
    tintSoft: '#EAEAEF',
    onTint: '#FFFFFF',
    accentWarm: '#63636E',
    danger: '#DC263F',
    dangerSoft: '#FFF0F2',
    dangerSolid: '#DC263F',
    onDanger: '#FFFFFF',
    success: '#0E9F6E',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#8A8A94',
    background: '#000000',
    backgroundElement: '#111113',
    backgroundSelected: '#1C1C20',
    border: '#24242A',
    tint: '#FFFFFF',
    tintSoft: '#1D1D22',
    onTint: '#000000',
    accentWarm: '#A8A8B3',
    danger: '#FF6B78',
    dangerSoft: '#261316',
    dangerSolid: '#E54858',
    onDanger: '#FFFFFF',
    success: '#4ADE80',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 18,
  full: 999,
} as const;

/** 휴대폰 아래쪽 탭 막대가 내용을 가리지 않도록 남겨두는 여백. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 720;
