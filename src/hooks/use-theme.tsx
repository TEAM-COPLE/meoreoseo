import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform, useColorScheme as useSystemColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** 사용자가 고를 수 있는 화면 모드. system 은 기기 설정을 따른다. */
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'meoreoseo:theme-mode';

type ThemeModeContextValue = {
  mode: ThemeMode;
  resolvedScheme: ResolvedColorScheme;
  setMode: (next: ThemeMode) => void;
  toggleScheme: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (isThemeMode(saved)) setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const resolvedScheme: ResolvedColorScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  useEffect(() => {
    const background = Colors[resolvedScheme].background;
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        document.documentElement.style.colorScheme = resolvedScheme;
        document.body.style.backgroundColor = background;
      }
      return;
    }
    try {
      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
    } catch {}
    SystemUI.setBackgroundColorAsync(background).catch(() => {});
  }, [mode, resolvedScheme]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  function toggleScheme() {
    setMode(resolvedScheme === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeModeContext.Provider value={{ mode, resolvedScheme, setMode, toggleScheme }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

/** 지금 적용된 밝은/어두운 화면 모드('light' | 'dark')를 돌려준다. */
export function useColorScheme(): ResolvedColorScheme {
  const ctx = useContext(ThemeModeContext);
  const systemScheme = useSystemColorScheme();
  if (ctx) return ctx.resolvedScheme;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/** 화면 모드 설정(기기 설정 / 라이트 / 다크)을 읽고 바꾸는 훅. */
export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  const systemScheme = useSystemColorScheme();
  if (ctx) return ctx;
  const resolvedScheme: ResolvedColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
  return { mode: 'system', resolvedScheme, setMode: () => {}, toggleScheme: () => {} };
}

/** 지금 화면 모드에 맞는 색상표를 돌려준다. */
export function useTheme() {
  const scheme = useColorScheme();
  return Colors[scheme];
}
