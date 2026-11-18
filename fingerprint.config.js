/**
 * EAS Update 의 런타임 버전(fingerprint) 계산 설정.
 *
 * app.config.js 가 extra.buildInfo 에 빌드 시각·커밋 번호를 넣는데, 이 값은 실행할 때마다 바뀐다.
 * 그대로 두면 내 컴퓨터와 EAS 서버의 fingerprint 가 항상 달라져 업데이트가 앱에 적용되지 않는다.
 * extra 는 네이티브 코드에 영향을 주지 않으므로 fingerprint 계산에서 뺀다.
 */
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips: SourceSkips.ExpoConfigExtraSection,
};
