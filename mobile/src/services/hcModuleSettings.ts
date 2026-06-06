import {getMeta, setMeta} from '../database/index';

export const HC_MODULE_ENABLED_KEY = 'hc:module_enabled';
export const HC_LAST_LOCAL_READ_AT_KEY = 'hc:last_local_read_at';

export async function isHealthConnectModuleEnabled(): Promise<boolean> {
  const raw = await getMeta(HC_MODULE_ENABLED_KEY);
  return raw === '1';
}

export async function setHealthConnectModuleEnabled(enabled: boolean): Promise<void> {
  await setMeta(HC_MODULE_ENABLED_KEY, enabled ? '1' : '0');
}

export async function getHcLastLocalReadAt(): Promise<string | null> {
  return getMeta(HC_LAST_LOCAL_READ_AT_KEY);
}

export async function setHcLastLocalReadAt(iso: string): Promise<void> {
  await setMeta(HC_LAST_LOCAL_READ_AT_KEY, iso);
}
