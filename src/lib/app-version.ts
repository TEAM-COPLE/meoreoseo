import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/**
 * 지금 돌고 있는 앱이 어떤 코드인지 알려준다(휴대폰 앱용). 웹은 app-version.web.ts.
 * 팀원끼리 "같은 버전인가?"를 확인하려고 계정 화면의 "버전 정보" 칸에서 쓴다.
 */

export type VersionInfo = {
  /** 앱 버전 (app.json 의 version) */
  appVersion: string;
  /** 'android' | 'ios' | 'web' */
  platform: string;
  /** 이 앱을 만든 코드의 GitHub 커밋 번호 (전체) */
  commit: string | null;
  /** 커밋하지 않은 수정이 섞인 코드로 만들었는지 */
  dirty: boolean;
  /** 코드를 묶은 시각 */
  builtAt: Date | null;
  /** 코드를 어떻게 받았는지 */
  source: 'apk' | 'update' | 'dev' | 'web';
  /** 업데이트 채널 (preview 등) */
  channel: string | null;
  /** 받은 업데이트의 번호 (업데이트일 때만) */
  updateId: string | null;
};

type BuildInfo = { gitCommit?: string | null; gitDirty?: boolean; builtAt?: string };

function readBuildInfo(): BuildInfo {
  return (Constants.expoConfig?.extra?.buildInfo as BuildInfo | undefined) ?? {};
}

export function getVersionInfo(): VersionInfo {
  const build = readBuildInfo();
  const source = __DEV__ || !Updates.isEnabled ? 'dev' : Updates.isEmbeddedLaunch ? 'apk' : 'update';
  return {
    appVersion: Constants.expoConfig?.version ?? '?',
    platform: Platform.OS,
    commit: build.gitCommit ?? null,
    dirty: build.gitDirty ?? false,
    // 업데이트로 받은 코드는 업데이트를 만든 시각이 더 정확하다.
    builtAt: source === 'update' && Updates.createdAt ? Updates.createdAt : build.builtAt ? new Date(build.builtAt) : null,
    source,
    channel: Updates.channel ?? null,
    updateId: source === 'update' ? (Updates.updateId ?? null) : null,
  };
}

/** 이 앱이 스스로 새 버전을 받을 수 있는지 (개발 서버로 실행 중이면 안 된다) */
export const canSelfUpdate = !__DEV__ && Updates.isEnabled;

/**
 * 새 업데이트가 있으면 받아서 앱을 다시 시작한다.
 * @returns 'latest': 이미 최신 / 'restarting': 받아서 다시 시작하는 중
 */
export async function applyLatestVersion(): Promise<'latest' | 'restarting'> {
  if (!canSelfUpdate) return 'latest';
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return 'latest';
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
  return 'restarting';
}
