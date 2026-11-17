const { withDangerousMod } = require('expo/config-plugins');
const { patchExpoWidgets } = require('../scripts/patch-expo-widgets');

/**
 * Android 위젯에서 "+ 할 일 추가", "+ 일정 추가", "+ 습관 추가", "+ 새 메모", "+ 가계부 추가" 등
 * 앱 화면을 여는 버튼을 눌렀을 때 백그라운드 브로드캐스트 제한(Android 12~16 BAL)에 막히지 않고
 * 즉시 앱의 해당 추가 창(Deep Link Activity)이 열리도록 expo-widgets 네이티브 액션을 보강한다.
 */
function withMeoreoseoWidgets(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      patchExpoWidgets(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withMeoreoseoWidgets;
