import { useQuery } from "@tanstack/react-query";
import { fetchBodyOverviewSummary } from "../../../api/bodyOverview";
import { queryKeys } from "../../../hooks/queryKeys";
import { BODY_OVERVIEW_WEIGHT_DAYS } from "./overview/bodyOverviewUtils";

export function useBodyOverviewSummary() {
  return useQuery({
    queryKey: queryKeys.bodyOverviewSummary(BODY_OVERVIEW_WEIGHT_DAYS),
    queryFn: () => fetchBodyOverviewSummary(BODY_OVERVIEW_WEIGHT_DAYS),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
