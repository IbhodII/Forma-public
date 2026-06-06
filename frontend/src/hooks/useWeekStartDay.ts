import { useUserProfile } from "../hooks/useUserProfile";
import { DEFAULT_WEEK_START_DAY, normalizeWeekStartDay } from "../shared/utils/weekCalendar";

export function useWeekStartDay(): number {
  const { data } = useUserProfile();
  return normalizeWeekStartDay(data?.week_start_day ?? DEFAULT_WEEK_START_DAY);
}
