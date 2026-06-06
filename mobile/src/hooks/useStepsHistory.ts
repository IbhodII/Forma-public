import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';

import {fetchStepsHistory} from '../api/steps';
import {periodRange, type PeriodDays} from '../components/analytics/utils';
import {useOffline} from '../context/OfflineContext';
import {useOperatingMode} from '../context/OperatingModeContext';
import {listDayMetricsInRange} from '../database/hcStore';
import type {StepsHistoryPoint} from '../types/body';

export function useStepsHistory(periodDays: PeriodDays) {
  const {from, to} = periodRange(periodDays);
  const {dbReady} = useOffline();
  const {isLocalFirst, apiReachable} = useOperatingMode();
  const preferLocal = isLocalFirst && !apiReachable;

  const hcQuery = useQuery({
    queryKey: ['steps-hc-range', from, to],
    queryFn: () => listDayMetricsInRange(from, to),
    staleTime: 60_000,
    enabled: dbReady,
  });

  const apiQuery = useQuery({
    queryKey: ['steps-history', from, to],
    queryFn: () => fetchStepsHistory({date_from: from, date_to: to}),
    staleTime: 60_000,
    enabled: !preferLocal,
  });

  const hcItems = useMemo((): StepsHistoryPoint[] => {
    const rows = hcQuery.data ?? [];
    return rows
      .filter(r => r.payload.steps != null && r.payload.steps > 0)
      .map(r => ({
        date: r.date,
        steps: r.payload.steps ?? 0,
        distance_km: null,
      }));
  }, [hcQuery.data]);

  const items = useMemo((): StepsHistoryPoint[] => {
    if (!preferLocal && apiQuery.data?.items?.length) {
      return apiQuery.data.items;
    }
    if (hcItems.length > 0) {
      return hcItems;
    }
    return apiQuery.data?.items ?? [];
  }, [preferLocal, apiQuery.data?.items, hcItems]);

  const isLoading = preferLocal
    ? hcQuery.isLoading
    : apiQuery.isLoading;
  const isError = preferLocal ? hcQuery.isError : apiQuery.isError;
  const error = preferLocal ? hcQuery.error : apiQuery.error;
  const refetch = async () => {
    await Promise.all([hcQuery.refetch(), apiQuery.refetch()]);
  };
  const source =
    preferLocal || (!apiQuery.data?.items?.length && hcItems.length > 0)
      ? ('hc' as const)
      : ('api' as const);

  return {items, from, to, isLoading, isError, error, refetch, source};
}
