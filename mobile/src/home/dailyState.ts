import type {CycleImpact} from '../api/cycle';

export type ReadinessLevel = 'high' | 'moderate' | 'low' | 'unknown';
export type FatigueLevel = 'low' | 'moderate' | 'elevated' | 'unknown';
export type IntensityLevel = 'rest' | 'light' | 'moderate' | 'full';

export type DailyStateKind =
  | 'cycle_focus'
  | 'recovery_day'
  | 'high_fatigue'
  | 'moderate_fatigue'
  | 'high_readiness'
  | 'good_recovery'
  | 'return_to_movement'
  | 'building_momentum'
  | 'getting_started';

export type DailyState = {
  kind: DailyStateKind;
  headline: string;
  subheadline: string;
  narrative: string;
  readiness: ReadinessLevel;
  fatigue: FatigueLevel;
  intensity: IntensityLevel;
  readinessLabel: string;
  fatigueLabel: string;
  intensityLabel: string;
};

export type DailyStateInput = {
  tsb: number | null;
  atl: number | null;
  ctl: number | null;
  daysSinceWorkout: number;
  lastWorkoutDate: string | null;
  streak: number;
  stretchRecent: boolean;
  cycle?: CycleImpact | null;
  isFemale: boolean;
};

const READINESS: Record<ReadinessLevel, string> = {
  high: 'Высокая',
  moderate: 'Умеренная',
  low: 'Сниженная',
  unknown: '—',
};

const FATIGUE: Record<FatigueLevel, string> = {
  low: 'Низкая',
  moderate: 'Умеренная',
  elevated: 'Повышенная',
  unknown: '—',
};

const INTENSITY: Record<IntensityLevel, string> = {
  rest: 'Отдых',
  light: 'Лёгкая',
  moderate: 'Умеренная',
  full: 'Полная',
};

function formatShortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function recentWorkoutPhrase(daysSince: number, lastDate: string | null): string {
  if (daysSince === 0) {
    return 'Сегодня уже была активность — учитывайте это в плане на остаток дня. ';
  }
  if (daysSince === 1 && lastDate) {
    return `Вчера была нагрузка (${formatShortDate(lastDate)}). `;
  }
  if (daysSince === 2 && lastDate) {
    return `Нагрузка была позавчера — восстановление ещё идёт. `;
  }
  return '';
}

export function buildDailyState(input: DailyStateInput): DailyState {
  const {
    tsb,
    atl,
    ctl,
    daysSinceWorkout,
    lastWorkoutDate,
    streak,
    stretchRecent,
    cycle,
    isFemale,
  } = input;

  const prefix = recentWorkoutPhrase(daysSinceWorkout, lastWorkoutDate);

  if (isFemale && cycle?.tracking !== false && cycle?.phase_label) {
    const narrative =
      cycle.recovery_note ||
      cycle.message ||
      'Учитывайте фазу цикла при выборе интенсивности, сна и питания — организм сейчас чувствителен к нагрузке.';
  return {
      kind: 'cycle_focus',
      headline: cycle.phase_label,
      subheadline: 'Ритм цикла сегодня',
      narrative: prefix + narrative,
      readiness: 'moderate',
      fatigue: 'moderate',
      intensity: 'light',
      readinessLabel: READINESS.moderate,
      fatigueLabel: FATIGUE.moderate,
      intensityLabel: INTENSITY.light,
    };
  }

  if (tsb == null && ctl == null) {
    return {
      kind: 'getting_started',
      headline: 'Начнём сегодня',
      subheadline: 'Пока мало данных',
      narrative:
        prefix +
        'Запишите тренировку, питание или растяжку — Forma соберёт картину восстановления и подскажет, как двигаться дальше.',
      readiness: 'unknown',
      fatigue: 'unknown',
      intensity: 'moderate',
      readinessLabel: 'Собираем',
      fatigueLabel: '—',
      intensityLabel: INTENSITY.moderate,
    };
  }

  if (tsb != null && tsb < -20) {
    return {
      kind: 'high_fatigue',
      headline: 'Высокая усталость',
      subheadline: 'Нервная система под нагрузкой',
      narrative:
        prefix +
        'Тело накапливает усталость быстрее, чем успевает восстанавливаться. Сегодня лучше отдых, прогулка, мобильность или очень лёгкое кардио — без тяжёлых сессий.',
      readiness: 'low',
      fatigue: 'elevated',
      intensity: 'rest',
      readinessLabel: READINESS.low,
      fatigueLabel: FATIGUE.elevated,
      intensityLabel: INTENSITY.rest,
    };
  }

  if (tsb != null && tsb < -8) {
    return {
      kind: 'recovery_day',
      headline: 'День восстановления',
      subheadline: 'Умеренная усталость',
      narrative:
        prefix +
        'Форма и усталость не в балансе — это нормальный этап после нагрузки. Дайте телу 1–2 дня лёгкой активности, сна и мобильности перед следующей интенсивной работой.',
      readiness: 'low',
      fatigue: 'moderate',
      intensity: 'light',
      readinessLabel: READINESS.low,
      fatigueLabel: FATIGUE.moderate,
      intensityLabel: INTENSITY.light,
    };
  }

  if (daysSinceWorkout >= 4) {
    return {
      kind: 'return_to_movement',
      headline: 'Пора вернуться к движению',
      subheadline: 'Долгая пауза',
      narrative:
        `Уже ${daysSinceWorkout} дней без записанной активности. ` +
        'Короткая тренировка или растяжка помогут вернуть ритм — начните с умеренной интенсивности.',
      readiness: 'moderate',
      fatigue: 'low',
      intensity: 'moderate',
      readinessLabel: READINESS.moderate,
      fatigueLabel: FATIGUE.low,
      intensityLabel: INTENSITY.moderate,
    };
  }

  if (tsb != null && tsb > 10) {
    return {
      kind: 'high_readiness',
      headline: 'Высокая готовность',
      subheadline: 'Хороший запас формы',
      narrative:
        prefix +
        (streak >= 3
          ? `Серия ${streak} дней поддерживает ритм. `
          : '') +
        'Восстановление опережает усталость — подходящий день для качественной тренировки или нового объёма, если чувствуете бодрость.',
      readiness: 'high',
      fatigue: 'low',
      intensity: 'full',
      readinessLabel: READINESS.high,
      fatigueLabel: FATIGUE.low,
      intensityLabel: INTENSITY.full,
    };
  }

  if (daysSinceWorkout <= 1 && !stretchRecent) {
    return {
      kind: 'building_momentum',
      headline: 'Хорошее восстановление',
      subheadline: 'Ритм в движении',
      narrative:
        prefix +
        'Нагрузка недавняя — добавьте мобильность или лёгкую растяжку, чтобы мышцы и суставы восстановились быстрее.',
      readiness: 'moderate',
      fatigue: 'moderate',
      intensity: 'light',
      readinessLabel: READINESS.moderate,
      fatigueLabel: FATIGUE.moderate,
      intensityLabel: INTENSITY.light,
    };
  }

  const atlHigh = atl != null && ctl != null && atl > ctl * 1.05;
  if (atlHigh) {
    return {
      kind: 'moderate_fatigue',
      headline: 'Умеренная усталость',
      subheadline: 'Нагрузка накапливается',
      narrative:
        prefix +
        'Недавняя активность ещё «весит» в организме. Сегодня разумна умеренная работа — без максимальных весов и длинного кардио на пределе.',
      readiness: 'moderate',
      fatigue: 'moderate',
      intensity: 'moderate',
      readinessLabel: READINESS.moderate,
      fatigueLabel: FATIGUE.moderate,
      intensityLabel: INTENSITY.moderate,
    };
  }

  return {
    kind: 'good_recovery',
    headline: 'Сбалансированное состояние',
    subheadline: 'Готовность в норме',
    narrative:
      prefix +
      (streak >= 2
        ? `Активность ${streak} дней подряд — устойчивый ритм. `
        : '') +
      'Восстановление и нагрузка в равновесии. Можно планировать обычную тренировку, ориентируясь на самочувствие.',
    readiness: 'moderate',
    fatigue: 'low',
    intensity: 'moderate',
    readinessLabel: READINESS.moderate,
    fatigueLabel: FATIGUE.low,
    intensityLabel: INTENSITY.moderate,
  };
}
