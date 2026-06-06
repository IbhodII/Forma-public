import type { ReactNode } from "react";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { parseApiError } from "../../../utils/validation";
import { useBodyHealthHub } from "./useBodyHealthHub";

export function BodyHubState({ children }: { children: (ready: boolean) => ReactNode }) {
  const query = useBodyHealthHub();

  if (query.isLoading) {
    return <Loader label="Загрузка данных Health Connect…" />;
  }
  if (query.isError) {
    return <ErrorAlert message={parseApiError(query.error)} />;
  }
  if (!query.data) {
    return <div className="body-hub__empty">Нет данных Health Connect.</div>;
  }

  return <>{children(true)}</>;
}

export function useBodyHubData() {
  const query = useBodyHealthHub();
  return { query, data: query.data };
}
