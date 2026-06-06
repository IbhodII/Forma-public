import { resolveClientMode } from "../config/clientCapabilities";
import { readDeveloperToolsEnabled } from "./developerTools";

/** Desktop release UI without dev captions unless developer tools are on. */
export function showDevCaptions(): boolean {
  return resolveClientMode() === "admin_browser" || readDeveloperToolsEnabled();
}

/** User-facing page subtitle; dev-only text hidden in packaged desktop. */
export function pageHeaderDescription(userText?: string, devText?: string): string | undefined {
  if (showDevCaptions()) return devText ?? userText;
  return userText;
}
