import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncDebugPhase =
  | 'idle'
  | 'reading'
  | 'preparing'
  | 'posting'
  | 'done'
  | 'error'
  | 'permission_denied';

export type BackendSummary = {
  ok?: boolean;
  received_days?: number;
  saved?: Record<string, unknown>;
  skipped?: {total?: number; by_reason?: Record<string, number>};
  warnings?: string[];
  sync_log_id?: number | null;
};

export type HeartRateSyncDebug = {
  hrRecords?: number;
  hrSamples?: number;
  hrFirst?: string | null;
  hrLast?: string | null;
  hrRejected?: number;
  hrDuplicates?: number;
  hrPermissionGranted?: boolean;
  hrImportSource?: string;
  hrSyncDurationMs?: number;
  hrWatermark?: string | null;
};

export type HealthConnectSyncDebugState = {
  phase: SyncDebugPhase;
  permissionsGranted?: string[];
  permissionsMissing?: string[];
  rawRecordCounts?: Record<string, number>;
  preparedDaysCount?: number;
  payloadBytes?: number;
  apiBaseUrl?: string;
  postUrlFull?: string;
  userIdPresent?: boolean;
  userIdMasked?: string;
  lastAttemptAt?: string;
  lastHttpStatus?: number | null;
  lastErrorText?: string;
  backendSummary?: BackendSummary;
  skipReason?: string;
} & HeartRateSyncDebug;

const DEBUG_KEY = 'health_connect_sync_debug_v1';

export function maskUserId(userId: string | null): string {
  if (!userId) {
    return '—';
  }
  if (userId === '1') {
    return '1';
  }
  return '***';
}

export async function getSyncDebugState(): Promise<HealthConnectSyncDebugState | null> {
  const raw = await AsyncStorage.getItem(DEBUG_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as HealthConnectSyncDebugState;
  } catch {
    return null;
  }
}

export async function patchSyncDebugState(
  patch: Partial<HealthConnectSyncDebugState>,
): Promise<HealthConnectSyncDebugState> {
  const prev = (await getSyncDebugState()) ?? {phase: 'idle' as SyncDebugPhase};
  const next = {...prev, ...patch};
  await AsyncStorage.setItem(DEBUG_KEY, JSON.stringify(next));
  return next;
}

export async function persistSyncDebugError(
  err: unknown,
  extra?: Partial<HealthConnectSyncDebugState>,
): Promise<void> {
  const {formatUserFacingError} = await import('../utils/userFacingError');
  const message = formatUserFacingError(err);
  await patchSyncDebugState({
    phase: 'error',
    lastAttemptAt: new Date().toISOString(),
    lastErrorText: message,
    ...extra,
  });
}

export function formatSyncChainStatus(state: HealthConnectSyncDebugState | null): string {
  if (!state) {
    return '';
  }
  if (state.skipReason) {
    return state.skipReason;
  }
  if (state.phase === 'error' && state.lastErrorText) {
    return state.lastErrorText;
  }
  const bs = state.backendSummary;
  if (bs && state.phase === 'done') {
    const sent = state.preparedDaysCount ?? '—';
    const recv = bs.received_days ?? '—';
    const savedObj = bs.saved;
    const savedFields =
      savedObj && typeof savedObj === 'object' && 'fields' in savedObj
        ? String(savedObj.fields)
        : JSON.stringify(savedObj ?? {});
    return `Отправлено ${sent} / принято ${recv} / сохранено ${savedFields}`;
  }
  return '';
}
