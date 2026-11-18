import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;
const CHUNK_COUNT_SUFFIX = ".__chunks";
const chunkKey = (key: string, index: number) => `${key}.__chunk_${index}`;

async function clearChunks(key: string): Promise<void> {
  try {
    const countRaw = await SecureStore.getItemAsync(
      `${key}${CHUNK_COUNT_SUFFIX}`,
    );
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (Number.isFinite(count) && count > 0) {
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {}),
        ),
      );
    }
    await SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`).catch(
      () => {},
    );
  } catch {
    // 무시
  }
}

/**
 * 로그인 정보(토큰)를 휴대폰에 저장하는 곳.
 *
 * SecureStore 는 항목당 2KB 제한이 있어서, 소셜 로그인 세션처럼 큰 값은
 * 1800자 단위로 나누어 암호화 저장한다.
 * 웹에서는 이 파일 대신 auth-storage.web.ts 가 쓰인다.
 */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await SecureStore.getItemAsync(
        `${key}${CHUNK_COUNT_SUFFIX}`,
      );
      if (countRaw) {
        const count = Number.parseInt(countRaw, 10);
        if (Number.isFinite(count) && count > 0) {
          const parts = await Promise.all(
            Array.from({ length: count }, (_, i) =>
              SecureStore.getItemAsync(chunkKey(key, i)),
            ),
          );
          if (parts.every((part) => part !== null)) {
            return parts.join("");
          }
        }
      }

      const value = await SecureStore.getItemAsync(key);
      if (value !== null) return value;

      // 예전 버전은 암호화하지 않고 저장했다. 그 값이 남아 있으면 암호화된 곳으로 옮기고 지운다.
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
    try {
      await clearChunks(key);
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }

      await SecureStore.deleteItemAsync(key).catch(() => {});
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i += 1) {
        const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(chunkKey(key, i), slice);
      }
      await SecureStore.setItemAsync(
        `${key}${CHUNK_COUNT_SUFFIX}`,
        String(count),
      );
    } catch {
      // SecureStore 저장 실패 시 앱이 크래시되지 않도록 AsyncStorage 로 폴백한다.
      await AsyncStorage.setItem(key, value).catch(() => {});
    }
  },

  async removeItem(key: string): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(key).catch(() => {}),
      clearChunks(key),
      AsyncStorage.removeItem(key).catch(() => {}),
    ]);
  },
};
