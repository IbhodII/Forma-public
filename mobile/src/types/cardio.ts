export type CardioType = 'бег' | 'вело' | 'бассейн';

export interface CardioWorkout {
  id: number;
  date: string;
  type: CardioType | string;
  distance_km: number;
  duration_sec: number;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  calories_chest: number | null;
  calories_watch: number | null;
  avg_cadence?: number | null;
  start_time?: string | null;
  pace_min_km?: number | null;
  pace_sec_100m?: number | null;
  avg_speed_kmh?: number | null;
  max_speed_kmh?: number | null;
  swolf?: number | null;
  avg_power_watts?: number | null;
  estimated_avg_power_watts?: number | null;
  power_source?: 'real' | 'estimated' | null;
  data_source?: string | null;
}

export interface CardioWorkoutCreate {
  date: string;
  type: CardioType;
  distance_km: number;
  duration_min: number;
  duration_sec?: number;
  avg_hr?: number | null;
  max_hr?: number | null;
  calories_chest?: number | null;
  calories_watch?: number | null;
  swolf?: number | null;
}

export interface CardioPaginated {
  items: CardioWorkout[];
  meta: {total: number; limit: number; offset: number};
}

export interface CardioTypeSetting {
  type: string;
  is_active: number;
  workout_count: number;
}

export interface HeartRatePoint {
  seconds: number;
  heart_rate: number;
  elapsed_sec?: number;
  distance_m?: number | null;
}

export interface HeartRateResponse {
  workout_id: number;
  points: HeartRatePoint[];
}

export interface CardioAvailabilityItem {
  id: number;
  has_hr: boolean;
  has_gps: boolean;
  has_sensors: boolean;
}

export interface CardioAvailability {
  heart_rate_ids: number[];
  gps_ids: number[];
  sensor_ids: number[];
  items?: CardioAvailabilityItem[];
}

export interface WorkoutSensors {
  workout_id: number;
  start_time?: string | null;
  elapsed_sec: number[];
  speed_kmh: (number | null)[];
  cadence: (number | null)[];
  elevation_m: (number | null)[];
  temperature_c: (number | null)[];
  distance_m: (number | null)[];
  heart_rate: (number | null)[];
  has_cadence: boolean;
  has_elevation: boolean;
  has_temperature: boolean;
  has_speed: boolean;
}

export interface WorkoutPointsResponse {
  workout_id: number;
  points: {
    lat: number;
    lon: number;
    elapsed_sec: number;
    speed_kmh?: number | null;
    cadence?: number | null;
    elevation_m?: number | null;
    temperature_c?: number | null;
    heart_rate?: number | null;
    distance_m?: number | null;
  }[];
}

export interface WorkoutPowerResponse {
  workout_id: number;
  has_real: boolean;
  has_estimated: boolean;
  avg_power: number | null;
  source: 'real' | 'estimated' | null;
  series: {elapsed_sec: number; power_watts: number}[];
}
