import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchStretchingActivity, fetchStretchingLog } from "../../../api/stretching";
import { queryKeys } from "../../../hooks/queryKeys";

export type RecoveryStatus = "rested" | "ready" | "recovering" | "rest";

function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10));
  const db = new Date(b.slice(0, 10));
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function useStretchingStats() {
  const today = new Date().toISOString().slice(0, 10);

  const activityQuery = useQuery({
    queryKey: queryKeys.stretchingActivity(60),
    queryFn: () => fetchStretchingActivity(60),
  });

  const logQuery = useQuery({
    queryKey: queryKeys.stretchingLog({ days: 30 }),
    queryFn: () => fetchStretchingLog({ days: 30 }),
  });

  return useMemo(() => {
    const activity = activityQuery.data ?? [];
    const logs = logQuery.data ?? [];

    const sessionDates = new Set<string>();
    for (const day of activity) {
      if (day.count > 0) sessionDates.add(day.date);
    }
    for (const log of logs) {
      sessionDates.add(log.date);
    }

    const sortedDates = [...sessionDates].sort();
    const lastSession = sortedDates.at(-1) ?? null;
    const daysSinceLast = lastSession ? daysBetween(lastSession, today) : null;

    let streak = 0;
    const cursor = new Date(today);
    for (let i = 0; i < 60; i += 1) {
      const key = cursor.toISOString().slice(0, 10);
      if (sessionDates.has(key)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekKey = weekAgo.toISOString().slice(0, 10);
    const sessionsThisWeek = sortedDates.filter((d) => d >= weekKey).length;

    const minutesThisWeek = logs
      .filter((l) => l.date >= weekKey)
      .reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);

    const todayDone = sessionDates.has(today);

    let recoveryStatus: RecoveryStatus = "ready";
    if (daysSinceLast === null) recoveryStatus = "rest";
    else if (daysSinceLast === 0) recoveryStatus = "recovering";
    else if (daysSinceLast <= 2) recoveryStatus = "ready";
    else if (daysSinceLast <= 5) recoveryStatus = "rested";
    else recoveryStatus = "rest";

    const mobilityScore = Math.min(
      100,
      Math.round(
        sessionsThisWeek * 14 +
          Math.min(streak, 7) * 6 +
          Math.min(minutesThisWeek, 90) * 0.45 +
          (todayDone ? 12 : 0),
      ),
    );

    const estimatedSessionMin =
      logs.length > 0
        ? Math.round(
            logs.reduce((s, l) => s + (l.duration_minutes ?? 12), 0) / logs.length,
          )
        : 15;

    return {
      mobilityScore,
      recoveryStatus,
      streak,
      sessionsThisWeek,
      minutesThisWeek,
      todayDone,
      lastSession,
      daysSinceLast,
      estimatedSessionMin,
      isLoading: activityQuery.isLoading || logQuery.isLoading,
    };
  }, [activityQuery.data, logQuery.data, activityQuery.isLoading, logQuery.isLoading, today]);
}

export const RECOVERY_LABELS: Record<RecoveryStatus, string> = {
  rested: "Восстановлены",
  ready: "Готовы к мобильности",
  recovering: "В процессе восстановления",
  rest: "Начните мягко",
};
