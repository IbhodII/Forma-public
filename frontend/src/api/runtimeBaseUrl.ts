export function resolveApiBaseUrl(): string {
  const envBase = import.meta.env.VITE_API_URL?.trim();
  if (envBase) return envBase;

  const desktopBase = window.desktopApp?.apiBaseUrl?.trim();
  if (desktopBase) return desktopBase;

  return "/api";
}

/** Origin API без суффикса /api — для redirect_base в OAuth. */
export function resolveApiOrigin(): string | null {
  const base = resolveApiBaseUrl().trim();
  if (!base || base === "/api") {
    if (typeof window !== "undefined" && window.location?.origin?.startsWith("http")) {
      return window.location.origin;
    }
    const port = import.meta.env.VITE_API_PORT?.trim() || "8000";
    return `http://127.0.0.1:${port}`;
  }
  const normalized = base.replace(/\/+$/, "");
  if (normalized.endsWith("/api")) {
    return normalized.slice(0, -4);
  }
  try {
    const url = new URL(normalized.startsWith("http") ? normalized : `http://${normalized}`);
    return url.origin;
  } catch {
    return null;
  }
}
