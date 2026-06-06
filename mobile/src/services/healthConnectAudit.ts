import {Platform} from 'react-native';
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  SdkAvailabilityStatus,
  type Permission,
} from 'react-native-health-connect';

import {
  PERMISSIONS,
  checkAvailability,
  collectHealthDataForRange,
  readContinuousHeartRate,
  type HealthConnectDayPayload,
} from './HealthConnectService';
import {energyToKcal, lengthToMeters, massToKg} from './healthConnectUnits';

export type RawTypeProbe = {
  type: string;
  record_type: string;
  count: number;
  date_min: string | null;
  date_max: string | null;
  samples: unknown[];
  error?: string;
  unsupported?: boolean;
};

export type PermissionAudit = {
  sdk_available: boolean;
  sdk_status: number;
  granted: string[];
  missing: string[];
  permissions: Record<string, boolean>;
};

export type PreparedPayloadSummary = {
  day_count: number;
  days_with_steps: number;
  days_with_calories: number;
  days_with_weight: number;
  days_with_sleep: number;
  days_with_heart_rate: number;
  total_heart_rate_samples: number;
  total_workouts: number;
  preview_days: HealthConnectDayPayload[];
};

export type HeartRateProbeResult = {
  record_count: number;
  sample_count: number;
  first_sample: string | null;
  last_sample: string | null;
  rejected: number;
  duplicates: number;
  permission_granted: boolean;
  import_source: 'health_connect';
};

function permissionKey(p: Permission): string {
  return `${p.accessType}:${p.recordType}`;
}

function recordTimeKeys(record: {startTime?: string; endTime?: string; time?: string}): string[] {
  const keys: string[] = [];
  if (record.startTime) keys.push(record.startTime);
  if (record.endTime) keys.push(record.endTime);
  if (record.time) keys.push(record.time);
  return keys;
}

function summarizeDates(isoTimes: string[]): {min: string | null; max: string | null} {
  if (!isoTimes.length) return {min: null, max: null};
  const sorted = [...isoTimes].sort();
  return {min: sorted[0]!.slice(0, 10), max: sorted[sorted.length - 1]!.slice(0, 10)};
}

function truncateSample(record: unknown): unknown {
  if (record == null || typeof record !== 'object') return record;
  const r = record as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ['startTime', 'endTime', 'time', 'count', 'exerciseType', 'metadata']) {
    if (key in r) out[key] = r[key];
  }
  if ('energy' in r && r.energy) {
    out.energy_kcal = energyToKcal(r.energy as never);
  }
  if ('weight' in r && r.weight) {
    out.weight_kg = massToKg(r.weight as never);
  }
  if ('distance' in r && r.distance) {
    out.distance_m = lengthToMeters(r.distance as never);
  }
  return out;
}

async function probeRecordType(
  type: string,
  recordType: string,
  start: Date,
  end: Date,
): Promise<RawTypeProbe> {
  try {
    const {records} = await readRecords(recordType as never, {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    const times: string[] = [];
    for (const rec of records) {
      times.push(...recordTimeKeys(rec as never));
    }
    const range = summarizeDates(times);
    return {
      type,
      record_type: recordType,
      count: records.length,
      date_min: range.min,
      date_max: range.max,
      samples: records.slice(0, 3).map(truncateSample),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      type,
      record_type: recordType,
      count: 0,
      date_min: null,
      date_max: null,
      samples: [],
      error: msg,
      unsupported: msg.toLowerCase().includes('unsupported') || msg.toLowerCase().includes('unknown'),
    };
  }
}

export async function getPermissionAudit(): Promise<PermissionAudit> {
  const sdkStatus = await getSdkStatus();
  const sdk_available = sdkStatus === SdkAvailabilityStatus.SDK_AVAILABLE;
  const permissions: Record<string, boolean> = {};
  const grantedKeys: string[] = [];
  const missing: string[] = [];

  if (sdk_available) {
    await initialize();
    const granted = (await getGrantedPermissions()) as Permission[];
    const grantedSet = new Set(granted.map(permissionKey));
    for (const p of PERMISSIONS) {
      const key = p.recordType;
      const ok = grantedSet.has(permissionKey(p));
      permissions[key] = ok;
      if (ok) grantedKeys.push(key);
      else missing.push(key);
    }
    // Distance used in workouts but not in PERMISSIONS list
    const distPerm = {accessType: 'read' as const, recordType: 'Distance' as const};
    const distOk = grantedSet.has(permissionKey(distPerm));
    permissions.Distance = distOk;
    if (!distOk) missing.push('Distance');
  }

  return {
    sdk_available,
    sdk_status: sdkStatus,
    granted: grantedKeys,
    missing: [...new Set(missing)],
    permissions,
  };
}

export async function probeHeartRateSamples(from: Date, to: Date): Promise<HeartRateProbeResult> {
  const permissions = await getPermissionAudit();
  const ready = await checkAvailability();
  if (!ready) {
    return {
      record_count: 0,
      sample_count: 0,
      first_sample: null,
      last_sample: null,
      rejected: 0,
      duplicates: 0,
      permission_granted: Boolean(permissions.permissions.HeartRate),
      import_source: 'health_connect',
    };
  }
  await initialize();
  const hr = await readContinuousHeartRate(from, to);
  return {
    record_count: hr.recordCount,
    sample_count: hr.stats.accepted,
    first_sample: hr.stats.first,
    last_sample: hr.stats.last,
    rejected: hr.stats.rejected,
    duplicates: hr.stats.duplicates,
    permission_granted: Boolean(permissions.permissions.HeartRate),
    import_source: 'health_connect',
  };
}

export async function probeRawDataTypes(from: Date, to: Date): Promise<RawTypeProbe[]> {
  const ready = await checkAvailability();
  if (!ready) {
    return [];
  }
  await initialize();

  const probes = await Promise.all([
    probeRecordType('steps', 'Steps', from, to),
    probeRecordType('weight', 'Weight', from, to),
    probeRecordType('sleep', 'SleepSession', from, to),
    probeRecordType('total_calories', 'TotalCaloriesBurned', from, to),
    probeRecordType('active_calories', 'ActiveCaloriesBurned', from, to),
    probeRecordType('heart_rate', 'HeartRate', from, to),
    probeRecordType('workouts', 'ExerciseSession', from, to),
    probeRecordType('distance', 'Distance', from, to),
    probeRecordType('basal_metabolic_rate', 'BasalMetabolicRate', from, to),
  ]);

  return probes;
}

export async function buildPreparedPayloadSummary(
  from: Date,
  to: Date,
): Promise<PreparedPayloadSummary> {
  const items = await collectHealthDataForRange(from, to);
  let days_with_steps = 0;
  let days_with_calories = 0;
  let days_with_weight = 0;
  let days_with_sleep = 0;
  let days_with_heart_rate = 0;
  let total_heart_rate_samples = 0;
  let total_workouts = 0;

  for (const day of items) {
    if (day.steps != null) days_with_steps += 1;
    if (day.total_calories != null || day.active_calories != null) days_with_calories += 1;
    if (day.weight_kg != null) days_with_weight += 1;
    if (day.sleep) days_with_sleep += 1;
    if (day.heart_rate_samples?.length) {
      days_with_heart_rate += 1;
      total_heart_rate_samples += day.heart_rate_samples.length;
    }
    total_workouts += day.workouts?.length ?? 0;
  }

  return {
    day_count: items.length,
    days_with_steps,
    days_with_calories,
    days_with_weight,
    days_with_sleep,
    days_with_heart_rate,
    total_heart_rate_samples,
    total_workouts,
    preview_days: items.slice(-2),
  };
}

export async function buildMobileAuditSnapshot(from: Date, to: Date) {
  const [permissions, raw_summary, prepared_summary, heart_rate_probe] = await Promise.all([
    getPermissionAudit(),
    probeRawDataTypes(from, to),
    buildPreparedPayloadSummary(from, to),
    probeHeartRateSamples(from, to),
  ]);

  return {
    permissions: permissions.permissions,
    permissions_detail: permissions,
    raw_summary,
    prepared_summary,
    heart_rate_probe,
    probed_at: new Date().toISOString(),
    range: {from: from.toISOString(), to: to.toISOString()},
  };
}

export function getDeviceLabel(): string {
  return `Android ${Platform.Version}`;
}
