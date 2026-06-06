import type { StrengthHrMatchedSet } from "./index";

/**
 * Manual HR block editor types.
 * @future-ml — fields like original_auto_* are stored for future detection threshold tuning.
 */
export type BlockKind = "set" | "rest" | "noise";

export type StrengthHrEditorAction =
  | { type: "moveBoundary"; blockId: number; edge: "start" | "end"; sec: number }
  | { type: "nudgeBoundary"; blockId: number; edge: "start" | "end"; deltaSec: number }
  | { type: "mergeBlocks"; blockIds: number[] }
  | { type: "mergeWithPrevious"; blockId: number }
  | { type: "mergeWithNext"; blockId: number }
  | { type: "splitBlock"; blockId: number; atSec: number }
  | { type: "assignSet"; blockId: number; orderIndex: number | null }
  | { type: "setKind"; blockId: number; kind: BlockKind }
  | { type: "selectBlock"; blockId: number | null }
  | { type: "clearSelection" }
  | { type: "resetToAuto" }
  | { type: "loadBlocks"; blocks: StrengthHrEditableBlock[] };

export interface StrengthHrEditableBlock {
  block_index: number;
  block_id: number;
  start_sec: number;
  end_sec: number;
  duration_sec?: number | null;
  peak_hr: number | null;
  avg_hr: number | null;
  min_hr: number | null;
  hr_rise: number | null;
  recovery_drop: number | null;
  recovery_time: number | null;
  confidence: string;
  confidence_reason?: string | null;
  matched_order_index: number | null;
  matched_exercise: string | null;
  matched_set_number: number | null;
  matched_load_display: string | null;
  is_warmup: boolean;
  matched_set?: StrengthHrMatchedSet | null;
  kind: BlockKind;
  assigned_order_index: number | null;
  isManual?: boolean;
  /** @future-ml — auto block index before manual edit */
  source_auto_block_index?: number | null;
  /** @future-ml — original auto boundaries */
  original_auto_start_sec?: number | null;
  original_auto_end_sec?: number | null;
}

export interface StrengthHrEditorState {
  blocks: StrengthHrEditableBlock[];
  autoBlocks: StrengthHrEditableBlock[];
  dirty: boolean;
  warnings: string[];
  selectedBlockId: number | null;
}

export interface StrengthHrBlockOverrideItem {
  block_index: number;
  start_sec: number;
  end_sec: number;
  kind: BlockKind;
  assigned_order_index: number | null;
  label?: string | null;
  notes?: string | null;
  source_auto_block_index?: number | null;
  original_start_sec?: number | null;
  original_end_sec?: number | null;
}

export interface StrengthHrBlockOverridesResponse {
  date: string;
  workout_title: string;
  blocks: StrengthHrBlockOverrideItem[];
}

export function blocksToOverridePayload(
  blocks: StrengthHrEditableBlock[],
): StrengthHrBlockOverrideItem[] {
  return blocks.map((b, i) => ({
    block_index: i + 1,
    start_sec: b.start_sec,
    end_sec: b.end_sec,
    kind: b.kind,
    assigned_order_index: b.kind === "set" ? b.assigned_order_index : null,
    label: b.matched_load_display,
    notes: null,
    source_auto_block_index: b.source_auto_block_index ?? null,
    original_start_sec: b.original_auto_start_sec ?? null,
    original_end_sec: b.original_auto_end_sec ?? null,
  }));
}

export function confidenceReasonLabel(reason: string | null | undefined): string {
  if (reason === "manual_override" || reason === "manual_assignment") return "ручное назначение";
  if (reason === "rest" || reason === "noise") return reason === "rest" ? "отдых" : "шум";
  return reason ?? "—";
}
