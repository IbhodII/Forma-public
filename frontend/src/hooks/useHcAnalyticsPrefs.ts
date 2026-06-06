import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  DEFAULT_HC_ANALYTICS_PREFS,
  fetchAnalyticsSettings,
  saveAnalyticsSettings,
  type HcAnalyticsPrefs,
  HC_ANALYTICS_METRIC_KEYS,
} from "../api/user";
import { queryKeys } from "./queryKeys";

export function useHcAnalyticsPrefs() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.analyticsSettings,
    queryFn: fetchAnalyticsSettings,
  });

  const prefs: HcAnalyticsPrefs = {
    ...DEFAULT_HC_ANALYTICS_PREFS,
    ...(query.data?.hc_analytics ?? {}),
  };

  const saveMut = useMutation({
    mutationFn: saveAnalyticsSettings,
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.analyticsSettings, saved);
      void qc.invalidateQueries({ queryKey: queryKeys.healthConnectHub });
      void qc.invalidateQueries({ queryKey: ["dashboard", "home"] });
      void qc.invalidateQueries({ queryKey: queryKeys.sleepSummary(7) });
      void qc.invalidateQueries({ queryKey: ["analytics", "passive-hr"] });
    },
  });

  const setMaster = useCallback(
    (enabled: boolean) => {
      const patch: Partial<HcAnalyticsPrefs> = { use_in_analytics: enabled };
      if (enabled) {
        for (const key of HC_ANALYTICS_METRIC_KEYS) {
          patch[key] = true;
        }
      }
      saveMut.mutate({ hc_analytics: patch });
    },
    [saveMut],
  );

  const setMetric = useCallback(
    (key: (typeof HC_ANALYTICS_METRIC_KEYS)[number], enabled: boolean) => {
      saveMut.mutate({ hc_analytics: { [key]: enabled } });
    },
    [saveMut],
  );

  return {
    prefs,
    isLoading: query.isLoading,
    isSaving: saveMut.isPending,
    setMaster,
    setMetric,
    saveMut,
  };
}
