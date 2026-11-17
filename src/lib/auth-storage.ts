import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * 로그인 정보(토큰)를 휴대폰에 저장하는 곳.
 *
 * 일반 저장소(AsyncStorage)는 값을 암호화하지 않아서, 루팅된 휴대폰이나 백업 파일에서
 * 토큰을 그대로 읽어 갈 수 있다. 그래서 SecureStore 를 쓴다.
 * SecureStore 는 Android Keystore(휴대폰의 보안 영역)에 있는 열쇠로 값을 암호화해서 저장한다.
 *
 * Supabase 는 getItem / setItem / removeItem 세 가지만 있으면 어떤 저장소든 쓸 수 있다.
 * 웹에서는 이 파일 대신 auth-storage.web.ts 가 쓰인다.
 */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value !== null) return value;

      // 예전 버전은 암호화하지 않고 저장했다. 그 값이 남아 있으면 암호화된 곳으로 옮기고 지운다.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy === null) return null;
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    } catch {
      // 읽지 못하면(예: 휴대폰의 열쇠가 바뀜) 저장된 것이 없는 것으로 본다. 다시 로그인하면 된다.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
    // 예전 방식으로 저장된 값이 남아 있을 수 있으니 함께 지운다.
    await AsyncStorage.removeItem(key);
  },
};
