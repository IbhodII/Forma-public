import {useCallback, useEffect, useState} from 'react';

import {
  isDeveloperModeEnabled,
  registerDeveloperModeUnlockTap,
  setDeveloperModeEnabled,
} from '../config/developerMode';

export function useDeveloperMode() {
  const [enabled, setEnabled] = useState(false);

  const refresh = useCallback(async () => {
    setEnabled(await isDeveloperModeEnabled());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tryUnlockTap = useCallback(async () => {
    const next = await registerDeveloperModeUnlockTap();
    if (next != null) {
      setEnabled(next);
    }
    return next;
  }, []);

  const setEnabledMode = useCallback(async (value: boolean) => {
    await setDeveloperModeEnabled(value);
    setEnabled(value);
  }, []);

  return {developerMode: enabled, refresh, tryUnlockTap, setDeveloperMode: setEnabledMode};
}
