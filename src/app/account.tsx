import { Redirect } from 'expo-router';

/** 예전 주소(/account)로 들어오면 새 설정 화면(/settings)으로 보낸다. */
export default function AccountRedirect() {
  return <Redirect href="/settings" />;
}
