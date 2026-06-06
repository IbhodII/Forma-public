import { useQuery } from "@tanstack/react-query";
import { fetchHealthConnectHub } from "../../../api/sync";
import { queryKeys } from "../../../hooks/queryKeys";

export function useBodyHealthHub() {
  return useQuery({
    queryKey: queryKeys.healthConnectHub,
    queryFn: fetchHealthConnectHub,
  });
}
