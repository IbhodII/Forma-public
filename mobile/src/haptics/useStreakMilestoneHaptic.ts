import {useEffect, useRef} from 'react';

import {haptics} from './trigger';

/** One subtle celebration when home shows an active streak (≥3 days). */
export function useStreakMilestoneHaptic(streak: number) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || streak < 3) {
      return;
    }
    fired.current = true;
    const t = setTimeout(() => haptics.milestone(), 400);
    return () => clearTimeout(t);
  }, [streak]);
}
