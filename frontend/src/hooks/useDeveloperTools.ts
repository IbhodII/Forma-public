import { useCallback, useEffect, useState } from "react";
import {
  readDeveloperToolsEnabled,
  writeDeveloperToolsEnabled,
} from "../utils/developerTools";

export function useDeveloperTools() {
  const [enabled, setEnabled] = useState(readDeveloperToolsEnabled);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setEnabled(typeof detail === "boolean" ? detail : readDeveloperToolsEnabled());
    };
    window.addEventListener("developer-tools-changed", onChange);
    return () => window.removeEventListener("developer-tools-changed", onChange);
  }, []);

  const setDeveloperToolsEnabled = useCallback((next: boolean) => {
    writeDeveloperToolsEnabled(next);
    setEnabled(next);
  }, []);

  return { developerToolsEnabled: enabled, setDeveloperToolsEnabled };
}
