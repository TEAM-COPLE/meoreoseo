import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 웹용 로그인 정보 저장소.
 * 브라우저에는 휴대폰의 Keystore 같은 보안 영역이 없어서 브라우저 저장소(localStorage)를 쓴다.
 * 웹에서 AsyncStorage 는 localStorage 에 저장한다.
 * 휴대폰에서는 이 파일 대신 auth-storage.ts 가 쓰인다.
 */
export const authStorage = AsyncStorage;
