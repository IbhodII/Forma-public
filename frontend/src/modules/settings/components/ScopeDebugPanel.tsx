import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchScopeDebug, rebindCloudToUser } from "../../../api/auth";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { DiagnosticCollapsible } from "./DiagnosticCollapsible";
import { resolveClientMode } from "../../../config/clientCapabilities";

export function ScopeDebugPanel(_props: { embedded?: boolean } = {}) {
  const { showToast } = useToast();
  const { setSessionFromOAuth } = useAuth();
  const qc = useQueryClient();
  const mode = resolveClientMode();
  const scopeQuery = useQuery({
    queryKey: queryKeys.authScopeDebug,
    queryFn: fetchScopeDebug,
    staleTime: 10_000,
    enabled: mode === "admin_browser" || mode === "desktop_app",
  });

  const rebindMut = useMutation({
    mutationFn: () => rebindCloudToUser(1),
    onSuccess: (r) => {
      setSessionFromOAuth({
        user_id: r.session_user_id,
        email: null,
        provider: "yandex",
      });
      showToast("Профиль перепривязан к локальному user_id=1", "success");
      void qc.invalidateQueries();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const data = scopeQuery.data;
  const canRebind =
    data?.scope_mismatch_suspected &&
    (resolveClientMode() === "admin_browser" || resolveClientMode() === "desktop_app");

  return (
    <DiagnosticCollapsible
      title="Data scope (user_id)"
      description="current_user_id, cloud identity, counts vs user 1, db_path"
      copyData={data}
    >
      {scopeQuery.isLoading ? (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">Загрузка…</p>
      ) : scopeQuery.isError ? (
        <p className="text-xs text-red-600">{parseApiError(scopeQuery.error)}</p>
      ) : data ? (
        <div className="space-y-3 text-xs font-mono">
          <p>
            <span className="text-[rgb(var(--app-text-muted))]">current_user_id:</span>{" "}
            {data.current_user_id}
          </p>
          <p>
            <span className="text-[rgb(var(--app-text-muted))]">local_profile_id:</span>{" "}
            {data.local_profile_id}
          </p>
          <p>
            <span className="text-[rgb(var(--app-text-muted))]">cloud:</span>{" "}
            {data.cloud_identity ?? "—"}
          </p>
          <p className="break-all">
            <span className="text-[rgb(var(--app-text-muted))]">db_path:</span> {data.db_path}
          </p>
          {data.scope_mismatch_suspected ? (
            <p className="text-amber-700 dark:text-amber-400">
              Подозрение: тренировки на user 1, сессия на user {data.current_user_id}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="font-sans font-medium mb-1">Текущий user</p>
              <pre className="whitespace-pre-wrap text-[10px] opacity-90">
                {JSON.stringify(data.counts_current_user, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-sans font-medium mb-1">User 1</p>
              <pre className="whitespace-pre-wrap text-[10px] opacity-90">
                {JSON.stringify(data.counts_user_1, null, 2)}
              </pre>
            </div>
          </div>
          <p className="font-sans text-[rgb(var(--app-text-muted))]">
            global: {JSON.stringify(data.global_tables)}
          </p>
          {canRebind ? (
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={rebindMut.isPending}
              onClick={() => rebindMut.mutate()}
            >
              {rebindMut.isPending ? "Перепривязка…" : "Перепривязать облако к user_id=1"}
            </button>
          ) : null}
        </div>
      ) : null}
    </DiagnosticCollapsible>
  );
}
