import type {CycleImpact} from '../api/cycle';
import {TAB} from '../navigation/routes';
import type {DailyState} from './dailyState';

export type GuidanceTone = 'calm' | 'warm' | 'alert' | 'celebrate';

export type GuidanceCard = {
  id: string;
  title: string;
  body: string;
  icon: string;
  tab: string;
  tone: GuidanceTone;
};

type GuidanceInput = {
  daily: DailyState;
  streak: number;
  stretchRecent: boolean;
  daysSinceWorkout: number;
  kcalToday: number;
  proteinToday: number;
  cycle?: CycleImpact | null;
  isFemale: boolean;
  lastWorkoutTitle?: string | null;
};

export function buildGuidanceCards(input: GuidanceInput): GuidanceCard[] {
  const cards: GuidanceCard[] = [];
  const {
    daily,
    streak,
    stretchRecent,
    daysSinceWorkout,
    kcalToday,
    proteinToday,
    cycle,
    isFemale,
    lastWorkoutTitle,
  } = input;

  if (
    daily.kind === 'recovery_day' ||
    daily.kind === 'high_fatigue' ||
    daily.intensity === 'rest' ||
    daily.intensity === 'light'
  ) {
    cards.push({
      id: 'recovery-tip',
      title: 'Восстановление сегодня',
      body: 'Сон, вода и 10–15 минут мобильности дадут больше, чем тяжёлая сессия на износ.',
      icon: 'moon-outline',
      tab: TAB.Workouts,
      tone: 'calm',
    });
  }

  if (!stretchRecent && daysSinceWorkout <= 3) {
    cards.push({
      id: 'mobility',
      title: 'Мобильность',
      body: 'Короткая растяжка снизит скованность и ускорит восстановление после недавней нагрузки.',
      icon: 'body-outline',
      tab: TAB.Workouts,
      tone: 'calm',
    });
  }

  if (kcalToday === 0) {
    cards.push({
      id: 'nutrition',
      title: 'Питание',
      body: 'Отметьте приёмы пищи — так проще держать энергию и баланс белка в течение дня.',
      icon: 'nutrition-outline',
      tab: TAB.Food,
      tone: 'warm',
    });
  } else if (proteinToday > 0 && proteinToday < 80) {
    cards.push({
      id: 'protein',
      title: 'Белок за день',
      body: `Сейчас около ${Math.round(proteinToday)} г — при активности часто комфортнее 1.6–2 г/кг.`,
      icon: 'egg-outline',
      tab: TAB.Food,
      tone: 'warm',
    });
  }

  if (isFemale && cycle?.phase_label && daily.kind !== 'cycle_focus') {
    cards.push({
      id: 'cycle-hint',
      title: cycle.phase_label,
      body:
        cycle.recovery_note ||
        cycle.message ||
        'Учитывайте фазу цикла при планировании нагрузки.',
      icon: 'flower-outline',
      tab: TAB.Analytics,
      tone: 'calm',
    });
  }

  if (streak >= 3) {
    cards.push({
      id: 'streak',
      title: `${streak} дня подряд`,
      body: 'Стабильный ритм — один из сильнейших факторов прогресса. Не забывайте про восстановление.',
      icon: 'flame-outline',
      tab: TAB.Workouts,
      tone: 'celebrate',
    });
  } else if (streak === 1) {
    cards.push({
      id: 'streak-start',
      title: 'Хорошее начало',
      body: 'Первый день в серии — завтра будет проще продолжить.',
      icon: 'sparkles-outline',
      tab: TAB.Workouts,
      tone: 'celebrate',
    });
  }

  if (lastWorkoutTitle && daysSinceWorkout <= 2) {
    cards.push({
      id: 'recent',
      title: 'Недавняя активность',
      body: `«${lastWorkoutTitle}» — сегодня ориентируйтесь на рекомендованную интенсивность выше.`,
      icon: 'time-outline',
      tab: TAB.Workouts,
      tone: 'calm',
    });
  }

  if (daily.kind === 'high_readiness' && daysSinceWorkout >= 2) {
    cards.push({
      id: 'go-train',
      title: 'Окно для работы',
      body: 'Самочувствие и баланс нагрузки благоприятны — хороший день для целевой тренировки.',
      icon: 'barbell-outline',
      tab: TAB.Workouts,
      tone: 'warm',
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: 'welcome',
      title: 'Ваш день',
      body: 'Откройте тренировки, питание или тело — Forma подстроится под ваш ритм.',
      icon: 'heart-outline',
      tab: TAB.Workouts,
      tone: 'calm',
    });
  }

  return cards.slice(0, 5);
}
