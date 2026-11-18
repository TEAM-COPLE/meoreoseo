/**
 * 앱 전체에서 쓰는 색과 간격.
 * 밝은 화면(light)과 어두운 화면(dark) 색을 나란히 정의하고,
 * 화면에서는 useTheme() 으로 지금 모드에 맞는 색을 꺼내 쓴다.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#171626',
    textSecondary: '#6B6C84',
    background: '#F4F5FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EAEAF5',
    border: '#E3E4F0',
    tint: '#6354EA',
    tintSoft: '#EEECFD',
    onTint: '#FFFFFF',
    accentWarm: '#D9820B',
    danger: '#D92D46',
    dangerSoft: '#FFF0F2',
    dangerSolid: '#D92D46',
    onDanger: '#FFFFFF',
    success: '#0E9F6E',
  },
  dark: {
    text: '#F5F5FA',
    textSecondary: '#8F8FA8',
    background: '#14131E',
    backgroundElement: '#1F1E2E',
    backgroundSelected: '#2B2A40',
    border: '#2E2D45',
    tint: '#9B8AFB',
    tintSoft: '#282447',
    onTint: '#100F1C',
    accentWarm: '#F5A623',
    danger: '#FF7B8B',
    dangerSoft: '#331B24',
    dangerSolid: '#E54860',
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
