import AsyncStorage from '@react-native-async-storage/async-storage';
import {useCallback, useEffect, useState} from 'react';

import type {PeriodDays} from '../components/analytics/utils';

const STORAGE_KEY = 'analytics:period';
const VALID: PeriodDays[] = [7, 14, 30, 42, 90];

function parseStored(raw: string | null): PeriodDays | null {
  if (!raw) {
    return null;
  }
  const n = Number(raw);
  return VALID.includes(n as PeriodDays) ? (n as PeriodDays) : null;
}

export function useAnalyticsPeriod(initial: PeriodDays = 30) {
  const [period, setPeriodState] = useState<PeriodDays>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      const stored = parseStored(raw);
      if (stored != null) {
        setPeriodState(stored);
      }
      setReady(true);
    });
  }, []);

  const setPeriod = useCallback((next: PeriodDays) => {
    setPeriodState(next);
    void AsyncStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  return {period, setPeriod, ready};
}
