import {
  queryCaloriesAnalytics,
  queryCardioTrimp,
  queryCtlAtlTsb,
  queryZoneTime,
} from '../analytics/analyticsQuery';

export interface CtlAtlTsbPoint {
  date: string;
  trimp: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface CtlAtlTsbResponse {
  items: CtlAtlTsbPoint[];
  current: {
    ctl?: number | null;
    atl?: number | null;
    tsb?: number | null;
    trimp?: number | null;
    last_workout_date?: string | null;
  };
}

export interface DailyTrimpPoint {
  date: string;
  trimp: number;
}

export interface DailyTrimpResponse {
  items: DailyTrimpPoint[];
}

export interface CaloriesAnalyticsPoint {
  date: string;
  strength_kcal: number;
  cardio_kcal: number;
  total_kcal: number;
}

export interface CaloriesAnalyticsResponse {
  items: CaloriesAnalyticsPoint[];
}

export interface ZoneTimeItem {
  zone_id: string;
  name: string;
  seconds: number;
  minutes: number;
  percent: number;
}

export interface ZoneTimeResponse {
  items: ZoneTimeItem[];
  total_seconds: number;
}

export const fetchCtlAtlTsb = queryCtlAtlTsb;
export const fetchCardioTrimp = queryCardioTrimp;
export const fetchCaloriesAnalytics = queryCaloriesAnalytics;
export const fetchZoneTime = queryZoneTime;
