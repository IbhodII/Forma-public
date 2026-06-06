import {apiFetch} from './client';
import type {StepsHistoryResponse} from '../types/body';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchStepsHistory(params?: {date_from?: string; date_to?: string}) {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set('date_from', params.date_from);
  if (params?.date_to) sp.set('date_to', params.date_to);
  const suffix = sp.toString() ? `?${sp.toString()}` : '';
  const res = await apiFetch(`/api/steps/history${suffix}`);
  return jsonOrThrow<StepsHistoryResponse>(res);
}
