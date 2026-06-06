import {useEffect} from 'react';

import {loadHapticsEnabled} from './preferences';
import {setHapticsEnabled} from './trigger';

/** Loads persisted haptic preference once at app start. */
export function HapticBootstrap() {
  useEffect(() => {
    void loadHapticsEnabled().then(setHapticsEnabled);
  }, []);
  return null;
}
