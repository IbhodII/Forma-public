import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'app:developer_mode';
const TAP_TARGET = 7;
const TAP_WINDOW_MS = 4000;

let tapCount = 0;
let tapResetTimer: ReturnType<typeof setTimeout> | null = null;

export async function isDeveloperModeEnabled(): Promise<boolean> {
  if (!__DEV__) {
    return false;
  }
  return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
}

export async function setDeveloperModeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

/** Seven quick taps toggles developer mode; returns new state when toggled. */
export async function registerDeveloperModeUnlockTap(): Promise<boolean | null> {
  if (!__DEV__) {
    return null;
  }
  tapCount += 1;
  if (tapResetTimer) {
    clearTimeout(tapResetTimer);
  }
  tapResetTimer = setTimeout(() => {
    tapCount = 0;
    tapResetTimer = null;
  }, TAP_WINDOW_MS);

  if (tapCount < TAP_TARGET) {
    return null;
  }
  tapCount = 0;
  const next = !(await isDeveloperModeEnabled());
  await setDeveloperModeEnabled(next);
  return next;
}
