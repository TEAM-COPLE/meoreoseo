/**
 * 앱 전체에서 쓰는 색, 글꼴, 간격.
 * 밝은 화면(light)과 어두운 화면(dark) 색을 나란히 정의하고,
 * 화면에서는 useTheme() 으로 지금 모드에 맞는 색을 꺼내 쓴다.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#60646C',
    background: '#FFFFFF',
    backgroundElement: '#F2F3F5',
    backgroundSelected: '#E3E5E9',
    border: '#DFE1E6',
    tint: '#3B5BDB',
    onTint: '#FFFFFF',
    danger: '#C92A2A',
    success: '#0B7A55',
  },
  dark: {
    text: '#F2F3F5',
    textSecondary: '#A6ABB3',
    background: '#0E0F11',
    backgroundElement: '#1C1E21',
    backgroundSelected: '#2B2E33',
    border: '#32353B',
    tint: '#8DA2FB',
    onTint: '#0B1020',
    danger: '#FF8787',
    success: '#5FD3A6',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  full: 999,
} as const;

/** 휴대폰 아래쪽 탭 막대가 내용을 가리지 않도록 남겨두는 여백. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 720;
