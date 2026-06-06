import type {CtlAtlTsbPoint, DailyTrimpPoint} from '../api/analytics';

export interface SleepSummary {
  has_data: boolean;
  days: number;
  last_night_hours: number | null;
  last_night_date: string | null;
  avg_hours: number | null;
  consistency_score: number | null;
  source: string | null;
  nights_count: number;
}

export interface DeficitStatus {
  days_over_limit?: number;
  window_days?: number;
}

export interface RecoveryAdvice {
  tone: 'danger' | 'warning' | 'neutral' | 'good';
  title: string;
  message: string;
  extra?: string;
  factors: string[];
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
  return dailyTrimp.some(d => d.date >= heavyFrom && d.trimp > 200);
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
  const {ctlSeries, dailyTrimp, sleepSummary, deficitStatus} = input;
  const base = buildRecoveryAdvice(ctlSeries, dailyTrimp);
  const factors: string[] = [];

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
    factors.push('TRIMP > 200 за последние 3 дня');
  }

  if (sleepSummary?.has_data && sleepSummary.avg_hours != null) {
    const src = sleepSummary.source === 'health_connect' ? ' (HC)' : '';
    factors.push(`Сон в среднем ${sleepSummary.avg_hours.toFixed(1)} ч за ${sleepSummary.days} дней${src}`);
    if (shortSleep(sleepSummary)) {
      factors.push('Короткий сон может усиливать усталость');
    }
  }

  if (deficitStatus?.days_over_limit != null && deficitStatus.window_days) {
    const {days_over_limit, window_days} = deficitStatus;
    if (days_over_limit >= 3) {
      factors.push(`Дефицит выше лимита ${days_over_limit} из ${window_days} дней`);
    }
  }

  let tone = base.tone;
  let message = base.message;

  if (poorSleepStreak(sleepSummary) && (tone === 'warning' || tone === 'danger')) {
    message = `${message} Низкий сон усиливает риск перегрузки.`;
  } else if (shortSleep(sleepSummary) && tone === 'neutral') {
    tone = 'warning';
    message = `${message} Средний сон ниже 6 ч — учитывайте восстановление.`;
  }

  return {...base, tone, message, factors};
}

/** Рекомендации по TSB за 7 дней и тяжёлым TRIMP за 3 дня. */
export function buildRecoveryAdvice(
  ctlSeries: CtlAtlTsbPoint[],
  dailyTrimp: DailyTrimpPoint[],
): RecoveryAdvice {
  const last7 = ctlSeries.slice(-7);
  const tsb = last7.length ? last7[last7.length - 1].tsb : null;

  if (heavyTrimpRecent(dailyTrimp)) {
    return {
      tone: 'warning',
      title: 'Тяжёлая нагрузка на днях',
      message:
        'За последние 3 дня была тренировка с TRIMP > 200. Рекомендуется лёгкий день или полный отдых.',
      extra: 'Дайте организму время восстановиться после высокой кардио-нагрузки.',
      factors: [],
    };
  }

  if (tsb == null || !Number.isFinite(tsb)) {
    return {
      tone: 'neutral',
      title: 'Недостаточно данных',
      message: 'Добавьте кардио с записью пульса, чтобы получать рекомендации по восстановлению.',
      factors: [],
    };
  }

  if (tsb < -30) {
    return {
      tone: 'danger',
      title: 'Риск перетренированности',
      message:
        'Высокий риск перетренированности. Сделайте 2–3 дня активного отдыха, снизьте интенсивность.',
      factors: [],
    };
  }
  if (tsb <= -5) {
    return {
      tone: 'warning',
      title: 'Накоплена усталость',
      message:
        'Накоплена усталость. Лёгкая тренировка или отдых помогут восстановиться.',
      factors: [],
    };
  }
  if (tsb <= 5) {
    return {
      tone: 'neutral',
      title: 'На грани',
      message: 'Вы на грани. Контролируйте самочувствие.',
      factors: [],
    };
  }
  return {
    tone: 'good',
    title: 'Хорошее восстановление',
    message: 'Вы хорошо восстановились. Можно проводить интенсивную тренировку.',
    factors: [],
  };
}
