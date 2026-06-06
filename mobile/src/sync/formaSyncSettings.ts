import {getMeta, setMeta} from '../database/index';

const AUTO_ENABLED_KEY = 'forma_sync:auto_enabled';
const AUTO_LAST_RUN_KEY = 'forma_sync:auto_last_run_at';

export async function isFormaSyncAutoEnabled(): Promise<boolean> {
  const raw = await getMeta(AUTO_ENABLED_KEY);
  if (raw == null || raw === '') {
    return true;
  }
  return raw === '1';
}

export async function setFormaSyncAutoEnabled(enabled: boolean): Promise<void> {
  await setMeta(AUTO_ENABLED_KEY, enabled ? '1' : '0');
}

export async function getFormaSyncAutoLastRunAt(): Promise<string | null> {
  return getMeta(AUTO_LAST_RUN_KEY);
}

export async function setFormaSyncAutoLastRunAt(iso: string): Promise<void> {
  await setMeta(AUTO_LAST_RUN_KEY, iso);
}
