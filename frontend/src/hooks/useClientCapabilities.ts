import { useMemo } from "react";
import { useDeveloperTools } from "./useDeveloperTools";
import {
  resolveClientCapabilities,
  type ClientCapabilities,
} from "../config/clientCapabilities";

export function useClientCapabilities(): ClientCapabilities {
  const { developerToolsEnabled } = useDeveloperTools();
  return useMemo(() => {
    const base = resolveClientCapabilities();
    if (base.mode !== "admin_browser") {
      return base;
    }
    return {
      ...base,
      enableOAuthDebug: developerToolsEnabled,
      enableRawSyncViews: developerToolsEnabled,
      enableDebugPanels: developerToolsEnabled,
    };
  }, [developerToolsEnabled]);
}
