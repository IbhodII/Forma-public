import { useMemo } from "react";
import {
  CTL_ATL_TSB_DEFAULT_DAYS,
  hasTrainingLoadMetrics,
  todayDailyTrimp,
  trainingLoadCurrent,
} from "../shared/trainingLoadMetrics";
import type { useDashboardHome } from "./useDashboardHome";

/** Training load from dashboard home payload (no duplicate CTL fetch). */
export function useDashboardTrainingLoad(
  dashboard: ReturnType<typeof useDashboardHome>,
) {
  return useMemo(() => {
    const ctlData = dashboard.ctl.data;
    const current = trainingLoadCurrent(ctlData);
    return {
      data: ctlData,
      isLoading: dashboard.ctl.isLoading,
      isError: dashboard.ctl.isError,
      error: dashboard.ctl.error,
      days: CTL_ATL_TSB_DEFAULT_DAYS,
      today: dashboard.today,
      current,
      metricsReady: hasTrainingLoadMetrics(current),
      trimpToday: todayDailyTrimp(ctlData?.items, dashboard.today),
    };
  }, [
    dashboard.ctl.data,
    dashboard.ctl.isLoading,
    dashboard.ctl.isError,
    dashboard.ctl.error,
    dashboard.today,
  ]);
}
