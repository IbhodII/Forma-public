import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchDailyExpenditure } from "../api/analytics";
import {
  fetchDashboardHomeExtensions,
  fetchDashboardHomeSummary,
  type DashboardHomeExtensions,
} from "../api/dashboard";
import type { FoodPhase } from "../api/food";
import type { CtlAtlTsbResponse } from "../types";
import { queryKeys } from "./queryKeys";
import { CTL_ATL_TSB_DEFAULT_DAYS } from "../shared/trainingLoadMetrics";
import {
  DASHBOARD_GC_MS,
  HERO_STALE_MS,
} from "./queryStaleTimes";
import { todayIso } from "../shared/utils/dateHighlight";
import { isoDaysAgo } from "../pages/Home/dashboard/utils";

type QuerySlice<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

function slice<T>(
  data: T | undefined,
  isLoading: boolean,
  isError: boolean,
  error: unknown,
): QuerySlice<T> {
  return { data, isLoading, isError, error };
}

export function useDashboardHome(foodPhase: FoodPhase = "cut") {
  const today = todayIso();
  const weekFrom = isoDaysAgo(6);
  const qc = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboardHomeSummary(today, foodPhase),
    queryFn: () => fetchDashboardHomeSummary({ phase: foodPhase }),
    staleTime: HERO_STALE_MS,
    gcTime: DASHBOARD_GC_MS,
    placeholderData: (previousData) => previousData,
  });

  const extensionsQuery = useQuery<DashboardHomeExtensions>({
    queryKey: queryKeys.dashboardHomeExtensions(today, "ctl"),
    queryFn: () => fetchDashboardHomeExtensions(["ctl"]),
    staleTime: HERO_STALE_MS,
    gcTime: DASHBOARD_GC_MS,
    enabled: summaryQuery.isSuccess || Boolean(summaryQuery.data),
  });

  const expenditureQuery = useQuery({
    queryKey: queryKeys.dailyExpenditure(today, foodPhase, true, null),
    queryFn: () => fetchDailyExpenditure(today, foodPhase, { preferChest: true }),
    staleTime: HERO_STALE_MS,
  });

  const merged = useMemo((): (Omit<typeof summaryQuery.data & object, "ctl"> & {
    ctl?: CtlAtlTsbResponse;
  }) | undefined => {
    const s = summaryQuery.data;
    if (!s) return undefined;
    const ctl = extensionsQuery.data?.ctl ?? s.ctl;
    return { ...s, ctl };
  }, [summaryQuery.data, extensionsQuery.data?.ctl]);

  const hub = merged?.health_connect_hub ?? undefined;
  const hcSnapshot = merged?.sync?.health_connect;
  const mergedCtl = merged?.ctl;
  const extensionsCtl = (extensionsQuery.data as DashboardHomeExtensions | undefined)?.ctl;

  useEffect(() => {
    if (!merged?.sync) return;
    qc.setQueryData(queryKeys.yandexCloudStatus, merged.sync.cloud);
    qc.setQueryData(queryKeys.formaSyncStatus, merged.sync.forma_sync);
    qc.setQueryData(queryKeys.polarConnectionStatus, merged.sync.polar);
    if (hub) {
      qc.setQueryData(queryKeys.healthConnectHub, hub);
    }
  }, [merged, hub, qc]);

  useEffect(() => {
    if (!mergedCtl?.items?.length && !extensionsCtl) return;
    const ctl = extensionsCtl ?? mergedCtl;
    if (ctl) {
      qc.setQueryData(queryKeys.ctlAtlTsb(CTL_ATL_TSB_DEFAULT_DAYS), ctl);
    }
  }, [mergedCtl, extensionsCtl, qc]);

  const summaryLoading = summaryQuery.isLoading && !summaryQuery.data;
  const summaryError = summaryQuery.isError;
  const summaryErr = summaryQuery.error;
  const ctlLoading =
    extensionsQuery.isLoading && !extensionsCtl && !mergedCtl?.items?.length;

  return {
    today,
    weekFrom,
    foodPhase,
    dashboard: summaryQuery,
    ctl: slice(mergedCtl, ctlLoading, extensionsQuery.isError, extensionsQuery.error),
    food: slice(merged?.food, summaryLoading, summaryError, summaryErr),
    expenditure: expenditureQuery,
    body: slice(merged?.body, summaryLoading, summaryError, summaryErr),
    stepsToday: slice(merged?.steps_today, summaryLoading, summaryError, summaryErr),
    stepsWeek: slice(merged?.steps_week, summaryLoading, summaryError, summaryErr),
    weightWeek: slice(merged?.weight_week, summaryLoading, summaryError, summaryErr),
    latestStrength: slice(merged?.latest_strength, summaryLoading, summaryError, summaryErr),
    sleep: slice(merged?.sleep, summaryLoading, summaryError, summaryErr),
    polar: slice(merged?.sync?.polar, summaryLoading, summaryError, summaryErr),
    cloud: slice(merged?.sync?.cloud, summaryLoading, summaryError, summaryErr),
    formaSync: slice(merged?.sync?.forma_sync, summaryLoading, summaryError, summaryErr),
    healthConnect: slice(hub, summaryLoading, summaryError, summaryErr),
    hcSnapshot: slice(hcSnapshot, summaryLoading, summaryError, summaryErr),
    heroLoading: false,
    heroError: summaryError,
  };
}
