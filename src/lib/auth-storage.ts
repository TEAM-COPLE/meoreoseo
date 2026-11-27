import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore 항목당 크기 제한은 2,048바이트(UTF-8 기준)다.
 * 한글 메타데이터(글자당 최대 3바이트)가 섞인 세션 JSON도 안전하게 들어가도록 600자(최대 1,800바이트) 단위로 나눈다.
 */
const CHUNK_SIZE = 600;
const CHUNK_COUNT_SUFFIX = '.__chunks';
const chunkKey = (key: string, index: number) => `${key}.__chunk_${index}`;

async function clearChunks(key: string): Promise<void> {
  try {
    const countRaw = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (Number.isFinite(count) && count > 0 && count <= 64) {
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {}),
        ),
      );
    }
    await SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`).catch(() => {});
  } catch {
    // 무시
  }
}

/**
 * 로그인 정보(토큰)를 휴대폰 보안 영역(Keychain / Keystore)에 암호화 저장하는 곳.
 * 웹에서는 이 파일 대신 auth-storage.web.ts 가 쓰인다.
 */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
      if (countRaw) {
        const count = Number.parseInt(countRaw, 10);
        if (Number.isFinite(count) && count > 0 && count <= 64) {
          const parts = await Promise.all(
            Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
          );
          if (parts.every((part) => part !== null)) {
            return parts.join('');
          }
        }
      }

      const value = await SecureStore.getItemAsync(key);
      if (value !== null) return value;

      // 예전 버전에서 평문 저장소에 남아 있던 값이 있으면 보안 저장소로 옮기고 즉시 지운다.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy === null) return null;
      await authStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(key).catch(() => {});
      return legacy;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key).catch(() => {});
      return;
    }

    await SecureStore.deleteItemAsync(key).catch(() => {});
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        return SecureStore.setItemAsync(chunkKey(key, i), slice);
      }),
    );
    await SecureStore.setItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`, String(count));
    await AsyncStorage.removeItem(key).catch(() => {});
  },

  async removeItem(key: string): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(key).catch(() => {}),
      clearChunks(key),
      AsyncStorage.removeItem(key).catch(() => {}),
    ]);
  },
};
