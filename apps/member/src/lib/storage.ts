// Small key-value wrapper: localStorage on the web, AsyncStorage on iOS/Android.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return web ? globalThis.localStorage?.getItem(key) ?? null : await AsyncStorage.getItem(key);
    } catch { return null; }
  },
  async set(key: string, value: string | null): Promise<void> {
    try {
      if (web) {
        if (value === null) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, value);
      } else if (value === null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, value);
    } catch { /* storage full or blocked: the app still works for this visit */ }
  },
};
