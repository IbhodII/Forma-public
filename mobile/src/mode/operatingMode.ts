import type {StoredSession} from '../auth/session';

/** Product operating modes (see docs/АВТОНОМНОЕ_ПРИЛОЖЕНИЕ_ANDROID.md). */
export type OperatingMode = 'autonomous' | 'cloud' | 'legacy_api' | 'local_hc_test';

/** User-facing labels (Russian). In React UI prefer `useT('modes.*')`. */
const MODE_LABELS_RU: Record<OperatingMode, string> = {
  autonomous: 'На устройстве',
  cloud: 'Облако',
  legacy_api: 'С компьютером',
  local_hc_test: 'Проверка Health Connect',
};

export function normalizeOperatingMode(
  raw: string | null | undefined,
  legacyAppMode?: string | null,
): OperatingMode {
  if (raw === 'autonomous' || raw === 'cloud' || raw === 'legacy_api' || raw === 'local_hc_test') {
    return raw;
  }
  if (legacyAppMode === 'local_hc_test') {
    return 'local_hc_test';
  }
  return 'legacy_api';
}

export function operatingModeFromSession(
  session: StoredSession | null | undefined,
): OperatingMode {
  if (!session) {
    return 'legacy_api';
  }
  if (session.operatingMode) {
    return session.operatingMode;
  }
  if (session.appMode === 'local_hc_test') {
    return 'local_hc_test';
  }
  return 'legacy_api';
}

export function isLocalHcTestMode(session: StoredSession | null | undefined): boolean {
  return operatingModeFromSession(session) === 'local_hc_test';
}

export function isLegacyApiMode(session: StoredSession | null | undefined): boolean {
  return operatingModeFromSession(session) === 'legacy_api';
}

export function isAutonomousMode(session: StoredSession | null | undefined): boolean {
  return operatingModeFromSession(session) === 'autonomous';
}

export function isCloudMode(session: StoredSession | null | undefined): boolean {
  return operatingModeFromSession(session) === 'cloud';
}

export function isLocalFirstMode(session: StoredSession | null | undefined): boolean {
  const mode = operatingModeFromSession(session);
  return mode === 'autonomous' || mode === 'cloud';
}

export function requiresPcApi(mode: OperatingMode): boolean {
  return mode === 'legacy_api';
}

/** Whether Home/analytics should avoid PC API calls. */
export function shouldSkipPcApi(mode: OperatingMode, pcApiReachable: boolean): boolean {
  if (mode === 'autonomous' || mode === 'local_hc_test') {
    return true;
  }
  if (mode === 'cloud') {
    return !pcApiReachable;
  }
  return !pcApiReachable;
}

export function allowsLocalOnly(mode: OperatingMode): boolean {
  return mode === 'autonomous' || mode === 'cloud' || mode === 'local_hc_test';
}

export function modeLabel(mode: OperatingMode): string {
  return MODE_LABELS_RU[mode];
}

/** Single-user device scope for SQLite (autonomous/cloud). Cloud identity uses yandexUid separately. */
export const LOCAL_DEVICE_USER_ID = 1;

export function usesStableLocalDbUserId(mode: OperatingMode): boolean {
  return mode === 'autonomous' || mode === 'cloud' || mode === 'local_hc_test';
}

/** Session / API user id for a mode (legacy keeps server-assigned id). */
export function sessionUserIdForMode(
  mode: OperatingMode,
  serverOrLegacyUserId: number,
): number {
  return usesStableLocalDbUserId(mode) ? LOCAL_DEVICE_USER_ID : serverOrLegacyUserId;
}

/** Stable local user id from Yandex uid (legacy — prefer sessionUserIdForMode for DB). */
export function userIdFromYandexUid(yandexUid: string): number {
  let hash = 0;
  for (let i = 0; i < yandexUid.length; i++) {
    hash = (Math.imul(31, hash) + yandexUid.charCodeAt(i)) >>> 0;
  }
  return (hash % 900_000) + 100_000;
}

export function maskYandexUid(uid: string | null | undefined): string {
  if (!uid) {
    return '—';
  }
  if (uid.length <= 6) {
    return uid;
  }
  return `${uid.slice(0, 3)}…${uid.slice(-3)}`;
}
