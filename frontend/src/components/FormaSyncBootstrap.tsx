import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchYandexCloudStatus, formaSyncDownload } from "../api/cloud";
import { useAuth } from "../auth/AuthContext";
import { resolveClientMode } from "../config/clientCapabilities";
import { queryKeys } from "../hooks/queryKeys";
import { STATUS_STALE_MS } from "../hooks/queryStaleTimes";

/** After login on production clients: deferred background FormaSync download. */
export function FormaSyncBootstrap() {
  const { isAuthenticated } = useAuth();
  const downloadStarted = useRef(false);
  const qc = useQueryClient();

  const yandexQuery = useQuery({
    queryKey: queryKeys.yandexCloudStatus,
    queryFn: fetchYandexCloudStatus,
    enabled: isAuthenticated,
    staleTime: STATUS_STALE_MS,
    refetchOnMount: (query) => query.isStale(),
    initialData: () => {
      const cached = qc.getQueriesData<{ sync?: { cloud?: unknown } }>({
        queryKey: ["dashboard", "home"],
      });
      for (const [, payload] of cached) {
        const cloud = payload?.sync?.cloud;
        if (cloud && typeof cloud === "object") {
          return cloud as Awaited<ReturnType<typeof fetchYandexCloudStatus>>;
        }
      }
      return undefined;
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !yandexQuery.data?.connected || downloadStarted.current) {
      return;
    }
    if (resolveClientMode() === "admin_browser") {
      return;
    }
    const schedule = () => {
      downloadStarted.current = true;
      void formaSyncDownload().catch(() => undefined);
    };
    const idle = window.requestIdleCallback;
    const timer =
      typeof idle === "function"
        ? idle(schedule, { timeout: 6000 })
        : window.setTimeout(schedule, 4000);
    return () => {
      if (typeof idle === "function") {
        window.cancelIdleCallback(timer as number);
      } else {
        window.clearTimeout(timer);
      }
    };
  }, [isAuthenticated, yandexQuery.data?.connected]);

  return null;
}
