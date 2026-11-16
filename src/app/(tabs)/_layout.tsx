import AppTabs from '@/components/app-tabs';

/**
 * 다섯 기능을 오가는 탭.
 * 휴대폰에서는 app-tabs.tsx(아래쪽 탭 막대), 웹에서는 app-tabs.web.tsx(위쪽 메뉴)가 쓰인다.
 */
export default function TabLayout() {
  return <AppTabs />;
}
