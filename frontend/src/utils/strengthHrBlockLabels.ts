import type { StrengthHrDetectedBlock } from "../types";

/** Подпись подхода в рамках упражнения (не сквозной номер тренировки). */
export function formatBlockSetCaption(
  block: StrengthHrDetectedBlock,
  showSetMapping: boolean,
): string | null {
  if (!showSetMapping || !block.matched_exercise) return null;
  if (block.is_warmup) return "разминка";
  if (block.matched_set_number != null && block.matched_set_number > 0) {
    return `подход ${block.matched_set_number}`;
  }
  return null;
}

/** Короткая подпись на графике. */
export function formatBlockChartLabel(
  block: StrengthHrDetectedBlock,
  showSetMapping: boolean,
  editMode = false,
): string {
  const kind = (block as StrengthHrDetectedBlock & { kind?: string }).kind;
  if (kind === "rest") return "отдых";
  if (kind === "noise") return "шум";
  const caption = formatBlockSetCaption(block, showSetMapping || editMode);
  if (caption === "разминка") return "р";
  if (caption?.startsWith("подход ")) {
    const n = block.matched_set_number;
    return n != null ? String(n) : caption.replace("подход ", "");
  }
  if (block.peak_hr != null) return String(block.peak_hr);
  return String(block.block_index);
}

/** Подпись confidence для hover. */
function confidenceRu(confidence: string | undefined): string {
  if (confidence === "high") return "высокая";
  if (confidence === "medium") return "средняя";
  if (confidence === "low") return "низкая";
  return "—";
}

/** Подпись reason code для hover. */
function reasonRu(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason === "superset_detected") return "возможен супerset";
  if (reason === "oversegmentation_corrected") return "блоки объединены";
  if (reason === "block_count_mismatch") return "число блоков ≠ подходов";
  if (reason === "merged_small_valleys") return "мелкие провалы объединены";
  if (reason === "adaptive_threshold_raised") return "пороги повышены";
  return reason;
}

/** Текст hover-карточки блока. */
export function formatBlockHoverHtml(
  block: StrengthHrDetectedBlock,
  showSetMapping: boolean,
): string {
  const confLine = `Точность: ${confidenceRu(block.confidence)}`;
  const reasonLine = reasonRu(block.confidence_reason);

  if (showSetMapping && block.matched_exercise) {
    const caption = formatBlockSetCaption(block, showSetMapping);
    const title = caption
      ? `<b>${block.matched_exercise} · ${caption}</b>`
      : `<b>${block.matched_exercise}</b>`;
    const lines = [
      title,
      block.matched_load_display ? block.matched_load_display : null,
      block.peak_hr != null ? `Пик: ${block.peak_hr} уд/мин` : null,
      block.avg_hr != null ? `Средний: ${block.avg_hr} уд/мин` : null,
      block.recovery_drop != null ? `Recovery: −${block.recovery_drop} уд/мин` : null,
      confLine,
      reasonLine,
    ].filter(Boolean);
    return lines.join("<br>");
  }

  const lines = [
    `<b>Блок ${block.block_index}</b>`,
    block.is_warmup ? "разминка" : null,
    block.peak_hr != null ? `Пик: ${block.peak_hr} уд/мин` : null,
    block.avg_hr != null ? `Средний: ${block.avg_hr} уд/мин` : null,
    block.recovery_drop != null ? `Recovery: −${block.recovery_drop} уд/мин` : null,
    confLine,
    reasonLine,
  ].filter(Boolean);
  return lines.join("<br>");
}

/** Подпись строки в таблице блоков. */
export function formatBlockTableSetLabel(block: StrengthHrDetectedBlock): string {
  if (block.is_warmup) return "разминка";
  if (block.matched_set_number != null && block.matched_set_number > 0) {
    return `${block.matched_set_number} подход`;
  }
  return block.matched_load_display ?? "—";
}
