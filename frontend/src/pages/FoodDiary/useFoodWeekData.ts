import { useQuery } from "@tanstack/react-query";
import type { DailyExpenditure } from "../../api/analytics";
import {
  fetchDailyBraceletCalories,
  fetchDailyExpenditure,
  fetchWeekDailyExpenditure,
} from "../../api/analytics";
import { foodApi, type FoodWeekResponse } from "../../api/food";
import { queryKeys } from "../../hooks/queryKeys";
import { isToday, todayIso } from "../../shared/utils/dateHighlight";
import { weekdayLabelsFromStart, weekDatesFromAnchor } from "../../shared/utils/weekCalendar";
import {
  resolveTodayExpenditureForecast,
  sameWeekdayPreviousWeek,
  type TodayExpenditureForecast,
} from "./todayExpenditureForecast";

export type WeekDayCell = {
  date: string;
  weekdayLabel: string;
  dayNum: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  fiberTarget: number;
  intake: number;
  expenditure: number | null;
  balance: number | null;
  hasEntries: boolean;
  hasFallback: boolean;
  isSunday: boolean;
  expenditureIsForecast?: boolean;
  expenditureForecast?: TodayExpenditureForecast | null;
};

export function buildWeekDayCells(
  week: FoodWeekResponse,
  weekExpItems: DailyExpenditure[] | undefined,
  weekStartDay: number,
  previousWeekSameDayExpenditure?: number | null,
): WeekDayCell[] {
  const labels = weekdayLabelsFromStart(weekStartDay);
  const dates = weekDatesFromAnchor(week.week_start, weekStartDay);
  const fiberTarget = week.daily_fiber_target?.recommended_grams ?? 30;
  const expByDate = new Map(
    (weekExpItems ?? []).map((e) => [e.date.slice(0, 10), e]),
  );

  return dates.map((date, i) => {
    const day = week.days.find((d) => d.date === date);
    const totals = day?.daily_totals;
    const protein = totals?.protein ?? 0;
    const fat = totals?.fat ?? 0;
    const carbs = totals?.carbs ?? 0;
    const fiber = totals?.fiber ?? 0;
    const intake = totals?.calories ?? 0;
    const hasEntries = intake > 0;
    const expItem = expByDate.get(date);
    const legacyExp = week.expenditure_by_day?.find((e) => e.date === date);
    const actualExpenditure =
      expItem?.total_expenditure ??
      legacyExp?.total_out_kcal ??
      day?.expenditure?.total_out_kcal ??
      null;

    let expenditure = actualExpenditure;
    let expenditureIsForecast = false;
    let expenditureForecast: TodayExpenditureForecast | null = null;

    if (isToday(date)) {
      const forecast = resolveTodayExpenditureForecast({
        currentEstimate: actualExpenditure,
        previousWeekSameDay: previousWeekSameDayExpenditure,
      });
      if (forecast) {
        expenditure = forecast.value;
        expenditureIsForecast = true;
        expenditureForecast = forecast;
      }
    }

    const balance =
      expenditure != null ? Math.round((intake - expenditure) * 10) / 10 : null;
    const d = new Date(`${date}T12:00:00`);

    return {
      date,
      weekdayLabel: labels[i] ?? "",
      dayNum: d.getDate(),
      protein,
      fat,
      carbs,
      fiber,
      fiberTarget,
      intake,
      expenditure,
      balance,
      hasEntries,
      hasFallback: Boolean(expItem?.has_fallback),
      isSunday: day?.is_sunday ?? false,
      expenditureIsForecast,
      expenditureForecast,
    };
  });
}

export function useFoodWeekData(
  weekAnchor: string,
  phase: "cut" | "bulk",
  weekStartDay: number,
  preferChest: boolean,
) {
  const weekQuery = useQuery({
    queryKey: queryKeys.foodWeek(weekAnchor, phase),
    queryFn: () => foodApi.getWeek(weekAnchor, phase),
  });

  const week = weekQuery.data;
  const weekEnd = week?.week_end ?? weekDatesFromAnchor(weekAnchor, weekStartDay)[6];
  const weekDates = week ? weekDatesFromAnchor(week.week_start, weekStartDay) : [];
  const today = todayIso();
  const weekIncludesToday = weekDates.includes(today);
  const previousWeekSameDay = sameWeekdayPreviousWeek(today);

  const previousWeekExpQuery = useQuery({
    queryKey: queryKeys.dailyExpenditure(previousWeekSameDay, phase, preferChest, null),
    queryFn: () =>
      fetchDailyExpenditure(previousWeekSameDay, phase, { preferChest }),
    enabled: weekIncludesToday,
    staleTime: 60_000,
  });

  const weekExpQuery = useQuery({
    queryKey: queryKeys.weekDailyExpenditure(weekAnchor, phase, preferChest),
    queryFn: () => fetchWeekDailyExpenditure(weekAnchor, phase, preferChest),
    enabled: Boolean(week),
  });

  const braceletQuery = useQuery({
    queryKey: queryKeys.dailyBraceletCalories(week?.week_start ?? weekAnchor, weekEnd),
    queryFn: () =>
      fetchDailyBraceletCalories(week!.week_start, weekEnd),
    enabled: Boolean(week?.week_start),
  });

  const cells = week
    ? buildWeekDayCells(
        week,
        weekExpQuery.data?.items,
        weekStartDay,
        previousWeekExpQuery.data?.total_expenditure,
      )
    : [];

  return {
    week,
    cells,
    weekExp: weekExpQuery.data,
    braceletRows: braceletQuery.data ?? [],
    isLoading: weekQuery.isLoading,
    isError: weekQuery.isError,
    error: weekQuery.error,
    refetch: weekQuery.refetch,
  };
}
