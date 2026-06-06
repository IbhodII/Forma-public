/** Client-side validation (mirrors backend rules) */

import { formatApiErrorDetail, normalizeErrorDetail } from "../modules/nutrition/forecast/formatDeficitAlert";
import { localTodayIso } from "./format";

export function getApiStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "response" in err) {
    return (err as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

export type ApiErrorDetail = {
  message?: string;
  deficit_status?: "safe" | "warning" | "danger";
  recommended_additional_calories?: number;
};

export function getApiErrorDetail(err: unknown): ApiErrorDetail | null {
  if (typeof err === "object" && err !== null && "response" in err) {
    const ax = err as { response?: { data?: { detail?: unknown } } };
    const detail = ax.response?.data?.detail;
    if (typeof detail === "object" && detail !== null && "message" in detail) {
      return detail as ApiErrorDetail;
    }
  }
  return null;
}

type AxiosLikeError = {
  message?: string;
  code?: string;
  config?: { method?: string; baseURL?: string; url?: string };
  response?: { status?: number; data?: { detail?: unknown } };
};

function formatAxiosNetworkError(err: AxiosLikeError): string {
  const method = (err.config?.method ?? "GET").toUpperCase();
  const path = err.config?.url ?? "";
  const base = err.config?.baseURL ?? "";
  const endpoint = `${base}${path}`.replace(/([^:]\/)\/+/g, "$1");
  const code = err.code ? ` (${err.code})` : "";
  const hint =
    " Проверьте, что API запущен (uvicorn) и порт совпадает с .api-port / VITE_API_PORT.";
  return `Сеть: ${method} ${endpoint || "API"} — ${err.message ?? "Network Error"}${code}.${hint}`;
}

function formatAxiosHttpError(err: AxiosLikeError): string | null {
  const status = err.response?.status;
  if (status == null) return null;
  const detail = err.response?.data?.detail;
  const method = (err.config?.method ?? "GET").toUpperCase();
  const path = err.config?.url ?? "";
  let body = "";
  if (typeof detail === "string") {
    body = detail;
  } else if (detail != null && typeof detail === "object" && "message" in detail) {
    const msg = (detail as { message?: unknown }).message;
    body = typeof msg === "string" ? msg : String(msg ?? "");
  } else if (detail != null) {
    try {
      body = JSON.stringify(detail);
    } catch {
      body = String(detail);
    }
  }
  const prefix = `HTTP ${status} ${method} ${path}`;
  return body ? `${prefix}: ${body}` : prefix;
}

export function parseApiError(err: unknown): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const ax = err as AxiosLikeError;
    if (!ax.response) {
      return formatAxiosNetworkError(ax);
    }
    const httpMsg = formatAxiosHttpError(ax);
    if (httpMsg) return httpMsg;
  }

  const detail = extractAxiosDetail(err);
  if (detail != null) {
    const fromDetail = formatApiErrorDetail(detail);
    if (fromDetail) return fromDetail;
  }

  const structured = getApiErrorDetail(err);
  if (structured?.message && typeof structured.message === "string") {
    return structured.message;
  }

  if (err instanceof Error) {
    const msg = err.message;
    const fromMsg = normalizeErrorDetail(msg);
    if (fromMsg) {
      const formatted = formatApiErrorDetail(fromMsg);
      if (formatted) return formatted;
    }
    if (msg && !msg.startsWith("[object ") && !msg.includes("deficit_status:") && !msg.startsWith("{")) {
      return msg;
    }
  }
  return "Неизвестная ошибка";
}

function extractAxiosDetail(err: unknown): unknown {
  if (typeof err === "object" && err !== null && "response" in err) {
    const ax = err as { response?: { data?: { detail?: unknown; errors?: unknown[] } } };
    const data = ax.response?.data;
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      const first = data.detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (data?.detail != null) return data.detail;
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const first = data.errors[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  return null;
}

export function validateNotFuture(date: string): string | null {
  const d = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Дата в формате YYYY-MM-DD";
  if (d > localTodayIso()) return "Дата не может быть в будущем";
  return null;
}

export function validateNonNegative(value: number | "", label: string): string | null {
  if (value === "") return null;
  if (Number(value) < 0) return `${label} не может быть отрицательным`;
  return null;
}

export function validatePositive(value: number | "", label: string): string | null {
  if (value === "") return null;
  if (Number(value) <= 0) return `${label} должен быть > 0`;
  return null;
}

export function parseRepsList(input: string): { ok: true; reps: number[] } | { ok: false; error: string } {
  const parts = input
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { ok: false, error: "Укажите повторения (через запятую)" };
  const reps: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Все повторения должны быть целыми > 0" };
    reps.push(n);
  }
  return { ok: true, reps };
}
