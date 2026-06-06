/** Desktop session в localStorage (Electron userData / браузер). */
const USER_ID_KEY = "mhd_user_id";
const USER_EMAIL_KEY = "mhd_user_email";
const CLOUD_PROVIDER_KEY = "mhd_cloud_provider";

export type StoredSession = {
  userId: number;
  email?: string | null;
  cloudProvider?: string | null;
};

export function getStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(USER_ID_KEY);
  if (!raw) return null;
  const userId = Number(raw);
  if (!Number.isFinite(userId) || userId < 1) return null;
  return {
    userId,
    email: localStorage.getItem(USER_EMAIL_KEY),
    cloudProvider: localStorage.getItem(CLOUD_PROVIDER_KEY),
  };
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(USER_ID_KEY, String(session.userId));
  if (session.email) {
    localStorage.setItem(USER_EMAIL_KEY, session.email);
  } else {
    localStorage.removeItem(USER_EMAIL_KEY);
  }
  if (session.cloudProvider) {
    localStorage.setItem(CLOUD_PROVIDER_KEY, session.cloudProvider);
  } else {
    localStorage.removeItem(CLOUD_PROVIDER_KEY);
  }
}

export function clearSession(): void {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
  localStorage.removeItem(CLOUD_PROVIDER_KEY);
}

export function getUserIdHeader(): string | null {
  const session = getStoredSession();
  return session ? String(session.userId) : null;
}
