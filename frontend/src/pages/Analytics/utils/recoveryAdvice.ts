import type { CtlAtlTsbPoint, DailyTrimpPoint } from "../../../types";

export interface SleepSummary {
  has_data: boolean;
  days: number;
  last_night_hours: number | null;
  last_night_date: string | null;
  avg_hours: number | null;
  consistency_score: number | null;
  source: string | null;
  nights_count: number;
  hc_analytics_enabled?: boolean;
  hc_stale?: boolean;
  hc_stale_warning?: string | null;
  sleep_debt_hours?: number | null;
}

export interface DeficitStatus {
  days_over_limit?: number;
  window_days?: number;
}

export interface RecoveryAdvice {
  tone: "danger" | "warning" | "neutral" | "good";
  title: string;
  message: string;
  extra?: string;
  factors: string[];
  sleepSource?: string | null;
  hcStaleWarning?: string | null;
}

export interface RecoveryAdviceInput {
  ctlSeries: CtlAtlTsbPoint[];
  dailyTrimp: DailyTrimpPoint[];
  sleepSummary?: SleepSummary | null;
  deficitStatus?: DeficitStatus | null;
}

function heavyTrimpRecent(dailyTrimp: DailyTrimpPoint[]): boolean {
  const today = new Date();
  const heavyCutoff = new Date(today);
  heavyCutoff.setDate(heavyCutoff.getDate() - 2);
  const heavyFrom = heavyCutoff.toISOString().slice(0, 10);
  return dailyTrimp.some((d) => d.date >= heavyFrom && d.trimp > 200);
}

function shortSleep(sleepSummary?: SleepSummary | null): boolean {
  return (
    sleepSummary?.has_data === true &&
    sleepSummary.avg_hours != null &&
    sleepSummary.avg_hours < 6
  );
}

function poorSleepStreak(sleepSummary?: SleepSummary | null): boolean {
  return (
    sleepSummary?.has_data === true &&
    sleepSummary.avg_hours != null &&
    sleepSummary.avg_hours < 6.5 &&
    (sleepSummary.nights_count ?? 0) >= 3
  );
}

/** Объяснимые факторы усталости (rule-based). */
export function buildRecoveryFactors(input: RecoveryAdviceInput): RecoveryAdvice {
  const { ctlSeries, dailyTrimp, sleepSummary, deficitStatus } = input;
  const base = buildRecoveryAdvice(ctlSeries, dailyTrimp);
  const factors: string[] = [];
  let tone = base.tone;
  let message = base.message;
  let sleepSource: string | null = null;
  let hcStaleWarning: string | null = null;

  const last7 = ctlSeries.slice(-7);
  const tsb = last7.length ? last7[last7.length - 1].tsb : null;

  if (tsb != null && Number.isFinite(tsb)) {
    if (tsb < -30) {
      factors.push(`TSB ${Math.round(tsb)} — высокая усталость`);
    } else if (tsb <= -5) {
      factors.push(`TSB ${Math.round(tsb)} — накопленная усталость`);
    }
  }

  if (heavyTrimpRecent(dailyTrimp)) {
    factors.push("TRIMP > 200 за последние 3 дня");
  }

  if (sleepSummary?.hc_stale && sleepSummary.hc_stale_warning) {
    hcStaleWarning = sleepSummary.hc_stale_warning;
    factors.push(`Сон HC устарел — ${sleepSummary.hc_stale_warning}`);
    if (tone === "neutral" || tone === "good") {
      tone = "warning";
    }
  } else if (sleepSummary?.has_data && sleepSummary.avg_hours != null) {
    sleepSource = sleepSummary.source;
    factors.push(
      `Сон в среднем ${sleepSummary.avg_hours.toFixed(1)} ч за ${sleepSummary.days} дней`,
    );
    if (
      sleepSummary.last_night_hours != null &&
      sleepSummary.avg_hours != null &&
      Math.abs(sleepSummary.last_night_hours - sleepSummary.avg_hours) >= 1
    ) {
      factors.push(
        `Прошлая ночь: ${sleepSummary.last_night_hours.toFixed(1)} ч (среднее ${sleepSummary.avg_hours.toFixed(1)} ч)`,
      );
    }
    if (sleepSummary.consistency_score != null && sleepSummary.consistency_score < 60) {
      factors.push(`Нестабильный режим сна (оценка ${Math.round(sleepSummary.consistency_score)}%)`);
    }
    if (sleepSummary.sleep_debt_hours != null && sleepSummary.sleep_debt_hours > 0) {
      factors.push(`Оценка «долга сна»: ~${sleepSummary.sleep_debt_hours.toFixed(1)} ч`);
    }
    if (shortSleep(sleepSummary)) {
      factors.push("Короткий сон может усиливать усталость");
    }
  }

  if (deficitStatus?.days_over_limit != null && deficitStatus.window_days) {
    const { days_over_limit, window_days } = deficitStatus;
    if (days_over_limit >= 3) {
      factors.push(`Дефицит выше лимита ${days_over_limit} из ${window_days} дней`);
    }
  }

  if (poorSleepStreak(sleepSummary) && (tone === "warning" || tone === "danger")) {
    message = `${message} Низкий сон усиливает риск перегрузки.`;
  } else if (shortSleep(sleepSummary) && tone === "neutral") {
    tone = "warning";
    message = `${message} Средний сон ниже 6 ч — учитывайте восстановление.`;
  }

  return { ...base, tone, message, factors, sleepSource, hcStaleWarning };
}

/** Рекомендации по TSB за 7 дней и тяжёлым TRIMP за 3 дня. */
function buildRecoveryAdvice(
  ctlSeries: CtlAtlTsbPoint[],
  dailyTrimp: DailyTrimpPoint[],
): RecoveryAdvice {
  const last7 = ctlSeries.slice(-7);
  const tsb = last7.length ? last7[last7.length - 1].tsb : null;

  if (heavyTrimpRecent(dailyTrimp)) {
    return {
      tone: "warning",
      title: "Высокая нагрузка",
      message: "За последние 3 дня были тяжёлые тренировки (TRIMP > 200).",
      factors: [],
    };
  }

  if (tsb == null || !Number.isFinite(tsb)) {
    return {
      tone: "neutral",
      title: "Недостаточно данных",
      message: "Нет TSB за последние 7 дней — рекомендации ограничены.",
      factors: [],
    };
  }

  if (tsb < -30) {
    return {
      tone: "danger",
      title: "Перегруз",
      message: `TSB ${Math.round(tsb)} — высокий риск перетренированности. Снизьте объём.`,
      factors: [],
    };
  }

  if (tsb <= -5) {
    return {
      tone: "warning",
      title: "Накопленная усталость",
      message: `TSB ${Math.round(tsb)} — умеренная усталость. Планируйте восстановление.`,
      factors: [],
    };
  }

  if (tsb >= 15) {
    return {
      tone: "good",
      title: "Хорошая форма",
      message: `TSB ${Math.round(tsb)} — запас для качественных тренировок.`,
      factors: [],
    };
  }

  return {
    tone: "neutral",
    title: "Баланс",
    message: `TSB ${Math.round(tsb)} — нагрузка в рабочем диапазоне.`,
    factors: [],
  };
}
