import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'forma:haptics_enabled';

export async function loadHapticsEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw !== '0';
}

export async function saveHapticsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? '1' : '0');
}
