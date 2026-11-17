import Constants from 'expo-constants';

import type { VersionInfo } from './app-version';

/**
 * 웹에서 돌고 있는 코드의 버전. 휴대폰용은 app-version.ts.
 * 웹은 Vercel 이 main 에 합쳐질 때마다 새로 배포하므로, 새로고침하면 최신 코드를 받는다.
 */

type BuildInfo = { gitCommit?: string | null; gitDirty?: boolean; builtAt?: string };

export type { VersionInfo };

export function getVersionInfo(): VersionInfo {
  const build = (Constants.expoConfig?.extra?.buildInfo as BuildInfo | undefined) ?? {};
  return {
    appVersion: Constants.expoConfig?.version ?? '?',
    platform: 'web',
    commit: build.gitCommit ?? null,
    dirty: build.gitDirty ?? false,
    builtAt: build.builtAt ? new Date(build.builtAt) : null,
    source: __DEV__ ? 'dev' : 'web',
    channel: null,
    updateId: null,
    projectId: null,
    disabledReason: null,
  };
}

export function useVersionInfo(): VersionInfo {
  return getVersionInfo();
}

/** 웹은 페이지를 새로고침해서 최신 배포를 받는다. */
export const canSelfUpdate = !__DEV__;

export async function applyLatestVersion(): Promise<'latest' | 'restarting'> {
  if (!canSelfUpdate) return 'latest';
  window.location.reload();
  return 'restarting';
}

export function useAutoUpdateOnAppActive(): void {
  // 웹은 페이지 로드 시 항상 최신 번들을 받으므로 별도 백그라운드 업데이트 훅이 필요 없다.
}

