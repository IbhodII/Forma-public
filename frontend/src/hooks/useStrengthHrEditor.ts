import { useCallback, useMemo, useReducer } from "react";
import type { HeartRatePoint, StrengthHrDetectedBlock, StrengthHrSetMetrics } from "../types";
import type {
  StrengthHrEditableBlock,
  StrengthHrEditorAction,
  StrengthHrEditorState,
} from "../types/strengthHrEditor";
import {
  findDuplicateSetAssignments,
  isValidBlockInterval,
  prepareEditableBlocks,
  recalcAllBlockMetrics,
  reindexBlocks,
  validateBlockLayout,
} from "../utils/strengthHrBlockMetrics";

function clearMatch(block: StrengthHrEditableBlock): StrengthHrEditableBlock {
  return {
    ...block,
    matched_order_index: null,
    matched_exercise: null,
    matched_set_number: null,
    matched_load_display: null,
    matched_set: null,
    assigned_order_index: null,
    is_warmup: false,
  };
}

function applyAssignSet(
  block: StrengthHrEditableBlock,
  orderIndex: number | null,
  sets: StrengthHrSetMetrics[],
): StrengthHrEditableBlock {
  if (orderIndex == null) {
    return clearMatch(block);
  }
  const setRow = sets.find((s) => s.order_index === orderIndex);
  if (!setRow) {
    return { ...clearMatch(block), assigned_order_index: orderIndex };
  }
  return {
    ...block,
    kind: "set",
    assigned_order_index: orderIndex,
    matched_order_index: orderIndex,
    matched_exercise: setRow.exercise,
    matched_set_number: setRow.set_number,
    matched_load_display: setRow.load_display,
    is_warmup: setRow.is_warmup,
    matched_set: {
      exercise: setRow.exercise,
      set_number: setRow.set_number,
      weight: setRow.weight,
      reps_str: setRow.reps_str,
      load_display: setRow.load_display,
      is_warmup: setRow.is_warmup,
    },
    confidence: "medium",
    confidence_reason: "manual_assignment",
  };
}

function mergeSelectedBlocks(selected: StrengthHrEditableBlock[]): StrengthHrEditableBlock {
  const sorted = [...selected].sort((a, b) => a.start_sec - b.start_sec);
  const primary =
    sorted.find((b) => b.kind === "set" && b.assigned_order_index != null) ?? sorted[0];
  const hasSetKind = sorted.some((b) => b.kind === "set");
  return {
    ...primary,
    start_sec: Math.min(...sorted.map((b) => b.start_sec)),
    end_sec: Math.max(...sorted.map((b) => b.end_sec)),
    kind: hasSetKind ? "set" : sorted[0].kind,
    confidence: "medium",
    confidence_reason: "manual_assignment",
    isManual: true,
  };
}

function reducer(
  state: StrengthHrEditorState,
  action: StrengthHrEditorAction & { points?: HeartRatePoint[]; sets?: StrengthHrSetMetrics[] },
): StrengthHrEditorState {
  const points = action.points ?? [];
  const sets = action.sets ?? [];

  const finish = (
    blocks: StrengthHrEditableBlock[],
    selectedBlockId = state.selectedBlockId,
  ): StrengthHrEditorState => {
    try {
      const recalced = recalcAllBlockMetrics(points, blocks);
      const layoutIssues = validateBlockLayout(recalced);
      const dupes = findDuplicateSetAssignments(recalced);
      const warnings: string[] = [];
      if (layoutIssues.length) {
        warnings.push("Проверьте границы блоков: есть пересечения или слишком короткие интервалы.");
      }
      if (dupes.length) {
        warnings.push("Один подход назначен на несколько блоков — сопоставление частичное.");
      }
      const stillSelected =
        selectedBlockId != null && recalced.some((b) => b.block_id === selectedBlockId)
          ? selectedBlockId
          : null;
      return {
        ...state,
        blocks: recalced,
        dirty: true,
        warnings,
        selectedBlockId: stillSelected,
      };
    } catch {
      return {
        ...state,
        warnings: [
          ...state.warnings,
          "Не удалось пересчитать метрики блока — проверьте границы и данные пульса.",
        ],
      };
    }
  };

  switch (action.type) {
    case "loadBlocks":
      return {
        ...state,
        blocks: action.blocks,
        dirty: false,
        warnings: [],
        selectedBlockId: null,
      };
    case "resetToAuto":
      return {
        ...state,
        blocks: state.autoBlocks.map((b) => ({ ...b })),
        dirty: false,
        warnings: [],
        selectedBlockId: null,
      };
    case "selectBlock": {
      if (action.blockId == null || !Number.isFinite(action.blockId)) {
        return { ...state, selectedBlockId: null };
      }
      const exists = state.blocks.some((b) => b.block_id === action.blockId);
      if (!exists) {
        return {
          ...state,
          selectedBlockId: null,
          warnings: [
            ...state.warnings,
            "Выбранный блок не найден — возможно, данные устарели. Обновите анализ пульса.",
          ],
        };
      }
      return { ...state, selectedBlockId: action.blockId };
    }
    case "clearSelection":
      return { ...state, selectedBlockId: null };
    case "moveBoundary": {
      const blocks = state.blocks.map((b) => {
        if (b.block_id !== action.blockId) return b;
        if (action.edge === "start") return { ...b, start_sec: action.sec, isManual: true };
        return { ...b, end_sec: action.sec, isManual: true };
      });
      return finish(blocks);
    }
    case "nudgeBoundary": {
      const blocks = state.blocks.map((b) => {
        if (b.block_id !== action.blockId) return b;
        if (action.edge === "start") {
          return { ...b, start_sec: Math.max(0, b.start_sec + action.deltaSec), isManual: true };
        }
        return { ...b, end_sec: b.end_sec + action.deltaSec, isManual: true };
      });
      return finish(blocks);
    }
    case "mergeBlocks": {
      const ids = new Set(action.blockIds);
      const selected = state.blocks.filter((b) => ids.has(b.block_id));
      if (selected.length < 2) return state;
      const rest = state.blocks.filter((b) => !ids.has(b.block_id));
      const merged = mergeSelectedBlocks(selected);
      const next = reindexBlocks([...rest, merged]);
      const picked = next.find(
        (b) => b.start_sec === merged.start_sec && b.end_sec === merged.end_sec,
      );
      return finish(next, picked?.block_id ?? null);
    }
    case "mergeWithPrevious": {
      const sorted = [...state.blocks].sort((a, b) => a.start_sec - b.start_sec);
      const idx = sorted.findIndex((b) => b.block_id === action.blockId);
      if (idx <= 0) return state;
      const merged = mergeSelectedBlocks([sorted[idx - 1], sorted[idx]]);
      const rest = sorted.filter((_, i) => i !== idx - 1 && i !== idx);
      const next = reindexBlocks([...rest, merged]);
      const picked = next.find(
        (b) => b.start_sec === merged.start_sec && b.end_sec === merged.end_sec,
      );
      return finish(next, picked?.block_id ?? null);
    }
    case "mergeWithNext": {
      const sorted = [...state.blocks].sort((a, b) => a.start_sec - b.start_sec);
      const idx = sorted.findIndex((b) => b.block_id === action.blockId);
      if (idx < 0 || idx >= sorted.length - 1) return state;
      const merged = mergeSelectedBlocks([sorted[idx], sorted[idx + 1]]);
      const rest = sorted.filter((_, i) => i !== idx && i !== idx + 1);
      const next = reindexBlocks([...rest, merged]);
      const picked = next.find(
        (b) => b.start_sec === merged.start_sec && b.end_sec === merged.end_sec,
      );
      return finish(next, picked?.block_id ?? null);
    }
    case "splitBlock": {
      const target = state.blocks.find((b) => b.block_id === action.blockId);
      if (!target) return state;
      if (action.atSec <= target.start_sec || action.atSec >= target.end_sec) return state;
      const left: StrengthHrEditableBlock = {
        ...target,
        end_sec: action.atSec,
        confidence: "medium",
        confidence_reason: "manual_assignment",
        isManual: true,
      };
      const right: StrengthHrEditableBlock = {
        ...clearMatch(target),
        block_id: target.block_id + 1000,
        start_sec: action.atSec,
        confidence: "low",
        confidence_reason: "manual_assignment",
        isManual: true,
      };
      const rest = state.blocks.filter((b) => b.block_id !== action.blockId);
      const next = reindexBlocks([...rest, left, right]);
      const newSelected = next.find((b) => b.start_sec === left.start_sec)?.block_id ?? null;
      return finish(next, newSelected);
    }
    case "assignSet": {
      const blocks = state.blocks.map((b) =>
        b.block_id === action.blockId ? applyAssignSet(b, action.orderIndex, sets) : b,
      );
      return finish(blocks);
    }
    case "setKind": {
      const blocks = state.blocks.map((b) => {
        if (b.block_id !== action.blockId) return b;
        if (action.kind === "set") {
          return {
            ...b,
            kind: "set" as const,
            confidence: "medium",
            confidence_reason: "manual_assignment",
            isManual: true,
          };
        }
        return {
          ...clearMatch(b),
          kind: action.kind,
          confidence: "low",
          confidence_reason: action.kind,
          isManual: true,
        };
      });
      return finish(blocks);
    }
    default:
      return state;
  }
}

export function useStrengthHrEditor(
  initialBlocks: StrengthHrDetectedBlock[],
  autoBlocks: StrengthHrDetectedBlock[],
  points: HeartRatePoint[],
  sets: StrengthHrSetMetrics[] | null | undefined,
) {
  const safeSets = sets ?? [];
  const safePoints = points ?? [];

  const prepared = useMemo(
    () => prepareEditableBlocks(initialBlocks, autoBlocks, safePoints),
    [initialBlocks, autoBlocks, safePoints],
  );

  const autoPrepared = useMemo(
    () => prepareEditableBlocks(autoBlocks, autoBlocks, safePoints),
    [autoBlocks, safePoints],
  );

  const bootstrapWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (prepared.skipped > 0) {
      warnings.push(
        `Пропущено ${prepared.skipped} блок(ов) с некорректными границами — их нельзя редактировать на графике.`,
      );
    }
    if (!prepared.blocks.length && initialBlocks.length > 0) {
      warnings.push("Нет пригодных для редактирования блоков — проверьте анализ пульса.");
    }
    return warnings;
  }, [prepared.skipped, prepared.blocks.length, initialBlocks.length]);

  const [state, dispatchBase] = useReducer(reducer, {
    blocks: prepared.blocks,
    autoBlocks: autoPrepared.blocks,
    dirty: false,
    warnings: bootstrapWarnings,
    selectedBlockId: null,
  });

  const dispatch = useCallback(
    (action: StrengthHrEditorAction) => {
      dispatchBase({ ...action, points: safePoints, sets: safeSets } as StrengthHrEditorAction & {
        points: HeartRatePoint[];
        sets: StrengthHrSetMetrics[];
      });
    },
    [safePoints, safeSets],
  );

  const loadBlocks = useCallback(
    (blocks: StrengthHrEditableBlock[]) => {
      const valid = blocks.filter(isValidBlockInterval);
      dispatchBase({
        type: "loadBlocks",
        blocks: recalcAllBlockMetrics(safePoints, reindexBlocks(valid)),
        points: safePoints,
        sets: safeSets,
      } as StrengthHrEditorAction & { points: HeartRatePoint[]; sets: StrengthHrSetMetrics[] });
    },
    [safePoints, safeSets],
  );

  const selectedBlock = useMemo(
    () => state.blocks.find((b) => b.block_id === state.selectedBlockId) ?? null,
    [state.blocks, state.selectedBlockId],
  );

  return { ...state, selectedBlock, dispatch, loadBlocks };
}
