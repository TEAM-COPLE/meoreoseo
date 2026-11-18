/* global __dirname */
const { execSync } = require('child_process');

/**
 * 앱 설정의 대부분은 app.json 에 있다. 이 파일은 거기에 "지금 어떤 코드로 만들었는지"만 덧붙인다.
 * 설정 화면의 "버전 정보" 칸이 이 값을 보여준다(src/components/version-info-card.tsx).
 *
 * - gitCommit: 만든 코드의 GitHub 커밋 번호
 *     Expo 클라우드 빌드 → EAS_BUILD_GIT_COMMIT_HASH, Vercel 웹 배포 → VERCEL_GIT_COMMIT_SHA,
 *     내 컴퓨터(eas update, 개발 서버) → git 명령으로 직접 읽는다.
 * - gitDirty: 커밋하지 않은 수정이 섞여 있었는지 (내 컴퓨터에서만 확인)
 * - builtAt: 만든 시각
 */

function git(command) {
  try {
    // 어느 폴더에서 실행하든 이 프로젝트 폴더의 git 기록을 읽는다.
    return execSync(`git ${command}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function buildInfo() {
  const fromServer = process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.VERCEL_GIT_COMMIT_SHA;
  const gitCommit = fromServer || git('rev-parse HEAD') || null;
  // 서버에서는 받은 코드 그대로 빌드하므로, 내 컴퓨터에서 만들 때만 "수정 중" 여부를 본다.
  const gitDirty = !fromServer && git('status --porcelain --untracked-files=no') !== '';
  return { gitCommit, gitDirty, builtAt: new Date().toISOString() };
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    buildInfo: buildInfo(),
  },
});
