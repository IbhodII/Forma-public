import {getUserId} from '../api/client';
import {listDayMetricsInRange} from '../database/hcStore';
import {executeSql, initDB} from '../database';
import {toDateRange} from '../components/analytics/utils';

export {toDateRange};
import type {DailyFacts} from '../analytics-engine';

type StrengthByDate = {
  volumeKg: number;
  maxWeight: number;
  sessions: number;
  exerciseWeights: Record<string, number>;
  exercise1rm: Record<string, number>;
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

export async function getDailyFactsInRange(from: string, to: string): Promise<DailyFacts[]> {
  const [hcRows, strengthByDay] = await Promise.all([
    listDayMetricsInRange(from, to),
    loadStrengthByDate(from, to),
  ]);

  const byDay = new Map(hcRows.map(row => [row.date, row]));
  const out: DailyFacts[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const hc = byDay.get(day);
    const payload = hc?.payload;
    const hrPoints = payload?.heart_rate_samples ?? [];
    const avgHr =
      hrPoints.length > 0
        ? hrPoints.reduce((acc, p) => acc + Number(p.bpm || 0), 0) / hrPoints.length
        : null;
    const restHr = hrPoints.length > 0 ? Math.min(...hrPoints.map(p => Number(p.bpm || 999))) : null;
    const workouts = payload?.workouts ?? [];
    const workoutCalories = Math.round(
      workouts.reduce((acc, w) => acc + Number(w.calories_kcal || 0), 0),
    );
    const trimp = Math.round(
      workouts.reduce((acc, w) => {
        const mins = Number(w.duration_sec || 0) / 60;
        const hrFactor = w.avg_hr && w.avg_hr > 0 ? Math.max(0.8, Math.min(2.2, w.avg_hr / 120)) : 1;
        return acc + mins * hrFactor;
      }, 0) + Number(payload?.steps || 0) / 2000,
    );
    const strength = strengthByDay.get(day);
    out.push({
      date: day,
      steps: Math.round(Number(payload?.steps || 0)),
      activeCalories: Math.round(Number(payload?.active_calories || 0)),
      totalCalories: Math.round(Number(payload?.total_calories || 0)),
      workoutCalories,
      sleepHours:
        payload?.sleep && Number(payload.sleep.total_seconds || 0) > 0
          ? Number(payload.sleep.total_seconds || 0) / 3600
          : null,
      restingHr: restHr != null && Number.isFinite(restHr) ? restHr : null,
      avgHr: avgHr != null && Number.isFinite(avgHr) ? avgHr : null,
      hrSamples: hrPoints.length,
      workouts: workouts.length + (strength?.sessions ?? 0),
      trimp,
      strengthVolumeKg: strength?.volumeKg ?? 0,
      maxStrengthWeight: strength?.maxWeight ?? 0,
    });
  }
  return out;
}

export async function hasAnyAnalyticsDataInRange(from: string, to: string): Promise<boolean> {
  await initDB();
  const uid = (await getUserId()) ?? '0';

  const [hcCount, workoutCount] = await Promise.all([
    executeSql(
      `SELECT COUNT(1) AS c FROM hc_day_metrics
       WHERE date >= ? AND date <= ?`,
      [from, to],
    ),
    executeSql(
      `SELECT COUNT(1) AS c FROM workouts
       WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL OR user_id = '')`,
      [from, to, uid],
    ),
  ]);

  const hcRows = Number(hcCount.rows.item(0)?.c || 0);
  const workoutRows = Number(workoutCount.rows.item(0)?.c || 0);
  return hcRows > 0 || workoutRows > 0;
}

export async function getStrengthDerivedRange(from: string, to: string): Promise<Map<string, StrengthByDate>> {
  return loadStrengthByDate(from, to);
}

async function loadStrengthByDate(from: string, to: string): Promise<Map<string, StrengthByDate>> {
  const uid = (await getUserId()) ?? '0';
  const rs = await executeSql(
    `SELECT date, sets_json FROM workouts
     WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL OR user_id = '')
     ORDER BY date ASC`,
    [from, to, uid],
  );

  const out = new Map<string, StrengthByDate>();
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i) as {date: string; sets_json: string};
    const date = row.date;
    const parsed = JSON.parse(row.sets_json || '{}') as {
      sets?: Array<{exercise: string; weight?: number | null; reps?: number | null}>;
      exercises?: Array<{exercise: string; weight?: number | null; reps_list: number[]}>;
    };
    const slot =
      out.get(date) ??
      ({
        volumeKg: 0,
        maxWeight: 0,
        sessions: 0,
        exerciseWeights: {},
        exercise1rm: {},
      } satisfies StrengthByDate);

    slot.sessions += 1;
    const addSet = (exercise: string, weight: number, reps: number) => {
      const w = Number(weight || 0);
      const r = Number(reps || 0);
      if (w <= 0 || r <= 0) {
        return;
      }
      slot.volumeKg += w * r;
      slot.maxWeight = Math.max(slot.maxWeight, w);
      slot.exerciseWeights[exercise] = Math.max(slot.exerciseWeights[exercise] ?? 0, w);
      const epley = w * (1 + r / 30);
      slot.exercise1rm[exercise] = Math.max(slot.exercise1rm[exercise] ?? 0, epley);
    };

    for (const s of parsed.sets ?? []) {
      addSet(String(s.exercise || 'Упражнение'), Number(s.weight || 0), Number(s.reps || 0));
    }
    for (const ex of parsed.exercises ?? []) {
      for (const reps of ex.reps_list ?? []) {
        addSet(String(ex.exercise || 'Упражнение'), Number(ex.weight || 0), Number(reps || 0));
      }
    }
    out.set(date, slot);
  }
  return out;
}

export async function ensureAnalyticsCacheTable(): Promise<void> {
  await executeSql(
    `CREATE TABLE IF NOT EXISTS analytics_daily_cache (
      date TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
}

export async function saveAnalyticsCache(rows: DailyFacts[]): Promise<void> {
  await ensureAnalyticsCacheTable();
  const now = new Date().toISOString();
  for (const row of rows) {
    await executeSql(
      'INSERT OR REPLACE INTO analytics_daily_cache (date, payload_json, updated_at) VALUES (?, ?, ?)',
      [row.date, JSON.stringify(row), now],
    );
  }
}
