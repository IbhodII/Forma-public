import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
  type Permission,
  type SleepSessionRecord,
} from 'react-native-health-connect';

type TimeRangeFilter = {
  operator: 'between';
  startTime: string;
  endTime: string;
};

import {
  bucketHeartRateByLocalDay,
  normalizeHeartRatePoints,
  type HeartRateNormalizeStats,
  type RawHrPoint,
} from './heartRateNormalize';
import {energyToKcal, lengthToMeters, massToKg} from './healthConnectUnits';
import type {HcDataType} from './hcCollectorSettings';
import type {HcRecordInput} from '../database/hcRecordStore';

/** Алиас для совместимости с примерами документации. */
export const PERMISSIONS: Permission[] = [
  {accessType: 'read', recordType: 'SleepSession'},
  {accessType: 'read', recordType: 'ActiveCaloriesBurned'},
  {accessType: 'read', recordType: 'TotalCaloriesBurned'},
  {accessType: 'read', recordType: 'Steps'},
  {accessType: 'read', recordType: 'ExerciseSession'},
  {accessType: 'read', recordType: 'HeartRate'},
  {accessType: 'read', recordType: 'Weight'},
  {accessType: 'read', recordType: 'Distance'},
];

export type HealthConnectSleepPayload = {
  start_time: string;
  end_time: string;
  duration_seconds: number;
  light_seconds: number;
  deep_seconds: number;
  rem_seconds: number;
  external_id?: string;
};

export type HealthConnectWorkoutPayload = {
  external_id?: string;
  exercise_type?: number;
  start_time: string;
  end_time: string;
  date?: string;
  duration_sec: number;
  calories_kcal?: number;
  avg_hr?: number;
  max_hr?: number;
  distance_m?: number;
  steps?: number;
  heart_rate_samples?: Array<{elapsed_sec: number; bpm: number}>;
};

export type HealthConnectDayPayload = {
  date: string;
  steps?: number;
  active_calories?: number;
  total_calories?: number;
  weight_kg?: number;
  sleep?: HealthConnectSleepPayload;
  workouts?: HealthConnectWorkoutPayload[];
  heart_rate_samples?: Array<{time: string; bpm: number}>;
};

export type HealthConnectDayProviders = {
  steps?: string;
  active_calories?: string;
  total_calories?: string;
  weight?: string;
  sleep?: string;
  heart_rate?: string;
  workouts?: string;
};

export type HealthConnectCollectResult = {
  days: HealthConnectDayPayload[];
  providersByDay: Map<string, HealthConnectDayProviders>;
  recordCounts: Record<string, number>;
  records: import('../database/hcRecordStore').HcRecordInput[];
};

export type ContinuousHeartRateReadResult = {
  rawPoints: RawHrPoint[];
  stats: HeartRateNormalizeStats;
  recordCount: number;
};

function extractDataOrigin(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const origin = (metadata as {dataOrigin?: unknown}).dataOrigin;
  if (typeof origin === 'string') {
    return origin;
  }
  if (origin && typeof origin === 'object' && 'packageName' in origin) {
    return String((origin as {packageName?: string}).packageName);
  }
  return undefined;
}

function trackOrigin(
  countsByDay: Map<string, Map<string, number>>,
  day: string,
  metadata: unknown,
): void {
  const origin = extractDataOrigin(metadata);
  if (!origin) {
    return;
  }
  let dayCounts = countsByDay.get(day);
  if (!dayCounts) {
    dayCounts = new Map();
    countsByDay.set(day, dayCounts);
  }
  dayCounts.set(origin, (dayCounts.get(origin) ?? 0) + 1);
}

function dominantOrigin(countsByDay: Map<string, Map<string, number>>, day: string): string | undefined {
  const dayCounts = countsByDay.get(day);
  if (!dayCounts?.size) {
    return undefined;
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [origin, count] of dayCounts) {
    if (count > bestCount) {
      best = origin;
      bestCount = count;
    }
  }
  return best;
}

function providersFromCounts(
  countsByDay: Map<string, Map<string, number>>,
  field: keyof HealthConnectDayProviders,
  providersByDay: Map<string, HealthConnectDayProviders>,
): void {
  for (const day of countsByDay.keys()) {
    const origin = dominantOrigin(countsByDay, day);
    if (!origin) {
      continue;
    }
    const row = providersByDay.get(day) ?? {};
    row[field] = origin;
    providersByDay.set(day, row);
  }
}

function timeRange(start: Date, end: Date): TimeRangeFilter {
  return {
    operator: 'between',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function durationSec(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 1000));
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isLightStage(stage: number): boolean {
  return stage === SleepStageType.LIGHT || stage === 3;
}

function isDeepStage(stage: number): boolean {
  return stage === SleepStageType.DEEP || stage === 4;
}

function isRemStage(stage: number): boolean {
  return (
    stage === SleepStageType.REM || stage === 5 || stage === 6
  );
}

function sumSleepStages(stages: SleepSessionRecord['stages']): {
  light_seconds: number;
  deep_seconds: number;
  rem_seconds: number;
} {
  let light_seconds = 0;
  let deep_seconds = 0;
  let rem_seconds = 0;
  for (const stage of stages ?? []) {
    const sec = durationSec(stage.startTime, stage.endTime);
    if (isLightStage(stage.stage)) {
      light_seconds += sec;
    } else if (isDeepStage(stage.stage)) {
      deep_seconds += sec;
    } else if (isRemStage(stage.stage)) {
      rem_seconds += sec;
    }
  }
  return {light_seconds, deep_seconds, rem_seconds};
}

/** Проверка доступности Health Connect на устройстве. */
export async function checkAvailability(): Promise<boolean> {
  const status = await getSdkStatus();
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

function permissionKey(p: Permission): string {
  return `${p.accessType}:${p.recordType}`;
}

function hasRequiredPermissions(
  granted: Permission[],
  required: Permission[],
): boolean {
  const grantedKeys = new Set(granted.map(permissionKey));
  return required.every(p => grantedKeys.has(permissionKey(p)));
}

/**
 * Инициализация Health Connect без диалога разрешений (для фоновой синхронизации).
 */
export async function ensureHealthConnectReady(options?: {
  requestPermissions?: boolean;
}): Promise<boolean> {
  const isAvailable = await checkAvailability();
  if (!isAvailable) {
    return false;
  }

  const initialized = await initialize();
  if (!initialized) {
    return false;
  }

  const granted = (await getGrantedPermissions()) as Permission[];
  if (hasRequiredPermissions(granted, PERMISSIONS)) {
    return true;
  }

  if (options?.requestPermissions) {
    const result = await requestPermission(PERMISSIONS);
    return Array.isArray(result) && result.length > 0;
  }

  return false;
}

/**
 * Инициализация и запрос разрешений на чтение (кнопка в настройках).
 */
export async function setupHealthConnect(): Promise<boolean> {
  return ensureHealthConnectReady({requestPermissions: true});
}

export async function readStepsInRange(
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const {records} = await readRecords('Steps', {timeRangeFilter: timeRange(start, end)});
  const byDay = new Map<string, number>();
  for (const row of records) {
    const day = localDateKey(row.startTime);
    byDay.set(day, (byDay.get(day) ?? 0) + (row.count ?? 0));
  }
  return byDay;
}

export async function readActiveCaloriesInRange(
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const {records} = await readRecords('ActiveCaloriesBurned', {
    timeRangeFilter: timeRange(start, end),
  });
  const byDay = new Map<string, number>();
  for (const row of records) {
    const day = localDateKey(row.startTime);
    byDay.set(day, (byDay.get(day) ?? 0) + energyToKcal(row.energy));
  }
  return byDay;
}

export async function readTotalCaloriesInRange(
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const {records} = await readRecords('TotalCaloriesBurned', {
    timeRangeFilter: timeRange(start, end),
  });
  const byDay = new Map<string, number>();
  for (const row of records) {
    const day = localDateKey(row.startTime);
    byDay.set(day, (byDay.get(day) ?? 0) + energyToKcal(row.energy));
  }
  return byDay;
}

export async function readSleepInRange(
  start: Date,
  end: Date,
): Promise<HealthConnectSleepPayload[]> {
  const {records} = await readRecords('SleepSession', {
    timeRangeFilter: timeRange(start, end),
  });
  return records.map(session => {
    const stages = sumSleepStages(session.stages);
    return {
      start_time: session.startTime,
      end_time: session.endTime,
      duration_seconds: durationSec(session.startTime, session.endTime),
      ...stages,
      external_id: session.metadata?.id,
    };
  });
}

export async function readWeightInRange(
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const {records} = await readRecords('Weight', {timeRangeFilter: timeRange(start, end)});
  const byDay = new Map<string, number>();
  for (const row of records) {
    const kg = massToKg(row.weight);
    if (kg == null) {
      continue;
    }
    byDay.set(localDateKey(row.time), kg);
  }
  return byDay;
}

/** Read all HeartRateRecord blocks with pagination; flatten samples. */
export async function readContinuousHeartRate(
  start: Date,
  end: Date,
  originCountsOut?: Map<string, Map<string, number>>,
): Promise<ContinuousHeartRateReadResult> {
  const filter = timeRange(start, end);
  const rawPoints: RawHrPoint[] = [];
  let recordCount = 0;
  let pageToken: string | undefined;

  do {
    const result = await readRecords('HeartRate', {
      timeRangeFilter: filter,
      ...(pageToken ? {pageToken} : {}),
    });
    const records = result.records ?? [];
    recordCount += records.length;
    for (const block of records) {
      for (const sample of block.samples ?? []) {
        if (originCountsOut) {
          trackOrigin(originCountsOut, localDateKey(sample.time), block.metadata);
        }
        rawPoints.push({
          timeMs: new Date(sample.time).getTime(),
          bpm: sample.beatsPerMinute,
        });
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  const {points, stats} = normalizeHeartRatePoints(rawPoints);
  return {
    rawPoints: points.map(p => ({
      timeMs: new Date(p.timestamp).getTime(),
      bpm: p.bpm,
    })),
    stats,
    recordCount,
  };
}

function hrStatsForWindow(
  points: RawHrPoint[],
  startMs: number,
  endMs: number,
): {avg_hr?: number; max_hr?: number; samples: Array<{elapsed_sec: number; bpm: number}>} {
  const inWindow = points.filter(
    p => p.timeMs >= startMs && p.timeMs <= endMs,
  );
  if (!inWindow.length) {
    return {samples: []};
  }
  const bpms = inWindow.map(p => p.bpm);
  const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
  const max = Math.max(...bpms);
  const samples = inWindow.map(p => ({
    elapsed_sec: Math.max(0, Math.round((p.timeMs - startMs) / 1000)),
    bpm: p.bpm,
  }));
  return {avg_hr: avg, max_hr: max, samples};
}

export async function readWorkoutsInRange(
  start: Date,
  end: Date,
  hrPoints?: RawHrPoint[],
): Promise<HealthConnectWorkoutPayload[]> {
  const filter = timeRange(start, end);
  const [sessions, activeCal, distances, stepsRecords, resolvedHr] =
    await Promise.all([
      readRecords('ExerciseSession', {timeRangeFilter: filter}),
      readRecords('ActiveCaloriesBurned', {timeRangeFilter: filter}),
      readRecords('Distance', {timeRangeFilter: filter}),
      readRecords('Steps', {timeRangeFilter: filter}),
      hrPoints != null
        ? Promise.resolve(hrPoints)
        : readContinuousHeartRate(start, end).then(r => r.rawPoints),
    ]);

  return sessions.records.map(session => {
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();

    let calories_kcal = 0;
    for (const cal of activeCal.records) {
      const c0 = new Date(cal.startTime).getTime();
      const c1 = new Date(cal.endTime).getTime();
      if (overlaps(startMs, endMs, c0, c1)) {
        calories_kcal += energyToKcal(cal.energy);
      }
    }

    let distance_m = 0;
    for (const dist of distances.records) {
      const d0 = new Date(dist.startTime).getTime();
      const d1 = new Date(dist.endTime).getTime();
      if (overlaps(startMs, endMs, d0, d1)) {
        distance_m += lengthToMeters(dist.distance) ?? 0;
      }
    }

    let steps = 0;
    for (const st of stepsRecords.records) {
      const s0 = new Date(st.startTime).getTime();
      const s1 = new Date(st.endTime).getTime();
      if (overlaps(startMs, endMs, s0, s1)) {
        steps += st.count ?? 0;
      }
    }

    const hr = hrStatsForWindow(resolvedHr, startMs, endMs);

    return {
      external_id: session.metadata?.id,
      exercise_type: session.exerciseType,
      start_time: session.startTime,
      end_time: session.endTime,
      date: localDateKey(session.endTime),
      duration_sec: durationSec(session.startTime, session.endTime),
      calories_kcal: calories_kcal > 0 ? Math.round(calories_kcal) : undefined,
      distance_m: distance_m > 0 ? distance_m : undefined,
      steps: steps > 0 ? steps : undefined,
      avg_hr: hr.avg_hr,
      max_hr: hr.max_hr,
      heart_rate_samples: hr.samples.length ? hr.samples : undefined,
    };
  });
}

/** Собрать дневные пакеты с провайдерами и счётчиками записей. */
export async function collectHealthDataForRangeWithProviders(
  start: Date,
  end: Date,
  options?: {enabledTypes?: Set<HcDataType>},
): Promise<HealthConnectCollectResult> {
  const enabled = options?.enabledTypes ?? new Set<HcDataType>([
    'steps',
    'sleep',
    'heart_rate',
    'calories',
    'workouts',
  ]);
  const filter = timeRange(start, end);
  const providersByDay = new Map<string, HealthConnectDayProviders>();
  const recordCounts: Record<string, number> = {};
  const records: HcRecordInput[] = [];
  const originMaps = {
    steps: new Map<string, Map<string, number>>(),
    active_calories: new Map<string, Map<string, number>>(),
    total_calories: new Map<string, Map<string, number>>(),
    sleep: new Map<string, Map<string, number>>(),
    heart_rate: new Map<string, Map<string, number>>(),
    workouts: new Map<string, Map<string, number>>(),
  };

  const readSteps = enabled.has('steps');
  const readCalories = enabled.has('calories');
  const readSleep = enabled.has('sleep');
  const readHr = enabled.has('heart_rate');
  const readWorkoutsType = enabled.has('workouts');

  const hrRead = readHr
    ? await readContinuousHeartRate(start, end, originMaps.heart_rate)
    : {
        rawPoints: [] as RawHrPoint[],
        recordCount: 0,
        stats: {rejected: 0, duplicates: 0} as HeartRateNormalizeStats,
      };

  if (readHr) {
    recordCounts.heart_rate_records = hrRead.recordCount;
    recordCounts.heart_rate_samples = hrRead.rawPoints.length;
  }

  const hrByDay = readHr
    ? bucketHeartRateByLocalDay(
        hrRead.rawPoints.map(p => ({
          timestamp: new Date(p.timeMs).toISOString(),
          bpm: p.bpm,
          source: 'health_connect' as const,
        })),
        localDateKey,
      )
    : new Map<string, Array<{time: string; bpm: number}>>();

  type HcRecordBatch = {records: Array<Record<string, unknown>>};
  const emptyBatch = (): HcRecordBatch => ({records: []});
  let stepsResult = emptyBatch();
  let activeResult = emptyBatch();
  let totalResult = emptyBatch();
  let sleepResult = emptyBatch();
  let workoutSessions = emptyBatch();

  const reads: Promise<void>[] = [];
  if (readSteps) {
    reads.push(readRecords('Steps', {timeRangeFilter: filter}).then(r => { stepsResult = r; }));
  }
  if (readCalories) {
    reads.push(
      readRecords('ActiveCaloriesBurned', {timeRangeFilter: filter}).then(r => { activeResult = r; }),
      readRecords('TotalCaloriesBurned', {timeRangeFilter: filter}).then(r => { totalResult = r; }),
    );
  }
  if (readSleep) {
    reads.push(readRecords('SleepSession', {timeRangeFilter: filter}).then(r => { sleepResult = r; }));
  }
  if (readWorkoutsType) {
    reads.push(readRecords('ExerciseSession', {timeRangeFilter: filter}).then(r => { workoutSessions = r; }));
  }
  await Promise.all(reads);

  const stepsByDay = new Map<string, number>();
  if (readSteps) {
    recordCounts.steps = stepsResult.records.length;
    for (const row of stepsResult.records as Array<{
      startTime: string;
      endTime: string;
      count?: number;
      metadata?: {id?: string};
    }>) {
      const day = localDateKey(row.startTime);
      stepsByDay.set(day, (stepsByDay.get(day) ?? 0) + (row.count ?? 0));
      trackOrigin(originMaps.steps, day, row.metadata);
      records.push({
        recordType: 'steps',
        provider: extractDataOrigin(row.metadata),
        startTime: row.startTime,
        endTime: row.endTime,
        metadataId: row.metadata?.id,
        payload: {count: row.count ?? 0, day},
      });
    }
  }

  const activeByDay = new Map<string, number>();
  if (readCalories) {
    recordCounts.active_calories = activeResult.records.length;
    for (const row of activeResult.records as Array<{
      startTime: string;
      endTime: string;
      energy?: unknown;
      metadata?: {id?: string};
    }>) {
      const day = localDateKey(row.startTime);
      const kcal = energyToKcal(row.energy);
      activeByDay.set(day, (activeByDay.get(day) ?? 0) + kcal);
      trackOrigin(originMaps.active_calories, day, row.metadata);
      records.push({
        recordType: 'calories_active',
        provider: extractDataOrigin(row.metadata),
        startTime: row.startTime,
        endTime: row.endTime,
        metadataId: row.metadata?.id,
        payload: {kcal, day},
      });
    }
  }

  const totalByDay = new Map<string, number>();
  if (readCalories) {
    recordCounts.total_calories = totalResult.records.length;
    for (const row of totalResult.records as Array<{
      startTime: string;
      endTime: string;
      energy?: unknown;
      metadata?: {id?: string};
    }>) {
      const day = localDateKey(row.startTime);
      const kcal = energyToKcal(row.energy);
      totalByDay.set(day, (totalByDay.get(day) ?? 0) + kcal);
      trackOrigin(originMaps.total_calories, day, row.metadata);
      records.push({
        recordType: 'calories_total',
        provider: extractDataOrigin(row.metadata),
        startTime: row.startTime,
        endTime: row.endTime,
        metadataId: row.metadata?.id,
        payload: {kcal, day},
      });
    }
  }

  const sleepSessions: HealthConnectSleepPayload[] = [];
  if (readSleep) {
    recordCounts.sleep = sleepResult.records.length;
    for (const session of sleepResult.records as Array<{
      startTime: string;
      endTime: string;
      stages?: SleepSessionRecord['stages'];
      metadata?: {id?: string};
    }>) {
      trackOrigin(originMaps.sleep, localDateKey(session.endTime), session.metadata);
      const stages = sumSleepStages(session.stages);
      const sleepPayload: HealthConnectSleepPayload = {
        start_time: session.startTime,
        end_time: session.endTime,
        duration_seconds: durationSec(session.startTime, session.endTime),
        ...stages,
        external_id: session.metadata?.id,
      };
      sleepSessions.push(sleepPayload);
      records.push({
        recordType: 'sleep',
        provider: extractDataOrigin(session.metadata),
        startTime: session.startTime,
        endTime: session.endTime,
        metadataId: session.metadata?.id,
        payload: sleepPayload,
      });
    }
  }

  if (readWorkoutsType) {
    recordCounts.workouts = workoutSessions.records.length;
    for (const session of workoutSessions.records as Array<{endTime: string; metadata?: unknown}>) {
      trackOrigin(originMaps.workouts, localDateKey(session.endTime), session.metadata);
    }
  }

  const workouts = readWorkoutsType
    ? await readWorkoutsInRange(start, end, hrRead.rawPoints)
    : [];

  if (readWorkoutsType) {
    for (const workout of workouts) {
      records.push({
        recordType: 'workout',
        provider: undefined,
        startTime: workout.start_time,
        endTime: workout.end_time,
        metadataId: workout.external_id,
        payload: workout,
      });
    }
  }

  if (readHr) {
    for (const [date, samples] of hrByDay) {
      if (samples.length) {
        records.push({
          recordType: 'heart_rate',
          provider: undefined,
          startTime: samples[0].time,
          endTime: samples[samples.length - 1].time,
          payload: {date, samples},
        });
      }
    }
  }

  for (const [field, counts] of Object.entries(originMaps) as Array<
    [keyof HealthConnectDayProviders, Map<string, Map<string, number>>]
  >) {
    providersFromCounts(counts, field, providersByDay);
  }

  const days = new Set<string>([
    ...stepsByDay.keys(),
    ...activeByDay.keys(),
    ...totalByDay.keys(),
    ...hrByDay.keys(),
    ...workouts.map(w => w.date ?? localDateKey(w.end_time)),
    ...sleepSessions.map(s => localDateKey(s.end_time)),
  ]);

  const byDate = new Map<string, HealthConnectDayPayload>();

  const ensure = (date: string): HealthConnectDayPayload => {
    let row = byDate.get(date);
    if (!row) {
      row = {date};
      byDate.set(date, row);
    }
    return row;
  };

  for (const [date, steps] of stepsByDay) {
    ensure(date).steps = steps;
  }
  for (const [date, kcal] of activeByDay) {
    ensure(date).active_calories = Math.round(kcal);
  }
  for (const [date, kcal] of totalByDay) {
    ensure(date).total_calories = Math.round(kcal);
  }

  for (const [date, samples] of hrByDay) {
    if (samples.length) {
      ensure(date).heart_rate_samples = samples;
    }
  }

  for (const sleep of sleepSessions) {
    const date = localDateKey(sleep.end_time);
    ensure(date).sleep = sleep;
  }

  for (const workout of workouts) {
    const date = workout.date ?? localDateKey(workout.end_time);
    const row = ensure(date);
    row.workouts = [...(row.workouts ?? []), workout];
  }

  for (const d of days) {
    ensure(d);
  }

  return {
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    providersByDay,
    recordCounts,
    records,
  };
}

/** Собрать дневные пакеты для отправки на FastAPI. */
export async function collectHealthDataForRange(
  start: Date,
  end: Date,
): Promise<HealthConnectDayPayload[]> {
  const result = await collectHealthDataForRangeWithProviders(start, end);
  return result.days;
}

/** Алиасы для поэтапной интеграции (чтение по типам записей). */
export const syncSteps = readStepsInRange;
export const syncActiveCalories = readActiveCaloriesInRange;
export const syncTotalCalories = readTotalCaloriesInRange;
export const syncSleep = readSleepInRange;
export const syncWeight = readWeightInRange;
export const syncWorkouts = readWorkoutsInRange;
