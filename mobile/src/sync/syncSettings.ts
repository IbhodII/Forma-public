import {getMeta, setMeta} from '../database/index';

export {
  isFormaSyncAutoEnabled,
  setFormaSyncAutoEnabled,
  getFormaSyncAutoLastRunAt,
  setFormaSyncAutoLastRunAt,
} from './formaSyncSettings';

const MANUAL_ONLY_KEY = 'forma_sync:manual_only';
const WIFI_ONLY_KEY = 'forma_sync:wifi_only';
const CHARGING_ONLY_KEY = 'forma_sync:charging_only';
const BACKGROUND_ENABLED_KEY = 'forma_sync:background_enabled';

export async function isManualSyncOnly(): Promise<boolean> {
  return (await getMeta(MANUAL_ONLY_KEY)) === '1';
}

export async function setManualSyncOnly(enabled: boolean): Promise<void> {
  await setMeta(MANUAL_ONLY_KEY, enabled ? '1' : '0');
}

export async function isWifiOnlySyncEnabled(): Promise<boolean> {
  return (await getMeta(WIFI_ONLY_KEY)) === '1';
}

export async function setWifiOnlySyncEnabled(enabled: boolean): Promise<void> {
  await setMeta(WIFI_ONLY_KEY, enabled ? '1' : '0');
}

export async function isChargingOnlySyncEnabled(): Promise<boolean> {
  return (await getMeta(CHARGING_ONLY_KEY)) === '1';
}

export async function setChargingOnlySyncEnabled(enabled: boolean): Promise<void> {
  await setMeta(CHARGING_ONLY_KEY, enabled ? '1' : '0');
}

export async function isBackgroundSyncEnabled(): Promise<boolean> {
  const raw = await getMeta(BACKGROUND_ENABLED_KEY);
  return raw !== '0';
}

export async function setBackgroundSyncEnabled(enabled: boolean): Promise<void> {
  await setMeta(BACKGROUND_ENABLED_KEY, enabled ? '1' : '0');
}

export async function canRunAutoSync(): Promise<boolean> {
  const {isFormaSyncAutoEnabled} = await import('./formaSyncSettings');
  if (await isManualSyncOnly()) {
    return false;
  }
  return isFormaSyncAutoEnabled();
}

export type SyncSettings = {
  autoEnabled: boolean;
  manualOnly: boolean;
  wifiOnly: boolean;
  chargingOnly: boolean;
  backgroundEnabled: boolean;
};

export async function getSyncSettings(): Promise<SyncSettings> {
  const {isFormaSyncAutoEnabled} = await import('./formaSyncSettings');
  const [autoEnabled, manualOnly, wifiOnly, chargingOnly, backgroundEnabled] =
    await Promise.all([
      isFormaSyncAutoEnabled(),
      isManualSyncOnly(),
      isWifiOnlySyncEnabled(),
      isChargingOnlySyncEnabled(),
      isBackgroundSyncEnabled(),
    ]);
  return {autoEnabled, manualOnly, wifiOnly, chargingOnly, backgroundEnabled};
}

export async function saveSyncSettings(patch: Partial<SyncSettings>): Promise<void> {
  const {setFormaSyncAutoEnabled} = await import('./formaSyncSettings');
  if (patch.autoEnabled !== undefined) {
    await setFormaSyncAutoEnabled(patch.autoEnabled);
  }
  if (patch.manualOnly !== undefined) {
    await setManualSyncOnly(patch.manualOnly);
  }
  if (patch.wifiOnly !== undefined) {
    await setWifiOnlySyncEnabled(patch.wifiOnly);
  }
  if (patch.chargingOnly !== undefined) {
    await setChargingOnlySyncEnabled(patch.chargingOnly);
  }
  if (patch.backgroundEnabled !== undefined) {
    await setBackgroundSyncEnabled(patch.backgroundEnabled);
  }
}
