import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

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
  /** APK 에 연결된 EAS 프로젝트 ID (처음 8글자 표시용) */
  projectId?: string | null;
  /** 업데이트 모듈이 꺼져 있거나 문제가 있을 때의 안내 */
  disabledReason?: string | null;
};

type BuildInfo = { gitCommit?: string | null; gitDirty?: boolean; builtAt?: string };

type ManifestWithClient = {
  id?: string;
  createdAt?: string;
  extra?: {
    expoClient?: {
      version?: string;
      extra?: {
        buildInfo?: BuildInfo;
        eas?: { projectId?: string };
      };
    };
    eas?: { projectId?: string };
  };
};

function readCurrentManifest(): ManifestWithClient {
  const fromUpdates = (Updates.manifest ?? {}) as ManifestWithClient;
  if (fromUpdates && Object.keys(fromUpdates).length > 0) {
    return fromUpdates;
  }
  const fromConstants = (Constants.manifest2 ?? {}) as ManifestWithClient;
  return fromConstants;
}

function readBuildInfo(isEmbedded: boolean, manifest: ManifestWithClient): BuildInfo {
  if (!isEmbedded) {
    const fromManifest = manifest.extra?.expoClient?.extra?.buildInfo;
    if (fromManifest) return fromManifest;
  }
  return (Constants.expoConfig?.extra?.buildInfo as BuildInfo | undefined) ?? {};
}

function readProjectId(manifest: ManifestWithClient): string | null {
  return (
    manifest.extra?.eas?.projectId ??
    manifest.extra?.expoClient?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | null)?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    null
  );
}

function extractManifestBuildInfo(manifest: ManifestWithClient | undefined): BuildInfo | undefined {
  return manifest?.extra?.expoClient?.extra?.buildInfo;
}

export function getVersionInfo(): VersionInfo {
  const isEnabled = Boolean(Updates.isEnabled);
  const isEmbedded = Boolean(Updates.isEmbeddedLaunch);
  const manifest = readCurrentManifest();
  const build = readBuildInfo(!isEnabled || isEmbedded, manifest);
  const source: VersionInfo['source'] =
    __DEV__ ? 'dev' : !isEnabled ? 'apk' : isEmbedded ? 'apk' : 'update';

  const manifestCreatedAt =
    manifest.createdAt && !Number.isNaN(Date.parse(manifest.createdAt))
      ? new Date(manifest.createdAt)
      : null;

  const builtAt =
    source === 'update'
      ? (Updates.createdAt ?? manifestCreatedAt ?? (build.builtAt ? new Date(build.builtAt) : null))
      : build.builtAt
        ? new Date(build.builtAt)
        : (Updates.createdAt ?? null);

  let disabledReason: string | null = null;
  if (__DEV__) {
    disabledReason = '개발 서버(Expo Go / 개발 빌드)로 실행 중입니다.';
  } else if (!isEnabled) {
    disabledReason =
      Updates.emergencyLaunchReason ??
      '이 APK 는 EAS Update 기능이 포함되기 전에 만들어졌거나 업데이트가 비활성화되어 있습니다. 새 APK 를 설치해 주세요.';
  } else if (Updates.isEmergencyLaunch && Updates.emergencyLaunchReason) {
    disabledReason = `이전 업데이트 실행 중 오류가 발생해 기본 코드로 복구되었습니다: ${Updates.emergencyLaunchReason}`;
  }

  const updateId =
    source === 'update' ? (Updates.updateId ?? manifest.id ?? null) : null;

  return {
    appVersion:
      manifest.extra?.expoClient?.version ?? Constants.expoConfig?.version ?? '1.0.0',
    platform: Platform.OS,
    commit: build.gitCommit ?? null,
    dirty: build.gitDirty ?? false,
    builtAt,
    source,
    channel: Updates.channel || null,
    updateId,
    projectId: readProjectId(manifest),
    disabledReason,
  };
}

/**
 * 실시간으로 업데이트된 버전 정보를 돌려주는 훅.
 * `Updates.reloadAsync()` 로 인플레이스 재시작이 일어나도 최신 manifest 의 커밋과 업데이트 번호를 즉시 반영한다.
 */
export function useVersionInfo(): VersionInfo {
  const { currentlyRunning } = Updates.useUpdates();
  const base = getVersionInfo();
  if (__DEV__ || !Updates.isEnabled) return base;

  const runningManifest = (currentlyRunning.manifest ?? {}) as ManifestWithClient;
  const isEmbedded = currentlyRunning.isEmbeddedLaunch;
  const manifestBuild = !isEmbedded ? extractManifestBuildInfo(runningManifest) : undefined;
  const manifestCreatedAt =
    runningManifest.createdAt && !Number.isNaN(Date.parse(runningManifest.createdAt))
      ? new Date(runningManifest.createdAt)
      : null;

  return {
    ...base,
    source: isEmbedded ? 'apk' : 'update',
    commit: manifestBuild?.gitCommit ?? base.commit,
    dirty: manifestBuild?.gitDirty ?? base.dirty,
    builtAt: !isEmbedded
      ? (currentlyRunning.createdAt ?? manifestCreatedAt ?? base.builtAt)
      : base.builtAt,
    channel: currentlyRunning.channel || base.channel,
    updateId: !isEmbedded
      ? (currentlyRunning.updateId ?? runningManifest.id ?? base.updateId)
      : null,
    projectId: readProjectId(runningManifest) ?? base.projectId,
  };
}

/** 이 앱이 스스로 새 버전을 받을 수 있는지 (개발 서버로 실행 중이면 안 된다) */
export const canSelfUpdate = !__DEV__ && Boolean(Updates.isEnabled);

let syncInFlight: Promise<'latest' | 'restarting'> | null = null;

/**
 * 새 업데이트가 있으면 받아서 앱을 다시 시작한다.
 * - 앱 시작 시 백그라운드 로더가 이미 업데이트를 받아 둔 경우(`isUpdatePending`)에도 놓치지 않고 바로 재시작한다.
 * - `fetchUpdateAsync()` 가 새 번들을 받았을 때나 롤백 지시를 받았을 때 모두 재시작한다.
 * @returns 'latest': 이미 최신 / 'restarting': 받아서 다시 시작하는 중
 */
export async function applyLatestVersion(): Promise<'latest' | 'restarting'> {
  if (!canSelfUpdate) return 'latest';
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async (): Promise<'latest' | 'restarting'> => {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable || check.isRollBackToEmbedded) {
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew || fetched.isRollBackToEmbedded) {
        await Updates.reloadAsync();
        return 'restarting';
      }
    }

    // 앱 시작 직후 백그라운드 로더가 이미 새 버전을 다 받아 둔 상태라면,
    // checkForUpdateAsync 가 '이미 받음'으로 처리해도 fetchUpdateAsync 로 한 번 더 확인해 적용한다.
    const fetched = await Updates.fetchUpdateAsync().catch(() => null);
    if (fetched && (fetched.isNew || fetched.isRollBackToEmbedded)) {
      await Updates.reloadAsync();
      return 'restarting';
    }

    return 'latest';
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

/**
 * 모바일 앱이 켜지거나 다시 화면에 올라올 때 새 업데이트가 있으면 자동으로 받아 바로 적용한다.
 * 기존에는 앱을 두 번 껐다 켜야 적용되었으나, 이제는 웹처럼 앱을 열었을 때 최신 버전으로 바로 전환된다.
 */
export function useAutoUpdateOnAppActive(): void {
  const { isUpdatePending, isUpdateAvailable, isDownloading } = Updates.useUpdates();

  useEffect(() => {
    if (!canSelfUpdate) return;
    if (isUpdatePending) {
      Updates.reloadAsync().catch(() => {});
    } else if (isUpdateAvailable && !isDownloading) {
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [isUpdatePending, isUpdateAvailable, isDownloading]);

  useEffect(() => {
    if (!canSelfUpdate || Platform.OS === 'web') return;
    let lastCheckedAt = Date.now();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastCheckedAt < 30_000) return;
      lastCheckedAt = now;
      applyLatestVersion().catch(() => {});
    });
    return () => sub.remove();
  }, []);
}


