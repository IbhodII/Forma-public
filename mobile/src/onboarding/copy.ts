import type {
  ActivityLevel,
  OnboardingGoal,
  RecoveryFocus,
  TrainingStyle,
  WellnessPriority,
} from './types';

export const GOAL_OPTIONS: {id: OnboardingGoal; title: string; subtitle: string; icon: string}[] = [
  {
    id: 'recovery',
    title: 'Восстановление',
    subtitle: 'Понимать, когда телу нужен отдых',
    icon: 'leaf-outline',
  },
  {
    id: 'performance',
    title: 'Прогресс',
    subtitle: 'Тренироваться умнее, а не только тяжелее',
    icon: 'trending-up-outline',
  },
  {
    id: 'balance',
    title: 'Баланс',
    subtitle: 'Нагрузка и отдых в одной картине',
    icon: 'scale-outline',
  },
  {
    id: 'awareness',
    title: 'Тело',
    subtitle: 'Замеры, состав, динамика',
    icon: 'body-outline',
  },
  {
    id: 'nutrition',
    title: 'Питание',
    subtitle: 'Энергия и белок в ритме дня',
    icon: 'nutrition-outline',
  },
];

export const ACTIVITY_OPTIONS: {
  id: ActivityLevel;
  title: string;
  subtitle: string;
}[] = [
  {id: 'light', title: 'Спокойный ритм', subtitle: '1–2 активных дня в неделю'},
  {id: 'moderate', title: 'Регулярно', subtitle: '3–4 тренировки в неделю'},
  {id: 'high', title: 'Интенсивно', subtitle: '5+ дней или двойные сессии'},
];

export const RECOVERY_OPTIONS: {
  id: RecoveryFocus;
  title: string;
  subtitle: string;
  icon: string;
}[] = [
  {id: 'sleep', title: 'Сон', subtitle: 'Главный рычаг восстановления', icon: 'moon-outline'},
  {
    id: 'mobility',
    title: 'Мобильность',
    subtitle: 'Растяжка и лёгкое движение',
    icon: 'body-outline',
  },
  {
    id: 'load_balance',
    title: 'Нагрузка',
    subtitle: 'CTL, усталость, готовность',
    icon: 'pulse-outline',
  },
  {
    id: 'stress',
    title: 'Ресурс',
    subtitle: 'Меньше перегруза, больше устойчивости',
    icon: 'water-outline',
  },
];

export const TRAINING_OPTIONS: {
  id: TrainingStyle;
  title: string;
  subtitle: string;
  icon: string;
}[] = [
  {id: 'strength', title: 'Силовые', subtitle: 'Веса, подходы, прогрессия', icon: 'barbell-outline'},
  {id: 'cardio', title: 'Кардио', subtitle: 'Бег, велосипед, зоны пульса', icon: 'bicycle-outline'},
  {id: 'mixed', title: 'Смешанный', subtitle: 'Сила + выносливость', icon: 'fitness-outline'},
  {id: 'flexible', title: 'Гибкий', subtitle: 'Без жёсткого шаблона', icon: 'shuffle-outline'},
];

export const WELLNESS_OPTIONS: {
  id: WellnessPriority;
  title: string;
  icon: string;
}[] = [
  {id: 'energy', title: 'Энергия дня', icon: 'flash-outline'},
  {id: 'sleep', title: 'Качество сна', icon: 'bed-outline'},
  {id: 'strength', title: 'Сила', icon: 'barbell-outline'},
  {id: 'mobility', title: 'Подвижность', icon: 'walk-outline'},
  {id: 'mindfulness', title: 'Спокойствие', icon: 'heart-outline'},
];

export function buildPersonalizedSummary(draft: {
  goals: OnboardingGoal[];
  recoveryFocus: RecoveryFocus | null;
  trainingStyle: TrainingStyle | null;
}): string {
  const parts: string[] = [];

  if (draft.goals.includes('recovery') || draft.recoveryFocus === 'load_balance') {
    parts.push('Forma будет подсказывать, когда снижать нагрузку и уделять восстановлению.');
  }
  if (draft.goals.includes('performance') || draft.trainingStyle === 'strength') {
    parts.push('Прогрессия и прошлые результаты помогут двигаться целенаправленно.');
  }
  if (draft.goals.includes('balance')) {
    parts.push('Главный экран покажет готовность и рекомендации на сегодня — без таблиц.');
  }
  if (draft.goals.includes('nutrition')) {
    parts.push('Питание впишется в общую картину энергии и восстановления.');
  }

  if (parts.length === 0) {
    return 'Forma соберёт ваш ритм из тренировок, восстановления и самочувствия — спокойно и по делу.';
  }

  return parts.slice(0, 3).join(' ');
}
