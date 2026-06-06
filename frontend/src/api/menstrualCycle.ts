import { apiClient } from "./client";
import type { CycleImpact, CyclePhase, CyclePhaseDay } from "../shared/menstrualCyclePhases";

export type FlowIntensity = "light" | "medium" | "heavy";

export interface MenstrualCycleLogEntry {
  date: string;
  flow_intensity: FlowIntensity | null;
  symptoms: string | null;
  notes: string | null;
  phase?: CyclePhase | null;
}

export interface MenstrualCycleSettings {
  cycle_length_days: number;
  period_length_days: number;
  last_period_start: string | null;
  last_menstruation?: string | null;
  cycle_length?: number;
  menstruation_length?: number;
  cycle_enabled?: boolean;
}

export async function fetchMenstrualCycleSettings() {
  const { data } = await apiClient.get<MenstrualCycleSettings>("/menstrual-cycle/settings");
  return data;
}

export async function saveMenstrualCycleSettings(body: {
  cycle_length_days: number;
  period_length_days: number;
  last_period_start: string | null;
  cycle_enabled?: boolean;
}) {
  const { data } = await apiClient.post<MenstrualCycleSettings>("/menstrual-cycle/settings", body);
  return data;
}

export async function fetchMenstrualCycleLog(params: { from?: string; to?: string }) {
  const { data } = await apiClient.get<MenstrualCycleLogEntry[]>("/menstrual-cycle/log", {
    params: { from: params.from, to: params.to },
  });
  return data;
}

export async function fetchMenstrualCyclePhases(from: string, to: string) {
  const { data } = await apiClient.get<CyclePhaseDay[]>("/menstrual-cycle/phases", {
    params: { from, to },
  });
  return data;
}

export async function fetchMenstrualCycleImpact(day?: string) {
  const { data } = await apiClient.get<CycleImpact>("/menstrual-cycle/impact", {
    params: day ? { day } : undefined,
  });
  return data;
}

export async function upsertMenstrualCycleLog(body: {
  date: string;
  flow_intensity?: FlowIntensity | null;
  symptoms?: string | null;
  notes?: string | null;
  phase?: CyclePhase | null;
}) {
  const { data } = await apiClient.post<MenstrualCycleLogEntry>("/menstrual-cycle/log", body);
  return data;
}

export async function deleteMenstrualCycleLog(date: string) {
  await apiClient.delete(`/menstrual-cycle/log/${encodeURIComponent(date)}`);
}
