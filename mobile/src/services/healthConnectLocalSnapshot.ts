import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMobileAuditSnapshot,
  getDeviceLabel,
  type PermissionAudit,
  type PreparedPayloadSummary,
  type RawTypeProbe,
} from './healthConnectAudit';
import {collectHealthDataForRange, type HealthConnectDayPayload} from './HealthConnectService';

const LOCAL_SNAPSHOT_KEY = 'health_connect_local_debug_snapshot_v1';

export type LocalHcDebugSnapshot = {
  saved_at: string;
  app_mode: 'local_hc_test' | 'api';
  device: string;
  permissions_detail?: PermissionAudit;
  raw_summary: RawTypeProbe[];
  prepared_summary: PreparedPayloadSummary;
  /** Полный payload для импорта на ПК (scripts/import_hc_mobile_snapshot.py). */
  items?: HealthConnectDayPayload[];
  probed_at: string;
  range: {from: string; to: string};
};

export async function saveLocalHcSnapshot(snapshot: LocalHcDebugSnapshot): Promise<void> {
  await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function getLocalHcSnapshot(): Promise<LocalHcDebugSnapshot | null> {
  const raw = await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalHcDebugSnapshot;
  } catch {
    return null;
  }
}

export async function buildAndSaveLocalHcSnapshot(
  from: Date,
  to: Date,
  appMode: 'local_hc_test' | 'api' = 'local_hc_test',
): Promise<LocalHcDebugSnapshot> {
  const audit = await buildMobileAuditSnapshot(from, to);
  const items = await collectHealthDataForRange(from, to);
  const snapshot: LocalHcDebugSnapshot = {
    saved_at: new Date().toISOString(),
    app_mode: appMode,
    device: getDeviceLabel(),
    permissions_detail: audit.permissions_detail,
    raw_summary: audit.raw_summary,
    prepared_summary: audit.prepared_summary,
    items,
    probed_at: audit.probed_at,
    range: audit.range,
  };
  await saveLocalHcSnapshot(snapshot);
  return snapshot;
}

export function serializeLocalHcSnapshot(snapshot: LocalHcDebugSnapshot | null): string {
  return JSON.stringify(snapshot ?? {}, null, 2);
}
