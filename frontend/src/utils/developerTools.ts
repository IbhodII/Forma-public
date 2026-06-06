export const DEVELOPER_TOOLS_STORAGE_KEY = "health-dashboard-developer-tools";

export function readDeveloperToolsEnabled(): boolean {
  try {
    return localStorage.getItem(DEVELOPER_TOOLS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDeveloperToolsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DEVELOPER_TOOLS_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("developer-tools-changed", { detail: enabled }));
}
