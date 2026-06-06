import {formatFormaWeekLabel} from './formaWeek';

/** Format week anchor as "12–18 мая" for Forma week (Sat–Fri). */
export function formatWeekRange(anchorIso: string): string {
  return formatFormaWeekLabel(anchorIso);
}
