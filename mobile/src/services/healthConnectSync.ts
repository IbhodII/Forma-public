import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';

import {getStoredOperatingMode} from '../auth/session';
import {
  finishSyncRun,
  startSyncRun,
  upsertDayMetricsBatch,
  type HcSyncTrigger,
} from '../database/hcStore';
import {
  rebuildDayRollupsForDates,
  upsertHcRecords,
} from '../database/hcRecordStore';
import {pingFirstAvailable} from '../api/ping';
import {getApiBaseUrl} from '../config/apiBase';
import {apiFetch, getUserId} from '../api/client';
import {buildApiUrl, HC_SYNC_PATH} from '../api/url';
import {
  collectHealthDataForRangeWithProviders,
  checkAvailability,
  ensureHealthConnectReady,
  type HealthConnectDayPayload,
} from './HealthConnectService';
import {buildMobileAuditSnapshot, getDeviceLabel, type RawTypeProbe} from './healthConnectAudit';
import {
  getHcLastLocalReadAt,
  isHealthConnectModuleEnabled,
  setHcLastLocalReadAt,
} from './hcModuleSettings';
import {
  getEnabledHcDataTypes,
  getInitialSyncDays,
  type HcBackgroundStatus,
} from './hcCollectorSettings';
import {
  resolveIncrementalWindow,
  resolveInitialWindow,
} from './hcReadWindow';
import {
  maskUserId,
  patchSyncDebugState,
  persistSyncDebugError,
  type BackendSummary,
  type HeartRateSyncDebug,
} from './healthConnectSyncDebug';

const LAST_SYNC_KEY = 'health_connect_last_sync_at';
const LAST_HR_IMPORT_KEY = 'health_connect_last_hr_import_at';
const LAST_SYNC_AUDIT_KEY = 'health_connect_last_sync_audit';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const HR_OVERLAP_MS = 6 * 60 * 60 * 1000;

export type HealthConnectSyncAudit = {
  received_totals?: Record<string, unknown>;
  saved_totals?: Record<string, unknown>;
  skipped_totals?: {by_reason?: Record<string, number>; total?: number};
  warnings?: string[];
  day_summaries?: unknown[];
};

export type HealthConnectSyncResponse = {
  ok?: boolean;
  status: string;
  saved_days: number;
  received_days?: number;
  saved?: Record<string, unknown>;
  skipped?: {total?: number; by_reason?: Record<string, number>};
  warnings?: string[];
  sync_log_id?: number | null;
  results?: unknown[];
  errors?: Array<{date: string; error: string}>;
  audit?: HealthConnectSyncAudit;
};

export async function getLastSyncTime(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
  if (!raw) {
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function setLastSyncTime(date: Date): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, date.toISOString());
}

export async function getLastHrImportTime(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(LAST_HR_IMPORT_KEY);
  if (!raw) {
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function setLastHrImportTime(date: Date): Promise<void> {
  await AsyncStorage.setItem(LAST_HR_IMPORT_KEY, date.toISOString());
}

export async function clearLastHrImportTime(): Promise<void> {
  await AsyncStorage.removeItem(LAST_HR_IMPORT_KEY);
}

export async function getLastSyncAudit(): Promise<HealthConnectSyncResponse | null> {
  const raw = await AsyncStorage.getItem(LAST_SYNC_AUDIT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HealthConnectSyncResponse;
  } catch {
    return null;
  }
}

async function persistLastSyncAudit(response: HealthConnectSyncResponse): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_AUDIT_KEY, JSON.stringify(response));
}

function rawSummaryToCounts(rawSummary: unknown): Record<string, number> {
  if (!Array.isArray(rawSummary)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of rawSummary as RawTypeProbe[]) {
    out[row.type] = row.count;
  }
  return out;
}

function summarizeHrFromItems(items: HealthConnectDayPayload[]): HeartRateSyncDebug {
  let hrSamples = 0;
  let maxTime: Date | null = null;
  for (const day of items) {
    for (const sample of day.heart_rate_samples ?? []) {
      hrSamples += 1;
      const t = new Date(sample.time);
      if (!Number.isNaN(t.getTime()) && (!maxTime || t > maxTime)) {
        maxTime = t;
      }
    }
  }
  return {
    hrSamples,
    hrLast: maxTime?.toISOString() ?? null,
  };
}

function buildBackendSummary(data: HealthConnectSyncResponse): BackendSummary {
  return {
    ok: data.ok,
    received_days: data.received_days ?? (data.audit?.received_totals?.days as number | undefined),
    saved: (data.saved ?? data.audit?.saved_totals) as Record<string, unknown> | undefined,
    skipped: data.skipped ?? data.audit?.skipped_totals,
    warnings: data.warnings ?? data.audit?.warnings,
    sync_log_id: data.sync_log_id,
  };
}

function buildSyncMessage(
  itemsCount: number,
  result: HealthConnectSyncResponse,
): {ok: boolean; message: string} {
  const auditBlock = result.audit;
  const receivedDays =
    result.received_days ?? (auditBlock?.received_totals?.days as number | undefined) ?? itemsCount;
  const savedTotals = (result.saved ?? auditBlock?.saved_totals ?? {}) as Record<string, unknown>;
  const savedFields = Number(savedTotals.fields) || 0;
  const skippedTotal = result.skipped?.total ?? auditBlock?.skipped_totals?.total ?? 0;
  const errCount = result.errors?.length ?? 0;
  const baseMsg = `Отправлено ${itemsCount} / принято ${receivedDays} / сохранено ${savedFields} полей`;

  if (errCount > 0) {
    return {
      ok: (result.saved_days ?? 0) > 0 || savedFields > 0,
      message: `${baseMsg}, ошибок: ${errCount}`,
    };
  }

  if (savedFields === 0 && itemsCount > 0) {
    const byReason = result.skipped?.by_reason ?? auditBlock?.skipped_totals?.by_reason;
    const reasonText = byReason ? ` (${JSON.stringify(byReason)})` : '';
    return {
      ok: false,
      message: `${baseMsg}. Все записи пропущены${reasonText}`,
    };
  }

  const suffix = skippedTotal > 0 ? `, пропущено: ${skippedTotal}` : '';
  const ok =
    result.ok !== false &&
    (result.status !== 'partial' || savedFields > 0 || (result.saved_days ?? 0) > 0);
  return {
    ok,
    message: `${baseMsg}${suffix}`,
  };
}

export async function uploadHealthConnectData(
  items: HealthConnectDayPayload[],
  audit?: Record<string, unknown>,
  deviceLabel?: string,
): Promise<HealthConnectSyncResponse> {
  const base = await getApiBaseUrl();
  if (!base) {
    throw new Error(
      'Не задан адрес API. Укажите локальный и/или Tailscale URL в настройках или в mobile/.env.',
    );
  }

  const postUrlFull = buildApiUrl(base, HC_SYNC_PATH);
  const bodyStr = JSON.stringify({items, audit, device_label: deviceLabel});

  await patchSyncDebugState({
    phase: 'posting',
    apiBaseUrl: base,
    postUrlFull,
    payloadBytes: bodyStr.length,
    preparedDaysCount: items.length,
    lastAttemptAt: new Date().toISOString(),
    lastHttpStatus: null,
    lastErrorText: undefined,
  });

  const res = await apiFetch(HC_SYNC_PATH, {
    method: 'POST',
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    const errMsg = text ? `${text} (HTTP ${res.status}, ${postUrlFull})` : `HTTP ${res.status} ${postUrlFull}`;
    await patchSyncDebugState({
      phase: 'error',
      lastHttpStatus: res.status,
      lastErrorText: errMsg,
    });
    throw new Error(errMsg);
  }

  const data = (await res.json()) as HealthConnectSyncResponse;
  await persistLastSyncAudit(data);
  await patchSyncDebugState({
    phase: 'done',
    lastHttpStatus: res.status,
    lastErrorText: undefined,
    backendSummary: buildBackendSummary(data),
  });
  return data;
}

export async function shouldSkipHealthConnect(): Promise<{reason: string} | null> {
  if (Platform.OS !== 'android') {
    return {reason: 'Health Connect доступен только на Android'};
  }
  const enabled = await isHealthConnectModuleEnabled();
  if (!enabled) {
    return {reason: 'Health Connect выключен в настройках'};
  }
  return null;
}

async function shouldSkipBackendSync(): Promise<{
  reason: string;
  base?: string;
  pingError?: string;
} | null> {
  const mode = await getStoredOperatingMode();
  if (mode === 'local_hc_test') {
    return {reason: 'Синхронизация отключена в локальном режиме Health Connect'};
  }
  if (mode === 'autonomous' || mode === 'cloud') {
    return {reason: 'Синхронизация с ПК отключена в автономном режиме'};
  }

  const base = await getApiBaseUrl();
  if (!base) {
    return {
      reason: 'API недоступен: адрес не задан. Укажите URL в настройках подключения к ПК.',
    };
  }

  const ping = await pingFirstAvailable([base]);
  if (!ping.ok) {
    return {
      reason: `API недоступен: ${ping.error}`,
      base: ping.base,
      pingError: ping.error,
    };
  }

  return null;
}

async function resolveSyncFrom(
  to: Date,
  options?: {from?: Date; fullHrResync?: boolean},
): Promise<Date> {
  if (options?.from) {
    return options.from;
  }

  const sevenDaysAgo = new Date(to.getTime() - SEVEN_DAYS_MS);

  if (options?.fullHrResync) {
    await clearLastHrImportTime();
    const lastSync = await getLastSyncTime();
    return lastSync && lastSync > sevenDaysAgo ? lastSync : sevenDaysAgo;
  }

  const lastSync = await getLastSyncTime();
  const lastHr = await getLastHrImportTime();
  const fromHr = lastHr
    ? new Date(lastHr.getTime() - HR_OVERLAP_MS)
    : sevenDaysAgo;
  const fromSync = lastSync ?? sevenDaysAgo;

  return new Date(
    Math.max(fromHr.getTime(), fromSync.getTime(), sevenDaysAgo.getTime()),
  );
}

async function patchDebugFromCollect(
  from: Date,
  to: Date,
  items: HealthConnectDayPayload[],
  syncStartedAt: number,
): Promise<void> {
  const audit = await buildMobileAuditSnapshot(from, to);
  const permissionsDetail = audit.permissions_detail as {
    granted?: string[];
    missing?: string[];
  };
  const rawRecordCounts = rawSummaryToCounts(audit.raw_summary);
  const hrProbe = audit.heart_rate_probe as {
    record_count?: number;
    sample_count?: number;
    first_sample?: string | null;
    last_sample?: string | null;
    rejected?: number;
    duplicates?: number;
    permission_granted?: boolean;
  } | undefined;
  const hrFromItems = summarizeHrFromItems(items);
  const lastHrWatermark = await getLastHrImportTime();
  const payloadBytes = JSON.stringify({items, audit, device_label: getDeviceLabel()}).length;

  await patchSyncDebugState({
    permissionsGranted: permissionsDetail?.granted ?? [],
    permissionsMissing: permissionsDetail?.missing ?? [],
    rawRecordCounts,
    preparedDaysCount: items.length,
    payloadBytes,
    lastAttemptAt: new Date().toISOString(),
    hrRecords: hrProbe?.record_count,
    hrSamples: hrFromItems.hrSamples ?? hrProbe?.sample_count,
    hrFirst: hrProbe?.first_sample ?? null,
    hrLast: hrFromItems.hrLast ?? hrProbe?.last_sample ?? null,
    hrRejected: hrProbe?.rejected,
    hrDuplicates: hrProbe?.duplicates,
    hrPermissionGranted: hrProbe?.permission_granted,
    hrImportSource: 'health_connect',
    hrSyncDurationMs: Date.now() - syncStartedAt,
    hrWatermark: lastHrWatermark?.toISOString() ?? null,
  });
}

async function resolveReadWindow(
  trigger: HcSyncTrigger,
  options?: {from?: Date; to?: Date; fullHrResync?: boolean; initialDays?: 7 | 14 | 30},
): Promise<{from: Date; to: Date}> {
  const to = options?.to ?? new Date();
  if (options?.from) {
    return {from: options.from, to};
  }
  if (trigger === 'initial') {
    const days = options?.initialDays ?? (await getInitialSyncDays());
    return resolveInitialWindow(days, to);
  }
  if (trigger === 'background' || trigger === 'manual') {
    const lastRead = await getHcLastLocalReadAt();
    return resolveIncrementalWindow(lastRead, to);
  }
  return resolveIncrementalWindow(await getHcLastLocalReadAt(), to);
}

async function executeLocalCollect(options: {
  trigger: HcSyncTrigger;
  from?: Date;
  to?: Date;
  fullHrResync?: boolean;
  initialDays?: 7 | 14 | 30;
}): Promise<{
  ok: boolean;
  message: string;
  status: HcBackgroundStatus;
  saved_days?: number;
  recordsFound: number;
  recordsSaved: number;
  items?: HealthConnectDayPayload[];
  error?: string;
}> {
  const skip = await shouldSkipHealthConnect();
  if (skip) {
    await patchSyncDebugState({
      phase: 'error',
      skipReason: skip.reason,
      lastErrorText: skip.reason,
    });
    return {
      ok: false,
      message: skip.reason,
      status: 'error',
      recordsFound: 0,
      recordsSaved: 0,
      error: skip.reason,
    };
  }

  const syncStartedAt = Date.now();
  await patchSyncDebugState({phase: 'reading', skipReason: undefined});

  const available = await checkAvailability();
  if (!available) {
    const msg = 'Health Connect недоступен на устройстве';
    await patchSyncDebugState({phase: 'error', lastErrorText: msg});
    return {
      ok: false,
      message: msg,
      status: 'unavailable',
      recordsFound: 0,
      recordsSaved: 0,
      error: msg,
    };
  }

  const ready = await ensureHealthConnectReady({requestPermissions: false});
  if (!ready) {
    const msg = 'Нет разрешений Health Connect — откройте настройки и выдайте доступ';
    await patchSyncDebugState({
      phase: 'permission_denied',
      lastErrorText: msg,
      lastAttemptAt: new Date().toISOString(),
    });
    return {
      ok: false,
      message: msg,
      status: 'permissions',
      recordsFound: 0,
      recordsSaved: 0,
      error: msg,
    };
  }

  let {from, to} = await resolveReadWindow(options.trigger, options);
  if (from >= to) {
    from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  }

  const runId = await startSyncRun(from.toISOString(), to.toISOString(), options.trigger);
  const enabledTypes = await getEnabledHcDataTypes();

  try {
    const collected = await collectHealthDataForRangeWithProviders(from, to, {enabledTypes});
    const {days: items, providersByDay, recordCounts, records} = collected;

    await patchDebugFromCollect(from, to, items, syncStartedAt);

    const {found, saved} = await upsertHcRecords(records);
    const affectedDates = [...new Set(items.map(d => d.date))];
    const savedDays = affectedDates.length
      ? await rebuildDayRollupsForDates(affectedDates)
      : await upsertDayMetricsBatch(items, providersByDay);
    const readAt = new Date().toISOString();
    await setHcLastLocalReadAt(readAt);

    const hasData = found > 0 || items.length > 0;
    const bgStatus: HcBackgroundStatus = hasData ? 'ok' : 'no_data';
    const audit = await buildMobileAuditSnapshot(from, to);

    await finishSyncRun(
      runId,
      hasData ? 'ok' : 'partial',
      {...recordCounts, days: savedDays, records_found: found, records_saved: saved},
      hasData ? undefined : 'Нет новых данных',
      JSON.stringify({summary: audit.raw_summary, trigger: options.trigger}),
    );
    await patchSyncDebugState({phase: 'done', lastErrorText: undefined});

    if (!hasData) {
      return {
        ok: true,
        message: 'Нет новых данных за выбранный период',
        status: 'no_data',
        saved_days: 0,
        recordsFound: found,
        recordsSaved: saved,
        items: [],
      };
    }

    return {
      ok: true,
      message: `Локально сохранено ${savedDays} дн., записей: ${saved}`,
      status: bgStatus,
      saved_days: savedDays,
      recordsFound: found,
      recordsSaved: saved,
      items,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка локального чтения HC';
    await finishSyncRun(runId, 'error', {}, msg);
    await persistSyncDebugError(err);
    return {
      ok: false,
      message: msg,
      status: 'error',
      recordsFound: 0,
      recordsSaved: 0,
      error: msg,
    };
  }
}

/**
 * Фоновый сбор HC → SQLite (без desktop API).
 */
export async function runHealthConnectBackgroundCollect(): Promise<{
  ok: boolean;
  status: HcBackgroundStatus;
  recordsFound: number;
  recordsSaved: number;
  error?: string;
}> {
  const result = await executeLocalCollect({trigger: 'background'});
  return {
    ok: result.ok,
    status: result.status,
    recordsFound: result.recordsFound,
    recordsSaved: result.recordsSaved,
    error: result.error,
  };
}

/**
 * Локальное чтение HC → SQLite (hc_day_metrics, hc_sync_runs).
 */
export async function runHealthConnectLocalRead(options?: {
  from?: Date;
  to?: Date;
  fullHrResync?: boolean;
  trigger?: HcSyncTrigger;
  initialDays?: 7 | 14 | 30;
}): Promise<{
  ok: boolean;
  message: string;
  status?: string;
  saved_days?: number;
  items?: HealthConnectDayPayload[];
}> {
  const trigger = options?.trigger ?? (options?.initialDays ? 'initial' : 'manual');
  const result = await executeLocalCollect({...options, trigger});
  return {
    ok: result.ok,
    message: result.message,
    status: result.status,
    saved_days: result.saved_days,
    items: result.items,
  };
}

/**
 * Полная синхронизация: локальное чтение → (legacy_api) POST на сервер.
 */
export async function runHealthConnectSync(options?: {
  from?: Date;
  to?: Date;
  fullHrResync?: boolean;
}): Promise<{
  ok: boolean;
  message: string;
  saved_days?: number;
  audit?: HealthConnectSyncAudit;
}> {
  const skipHc = await shouldSkipHealthConnect();
  if (skipHc) {
    await patchSyncDebugState({
      phase: 'error',
      skipReason: skipHc.reason,
      lastErrorText: skipHc.reason,
      lastAttemptAt: new Date().toISOString(),
    });
    return {ok: false, message: skipHc.reason};
  }

  const localResult = await runHealthConnectLocalRead({...options, trigger: 'manual'});
  const skipBackend = await shouldSkipBackendSync();

  if (skipBackend) {
    await patchSyncDebugState({
      skipReason: skipBackend.reason,
      apiBaseUrl: skipBackend.base,
      lastErrorText: skipBackend.pingError ?? skipBackend.reason,
    });
    return {
      ok: localResult.ok,
      message: localResult.ok
        ? `${localResult.message}. ${skipBackend.reason}`
        : localResult.message,
      saved_days: localResult.saved_days,
    };
  }

  const items = localResult.items ?? [];
  if (!items.length) {
    return {
      ok: false,
      message: localResult.message || 'Health Connect не вернул данных за выбранный период',
      saved_days: 0,
    };
  }

  const syncStartedAt = Date.now();
  const base = await getApiBaseUrl();
  const userId = await getUserId();
  await patchSyncDebugState({
    phase: 'preparing',
    apiBaseUrl: base ?? undefined,
    postUrlFull: base ? buildApiUrl(base, HC_SYNC_PATH) : undefined,
    userIdPresent: Boolean(userId),
    userIdMasked: maskUserId(userId),
  });

  if (!userId) {
    const msg = 'Не задан пользователь (X-User-ID). Войдите в приложение.';
    await patchSyncDebugState({
      phase: 'error',
      lastErrorText: msg,
      lastAttemptAt: new Date().toISOString(),
    });
    return {ok: false, message: msg};
  }

  const to = options?.to ?? new Date();
  let from = await resolveSyncFrom(to, options);
  if (from >= to) {
    from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  }

  const audit = await buildMobileAuditSnapshot(from, to);
  const hrFromItems = summarizeHrFromItems(items);

  try {
    const result = await uploadHealthConnectData(items, audit, getDeviceLabel());
    await setLastSyncTime(to);
    if (hrFromItems.hrLast) {
      await setLastHrImportTime(new Date(hrFromItems.hrLast));
    }
    const {ok, message} = buildSyncMessage(items.length, result);
    await patchSyncDebugState({
      hrSyncDurationMs: Date.now() - syncStartedAt,
    });
    return {
      ok,
      message: `${localResult.message}. ${message}`,
      saved_days: result.saved_days,
      audit: result.audit,
    };
  } catch (err) {
    await persistSyncDebugError(err);
    throw err;
  }
}

export {getHcLastLocalReadAt};

/** Sync presets for diagnostics. */
export function syncRangeToday(): {from: Date; to: Date} {
  const to = new Date();
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  return {from, to};
}

export function syncRangeLast24h(): {from: Date; to: Date} {
  const to = new Date();
  return {from: new Date(to.getTime() - 24 * 60 * 60 * 1000), to};
}

export function syncRangeLast7d(): {from: Date; to: Date} {
  const to = new Date();
  return {from: new Date(to.getTime() - SEVEN_DAYS_MS), to};
}
