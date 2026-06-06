const WEEKDAY_LABELS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

export type DailyStepsInsight = {
  avgSteps: number | null;
  bestDay: { date: string; steps: number } | null;
  activeDays: number;
  streakDays: number;
  busiestWeekday: { label: string; avgSteps: number } | null;
};

export function buildDailyStepsInsights(
  series: Array<{ date: string; steps: number }>,
): DailyStepsInsight {
  if (!series.length) {
    return {
      avgSteps: null,
      bestDay: null,
      activeDays: 0,
      streakDays: 0,
      busiestWeekday: null,
    };
  }

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const total = sorted.reduce((s, d) => s + d.steps, 0);
  const avgSteps = Math.round(total / sorted.length);
  const bestDay = sorted.reduce((a, b) => (b.steps > a.steps ? b : a), sorted[0]);
  const activeDays = sorted.filter((d) => d.steps > 0).length;

  let streakDays = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].steps <= 0) break;
    streakDays += 1;
  }

  const byWeekday = new Map<number, { sum: number; count: number }>();
  for (const row of sorted) {
    const wd = new Date(`${row.date}T12:00:00`).getDay();
    const cur = byWeekday.get(wd) ?? { sum: 0, count: 0 };
    cur.sum += row.steps;
    cur.count += 1;
    byWeekday.set(wd, cur);
  }
  let busiestWeekday: DailyStepsInsight["busiestWeekday"] = null;
  for (const [wd, agg] of byWeekday) {
    const avg = agg.sum / agg.count;
    if (!busiestWeekday || avg > busiestWeekday.avgSteps) {
      busiestWeekday = { label: WEEKDAY_LABELS[wd], avgSteps: Math.round(avg) };
    }
  }

  return { avgSteps, bestDay, activeDays, streakDays, busiestWeekday };
}
