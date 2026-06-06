import * as Crypto from 'expo-crypto';

import {getFormaSyncDeviceId, setFormaSyncDeviceId} from './syncMeta';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getFormaSyncDeviceId();
  if (existing) {
    return existing;
  }
  const id = Crypto.randomUUID();
  await setFormaSyncDeviceId(id);
  return id;
}
