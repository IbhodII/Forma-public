import type {AuthSession} from '../api/auth';
import type {StoredSession} from './session';
import {isLocalFirstMode} from '../mode/operatingMode';

export type SessionBootstrapResult =
  | {action: 'restore_local'; session: StoredSession}
  | {action: 'apply_server'; auth: AuthSession}
  | {action: 'keep_offline'; session: StoredSession};

function isLocalHcTestSession(session: StoredSession): boolean {
  return session.operatingMode === 'local_hc_test' || session.appMode === 'local_hc_test';
}

/** Pure bootstrap decision used by AuthProvider on cold start. */
export async function bootstrapStoredSession(
  storedSession: StoredSession,
  fetchMe: () => Promise<AuthSession>,
): Promise<SessionBootstrapResult> {
  if (isLocalHcTestSession(storedSession) || isLocalFirstMode(storedSession)) {
    return {action: 'restore_local', session: storedSession};
  }

  try {
    const me = await fetchMe();
    return {action: 'apply_server', auth: me};
  } catch {
    return {action: 'keep_offline', session: storedSession};
  }
}
