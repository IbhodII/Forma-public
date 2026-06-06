import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPolarPendingList, type PolarAttachResponse, type PolarPendingListItem } from "../api/polar";
import { queryKeys } from "../hooks/queryKeys";
import { runPolarAutoAttach } from "../utils/polarAutoAttach";
import { invalidateAfterPolarAttach } from "../utils/polarQueryInvalidation";
import { polarAttachToast } from "../utils/polarAttachFeedback";
import { parseApiError } from "../utils/validation";
import { useToast } from "../components/Toast";

export function usePolarAutoAttach(
  items: PolarPendingListItem[],
  options?: { suppressPrompts?: boolean },
) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const processedRef = useRef<string>("");
  const runningRef = useRef(false);
  const suppressPrompts = options?.suppressPrompts ?? false;

  const [attachItem, setAttachItem] = useState<PolarPendingListItem | null>(null);
  const [sameDatePrompt, setSameDatePrompt] = useState<{
    date: string;
    items: PolarPendingListItem[];
  } | null>(null);
  const sameDateQueueRef = useRef<Array<{ date: string; items: PolarPendingListItem[] }>>([]);

  const refreshPending = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
  }, [qc]);

  useEffect(() => {
    if (suppressPrompts) {
      setAttachItem(null);
      setSameDatePrompt(null);
    }
  }, [suppressPrompts]);

  const runAutoAttach = useCallback(async () => {
    if (runningRef.current || items.length === 0) return;
    const key = items.map((i) => i.polar_transaction_id).sort().join("|");
    if (key === processedRef.current) return;

    runningRef.current = true;
    try {
      const result = await runPolarAutoAttach(items);
      processedRef.current = key;

      if (result.attachedCount > 0) {
        processedRef.current = "";
        for (const target of result.attachedTargets) {
          await invalidateAfterPolarAttach(qc, target);
        }
        refreshPending();
        if (result.attachedCount === 1 && result.anyMissingHrChart) {
          const { message, kind } = polarAttachToast({
            message: "",
            hr_samples: 0,
            has_hr_chart: false,
            gps_saved: false,
            fields_updated: false,
          });
          showToast(message, kind);
        } else {
          showToast(
            result.attachedCount === 1
              ? "Тренировка Polar автоматически привязана"
              : `Автоматически привязано тренировок Polar: ${result.attachedCount}${
                  result.anyMissingHrChart ? " (у части нет графика пульса)" : ""
                }`,
            result.anyMissingHrChart ? "warning" : "success",
          );
        }
      }

      if (!suppressPrompts) {
        if (result.pickManualFor) {
          setAttachItem(result.pickManualFor);
        }

        if (result.multiPolarDates.length > 0) {
          sameDateQueueRef.current = result.multiPolarDates.slice(1);
          setSameDatePrompt(result.multiPolarDates[0]);
        }
      }
    } catch (err) {
      showToast(parseApiError(err), "error");
    } finally {
      runningRef.current = false;
    }
  }, [items, refreshPending, showToast, qc, suppressPrompts]);

  useEffect(() => {
    void runAutoAttach();
  }, [runAutoAttach]);

  const dismissSameDate = () => {
    setSameDatePrompt(null);
    const rest = sameDateQueueRef.current;
    if (rest.length > 0) {
      sameDateQueueRef.current = rest.slice(1);
      setTimeout(() => setSameDatePrompt(rest[0]), 0);
    }
  };

  const onAttachFromSameDate = (item: PolarPendingListItem) => {
    setSameDatePrompt(null);
    setAttachItem(item);
  };

  const clearAttachItem = () => setAttachItem(null);

  return {
    attachItem,
    setAttachItem,
    sameDatePrompt,
    dismissSameDate,
    onAttachFromSameDate,
    clearAttachItem,
    refreshPending,
  };
}

/** Логика привязки Polar после ручного сохранения тренировки */
export async function resolvePolarAfterManualSave(
  date: string,
  type: string,
  workoutId: number,
  kind: "cardio" | "strength",
): Promise<
  | { action: "none" }
  | { action: "attached"; attachResult: PolarAttachResponse }
  | { action: "pick"; candidates: PolarPendingListItem[] }
> {
  const list = await fetchPolarPendingList();
  const sameType = list.items.filter((p) => p.date === date && p.type === type);
  if (sameType.length === 1) {
    const { attachPolarItemToWorkout } = await import("../utils/polarAutoAttach");
    const attachResult = await attachPolarItemToWorkout(sameType[0], workoutId, kind);
    return { action: "attached", attachResult };
  }
  if (sameType.length > 1) {
    return { action: "pick", candidates: sameType };
  }
  return { action: "none" };
}
