import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deletePolarPending,
  fetchPolarPendingList,
  isPolarManualUpload,
  type PolarPendingListItem,
} from "../api/polar";
import { ConfirmModal } from "../components/ConfirmModal";
import { ErrorAlert } from "../components/ErrorAlert";
import { Loader } from "../components/Loader";
import { useToast } from "../components/Toast";
import { DataTable } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { queryKeys } from "../hooks/queryKeys";
import { useUnits } from "../hooks/useUnits";
import { cardioTypeLabel } from "../utils/constants";
import { formatDateRu, formatDuration } from "../utils/format";
import { parseApiError } from "../utils/validation";

function polarTypeLabel(type: string | null | undefined): string {
  if (type === "силовая") return "Силовая";
  if (!type) return "—";
  return cardioTypeLabel(type);
}

export function PolarPendingSection({
  embedded = false,
  onCreateItem,
  onAttachItem,
}: {
  embedded?: boolean;
  /** Открыть форму создания (родитель держит state вне модалки списка). */
  onCreateItem?: (item: PolarPendingListItem) => void;
  /** Открыть выбор существующей тренировки для привязки. */
  onAttachItem?: (item: PolarPendingListItem) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const units = useUnits();
  const [deleteItem, setDeleteItem] = useState<PolarPendingListItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.polarPendingList,
    queryFn: fetchPolarPendingList,
  });

  const refreshList = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
    void refetch();
  };

  const deleteMut = useMutation({
    mutationFn: (polarTransactionId: string) => deletePolarPending(polarTransactionId),
    onSuccess: () => {
      refreshList();
      showToast("Тренировка удалена из очереди Polar", "success");
      setDeleteItem(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {!embedded && (
        <p className="text-sm text-slate-600">
          Тренировки, загруженные из Polar, но ещё не привязанные к записям в дневнике.
          Создайте новую тренировку или привяжите данные к уже существующей.
        </p>
      )}

      {isLoading && <Loader />}
      {isError && <ErrorAlert message={parseApiError(error)} />}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="Нет незаписанных тренировок Polar"
          description={
            embedded
              ? undefined
              : "Тренировки, загруженные из Polar, но ещё не привязанные к записям в дневнике."
          }
        />
      )}

      {!isLoading && items.length > 0 && (
        <DataTable density="compact">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th className="text-right">Дистанция</th>
              <th className="text-right">Время</th>
              <th className="text-right">Ккал</th>
              <th className="w-56 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.polar_transaction_id}>
                <td className="whitespace-nowrap">{formatDateRu(item.date ?? "")}</td>
                <td>{polarTypeLabel(item.type)}</td>
                <td className="tabular-nums whitespace-nowrap text-right">
                    {item.distance_km != null && item.distance_km > 0
                      ? units.formatDistance(item.distance_km)
                      : "—"}
                  </td>
                  <td className="tabular-nums whitespace-nowrap text-right">
                    {item.duration_sec != null && item.duration_sec > 0
                      ? formatDuration(item.duration_sec)
                      : "—"}
                  </td>
                  <td className="tabular-nums whitespace-nowrap text-right">
                    {item.calories != null && item.calories > 0
                      ? units.formatEnergy(item.calories)
                      : "—"}
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        className="btn-primary text-xs py-1.5 px-2.5"
                        onClick={() => onCreateItem?.(item)}
                        disabled={!onCreateItem}
                      >
                        Создать тренировку
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs py-1.5 px-2.5"
                        onClick={() => onAttachItem?.(item)}
                        disabled={!onAttachItem}
                      >
                        Привязать
                      </button>
                      <button
                        type="button"
                        className="text-xs py-1.5 px-2.5 rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        onClick={() => setDeleteItem(item)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <ConfirmModal
        open={deleteItem !== null}
        title="Удалить из очереди Polar?"
        message={
          deleteItem
            ? `Тренировка Polar за ${formatDateRu(deleteItem.date ?? "")} (${polarTypeLabel(deleteItem.type)}) будет удалена из очереди. ${
                isPolarManualUpload(deleteItem)
                  ? "Файл из ручной загрузки."
                  : "При следующей синхронизации Polar запись может появиться снова."
              } Записи в дневнике не затрагиваются.`
            : ""
        }
        confirmLabel={deleteMut.isPending ? "Удаление…" : "Удалить"}
        cancelLabel="Отмена"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (deleteItem) deleteMut.mutate(deleteItem.polar_transaction_id);
        }}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  );
}
