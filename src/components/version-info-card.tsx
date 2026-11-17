import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { applyLatestVersion, canSelfUpdate, getVersionInfo, type VersionInfo } from '@/lib/app-version';
import { errorMessage } from '@/lib/format';

/** 비교할 GitHub 저장소와 브랜치 (공개 저장소라 로그인 없이 읽을 수 있다) */
const GITHUB_MAIN = 'https://api.github.com/repos/TEAM-COPLE/meoreoseo/commits/main';

const PLATFORM_LABEL: Record<string, string> = { android: '안드로이드', ios: '아이폰', web: '웹' };

const SOURCE_LABEL: Record<VersionInfo['source'], string> = {
  apk: 'APK 에 들어 있던 코드',
  update: '업데이트로 받은 코드',
  dev: '개발 서버 (내 컴퓨터의 코드)',
  web: '웹사이트에 배포된 코드',
};

/** 커밋 번호는 GitHub 처럼 앞 7글자만 보여준다. */
function shortCommit(commit: string | null): string {
  return commit ? commit.slice(0, 7) : '알 수 없음';
}

/** 11월 17일 14:20 */
function formatDateTime(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** GitHub main 브랜치의 가장 최근 커밋 번호 */
async function latestMainCommit(): Promise<string> {
  const response = await fetch(GITHUB_MAIN, { headers: { Accept: 'application/vnd.github.sha' } });
  if (!response.ok) throw new Error(`GitHub 에서 최신 코드를 확인하지 못했습니다 (${response.status})`);
  return (await response.text()).trim();
}

/**
 * 계정 화면의 "버전 정보" 칸.
 * 팀원끼리 화면의 커밋 번호를 비교하면 같은 코드인지 알 수 있다.
 */
export function VersionInfoCard() {
  const [info] = useState(getVersionInfo);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  // 웹에서 GitHub 가 더 최신이면 새로고침 버튼을 보여준다.
  const [canReload, setCanReload] = useState(false);

  async function check() {
    setChecking(true);
    setResult(null);
    setCanReload(false);
    try {
      // 휴대폰: 받을 수 있는 업데이트가 있으면 받아서 앱을 다시 시작한다(이 경우 아래로 내려오지 않는다).
      if (info.platform !== 'web' && canSelfUpdate) {
        if ((await applyLatestVersion()) === 'restarting') return;
      }
      const main = await latestMainCommit();
      if (info.commit && main === info.commit) {
        setResult({ ok: true, text: `GitHub main(${shortCommit(main)})과 같은 최신 코드예요.` });
      } else if (info.platform === 'web' && canSelfUpdate) {
        setCanReload(true);
        setResult({
          ok: false,
          text: `GitHub main 은 ${shortCommit(main)} 이에요. 새로고침하면 최신 배포를 받아요(배포는 합친 뒤 1~2분 걸려요).`,
        });
      } else if (info.platform !== 'web' && canSelfUpdate) {
        setResult({
          ok: false,
          text: `받을 수 있는 업데이트는 다 받았어요. GitHub main(${shortCommit(main)})이 더 최신이면 아직 업데이트를 안 보냈거나, APK 를 새로 만들어야 하는 변경이에요.`,
        });
      } else {
        setResult({
          ok: false,
          text: `GitHub main 은 ${shortCommit(main)} 이에요. 개발 서버에서는 git pull 로 최신 코드를 받으세요.`,
        });
      }
    } catch (e) {
      setResult({ ok: false, text: errorMessage(e) });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <ThemedText type="smallBold">버전 정보</ThemedText>
      <View style={styles.rows}>
        <Row label="앱 버전" value={`${info.appVersion} (${PLATFORM_LABEL[info.platform] ?? info.platform})`} />
        <Row
          label="코드"
          value={[
            shortCommit(info.commit),
            info.builtAt ? formatDateTime(info.builtAt) : null,
            info.dirty ? '커밋 안 한 수정 포함' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Row
          label="받은 방식"
          value={[SOURCE_LABEL[info.source], info.channel ? `${info.channel} 채널` : null]
            .filter(Boolean)
            .join(' · ')}
        />
        {info.updateId ? <Row label="업데이트 번호" value={info.updateId.slice(0, 8)} /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        팀원과 &quot;코드&quot;의 앞 7글자를 비교하면 같은 버전인지 알 수 있어요.
      </ThemedText>
      <View style={styles.buttons}>
        <Button label="최신 버전 확인" variant="secondary" size="small" onPress={check} loading={checking} />
        {canReload ? (
          <Button label="새로고침해서 받기" size="small" onPress={() => applyLatestVersion()} />
        ) : null}
      </View>
      {result ? (
        <ThemedText type="small" themeColor={result.ok ? 'tint' : 'textSecondary'}>
          {result.text}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.value} selectable>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  label: {
    width: 88,
  },
  value: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
