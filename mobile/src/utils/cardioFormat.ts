import type {CardioWorkout} from '../types/cardio';

const CARDIO_POOL = 'бассейн';
const CARDIO_BIKE = 'вело';
const CARDIO_RUN = 'бег';

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) {
    return '—';
  }
  if (km < 1) {
    return `${Math.round(km * 1000)} м`;
  }
  return `${km.toFixed(2)} км`;
}

export function formatPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')} /км`;
}

export function formatPace100m(secPer100m: number): string {
  const m = Math.floor(secPer100m / 60);
  const s = Math.round(secPer100m % 60);
  return `${m}:${String(s).padStart(2, '0')} /100м`;
}

export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} км/ч`;
}

export function formatSwimSpeed(kmh: number): string {
  const sec100 = 360 / kmh;
  return formatPace100m(sec100);
}

export function formatEnergy(kcal: number): string {
  return `${Math.round(kcal)} ккал`;
}

function paceMinPerKm(distanceKm: number, durationSec: number): number | null {
  if (distanceKm <= 0 || durationSec <= 0) {
    return null;
  }
  return durationSec / 60 / distanceKm;
}

function paceSecPer100m(
  distanceKm: number,
  durationSec: number,
  stored?: number | null,
): number | null {
  if (stored != null && stored > 0) {
    return stored;
  }
  const distM = distanceKm * 1000;
  if (distM <= 0 || durationSec <= 0) {
    return null;
  }
  return (durationSec / distM) * 100;
}

function avgSpeedKmh(workout: CardioWorkout): number | null {
  if (workout.avg_speed_kmh != null && workout.avg_speed_kmh > 0) {
    return workout.avg_speed_kmh;
  }
  if (workout.distance_km > 0 && workout.duration_sec > 0) {
    return (workout.distance_km / workout.duration_sec) * 3600;
  }
  return null;
}

export type CardioMetric = {label: string; value: string};

export function buildCardioMetrics(workout: CardioWorkout): CardioMetric[] {
  const isPool = workout.type === CARDIO_POOL;
  const isBike = workout.type === CARDIO_BIKE;
  const isRun = workout.type === CARDIO_RUN;
  const spd = avgSpeedKmh(workout);
  const maxSpd =
    workout.max_speed_kmh != null && workout.max_speed_kmh > 0
      ? workout.max_speed_kmh
      : null;
  const paceKm = paceMinPerKm(workout.distance_km, workout.duration_sec);
  const pace100 = paceSecPer100m(
    workout.distance_km,
    workout.duration_sec,
    workout.pace_sec_100m,
  );
  const cadence =
    workout.avg_cadence != null && workout.avg_cadence > 0
      ? `${Math.round(workout.avg_cadence)} об/мин`
      : '—';

  const metrics: CardioMetric[] = [
    {label: 'Дистанция', value: formatDistance(workout.distance_km)},
    {label: 'Время', value: formatDuration(workout.duration_sec)},
  ];

  if (isPool) {
    metrics.push({label: 'Темп', value: pace100 != null ? formatPace100m(pace100) : '—'});
    if (spd != null) {
      metrics.push({label: 'Средняя скорость', value: formatSwimSpeed(spd)});
    }
    if (workout.swolf != null) {
      metrics.push({label: 'SWOLF', value: String(workout.swolf)});
    }
    if (workout.calories_watch != null) {
      metrics.push({label: 'Ккал (часы)', value: formatEnergy(workout.calories_watch)});
    }
  } else if (isRun) {
    metrics.push({label: 'Темп', value: paceKm != null ? formatPace(paceKm) : '—'});
    if (spd != null) {
      metrics.push({label: 'Средняя скорость', value: formatSpeed(spd)});
    }
    if (maxSpd != null) {
      metrics.push({label: 'Макс. скорость', value: formatSpeed(maxSpd)});
    }
    metrics.push({
      label: 'Средний пульс',
      value: workout.avg_hr ? `${workout.avg_hr} уд/мин` : '—',
    });
    metrics.push({
      label: 'Макс. пульс',
      value: workout.max_hr ? `${workout.max_hr} уд/мин` : '—',
    });
    if (workout.calories_watch != null) {
      metrics.push({label: 'Ккал (часы)', value: formatEnergy(workout.calories_watch)});
    }
    if (workout.calories_chest != null) {
      metrics.push({label: 'Ккал (пульсометр)', value: formatEnergy(workout.calories_chest)});
    }
  } else {
    metrics.push({
      label: 'Средний пульс',
      value: workout.avg_hr ? `${workout.avg_hr} уд/мин` : '—',
    });
    metrics.push({
      label: 'Макс. пульс',
      value: workout.max_hr ? `${workout.max_hr} уд/мин` : '—',
    });
    metrics.push({label: 'Средняя скорость', value: spd != null ? formatSpeed(spd) : '—'});
    if (maxSpd != null) {
      metrics.push({label: 'Макс. скорость', value: formatSpeed(maxSpd)});
    }
    if (isBike) {
      metrics.push({label: 'Каденс', value: cadence});
    }
    if (workout.calories_chest != null) {
      metrics.push({label: 'Ккал (пульсометр)', value: formatEnergy(workout.calories_chest)});
    }
    if (workout.calories_watch != null) {
      metrics.push({label: 'Ккал (часы)', value: formatEnergy(workout.calories_watch)});
    }
  }

  if (workout.start_time) {
    metrics.push({label: 'Старт', value: workout.start_time.slice(0, 16)});
  }
  if (workout.data_source) {
    metrics.push({label: 'Источник', value: workout.data_source});
  }

  return metrics;
}

export function cardioTypeLabel(type: string): string {
  if (type === CARDIO_RUN) {
    return 'Бег';
  }
  if (type === CARDIO_BIKE) {
    return 'Велосипед';
  }
  if (type === CARDIO_POOL) {
    return 'Бассейн';
  }
  return type;
}
