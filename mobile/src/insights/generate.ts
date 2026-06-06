import {TAB} from '../navigation/routes';
import {
  consecutiveAtlRise,
  consecutiveTsbFall,
  ctlTrendDelta,
  weekOverWeekTsbDelta,
} from './signals';
import type {Insight, InsightContext, InsightSurface, PostWorkoutEvent} from './types';

const SURFACE_HOME: InsightSurface[] = ['home'];
const SURFACE_ANALYTICS: InsightSurface[] = ['analytics'];
const SURFACE_RECOVERY: InsightSurface[] = ['recovery', 'home'];
const SURFACE_ALL: InsightSurface[] = ['home', 'analytics', 'recovery'];

function push(out: Insight[], insight: Insight) {
  if (out.some(i => i.id === insight.id)) {
    return;
  }
  out.push(insight);
}

export function generateInsights(
  ctx: InsightContext,
  surface: InsightSurface,
  limit = 5,
): Insight[] {
  const out: Insight[] = [];
  const {tsb, atl, ctl, tsbSeries} = ctx;

  const atlRiseDays = consecutiveAtlRise(tsbSeries, 4);
  const tsbFallDays = consecutiveTsbFall(tsbSeries, 4);
  const fatigueStreak = Math.max(atlRiseDays, tsbFallDays);

  if (fatigueStreak >= 3) {
    push(out, {
      id: 'fatigue-streak',
      category: 'fatigue',
      tone: 'alert',
      title: 'Усталость растёт',
      body: `Нагрузка опережает восстановление уже ${fatigueStreak + 1} дня подряд. Сегодня уместны отдых, сон и лёгкая активность.`,
      priority: 92,
      surfaces: [...SURFACE_ALL],
      icon: 'pulse-outline',
      tab: TAB.Workouts,
    });
  }

  const tsbWow = weekOverWeekTsbDelta(tsbSeries);
  if (tsbWow != null && tsbWow >= 4) {
    push(out, {
      id: 'recovery-improved-week',
      category: 'recovery',
      tone: 'positive',
      title: 'Восстановление лучше',
      body: 'Баланс формы за неделю выше, чем на прошлой — организм успевает отдыхать между нагрузками.',
      priority: 78,
      surfaces: [...SURFACE_HOME, 'analytics'],
      icon: 'leaf-outline',
      tab: TAB.Analytics,
    });
  } else if (tsbWow != null && tsbWow <= -5) {
    push(out, {
      id: 'recovery-worse-week',
      category: 'fatigue',
      tone: 'warm',
      title: 'Неделя была тяжелее',
      body: 'За последние 7 дней усталость накапливалась быстрее, чем на предыдущей. Запланируйте лёгкий день.',
      priority: 80,
      surfaces: [...SURFACE_ALL],
      icon: 'cloud-outline',
      tab: TAB.Workouts,
    });
  }

  if (tsb != null && tsb < -18) {
    push(out, {
      id: 'fatigue-high',
      category: 'fatigue',
      tone: 'alert',
      title: 'Высокая усталость',
      body: 'Сейчас разумно снизить интенсивность: тяжёлая работа вряд ли принесёт пользу без риска перегруза.',
      priority: 95,
      surfaces: [...SURFACE_RECOVERY, 'analytics'],
      icon: 'bed-outline',
      tab: TAB.Workouts,
    });
  } else if (tsb != null && tsb < -8) {
    push(out, {
      id: 'recovery-day',
      category: 'recovery',
      tone: 'calm',
      title: 'Фаза восстановления',
      body: 'Недавняя нагрузка ещё «весит». Дайте телу 1–2 дня лёгкой активности перед следующей интенсивной сессией.',
      priority: 85,
      surfaces: [...SURFACE_RECOVERY, 'home', 'analytics'],
      icon: 'moon-outline',
      tab: TAB.Workouts,
    });
  }

  if (atl != null && ctl != null && atl > ctl * 1.06) {
    push(out, {
      id: 'workload-above-form',
      category: 'workload',
      tone: 'warm',
      title: 'Нагрузка выше обычного',
      body: 'Недавняя активность сильнее, чем ваш текущий уровень формы. Следите за сном и не добавляйте объём без необходимости.',
      priority: 72,
      surfaces: [...SURFACE_ANALYTICS, 'home'],
      icon: 'trending-up-outline',
      tab: TAB.Analytics,
    });
  }

  if (ctx.trimpTrendPerDay != null && ctx.trimpTrendPerDay > 2 && ctx.trimpSumPeriod > 0) {
    push(out, {
      id: 'cardio-volume-up',
      category: 'workload',
      tone: 'warm',
      title: 'Кардио набирает обороты',
      body: 'Объём кардио за период растёт. Чередуйте тяжёлые дни с восстановительными, чтобы не копить усталость.',
      priority: 68,
      surfaces: ['analytics'],
      icon: 'bicycle-outline',
      tab: TAB.Analytics,
    });
  }

  if (ctx.workoutsLast7d > 0 && ctx.workoutsPrev7d > 0) {
    const ratio = ctx.workoutsLast7d / ctx.workoutsPrev7d;
    if (ratio >= 1.4 && ctx.workoutsLast7d >= 4) {
      push(out, {
        id: 'activity-spike',
        category: 'workload',
        tone: 'warm',
        title: 'Активных дней больше',
        body: `За 7 дней — ${ctx.workoutsLast7d} с тренировками против ${ctx.workoutsPrev7d} на прошлой неделе. Не забудьте про восстановление.`,
        priority: 70,
        surfaces: ['home', 'analytics'],
        icon: 'calendar-outline',
        tab: TAB.Analytics,
      });
    }
  }

  const ctlDelta = ctlTrendDelta(tsbSeries);
  if (ctlDelta != null && ctlDelta >= 2) {
    push(out, {
      id: 'form-building',
      category: 'progression',
      tone: 'positive',
      title: 'Форма набирается',
      body: 'При регулярной нагрузке тренированность растёт — вы в фазе устойчивого прогресса.',
      priority: 62,
      surfaces: ['analytics', 'home'],
      icon: 'trending-up-outline',
      tab: TAB.Analytics,
    });
  }

  if (ctx.hadRestBeforeLastWorkout && tsb != null && tsb > 2) {
    push(out, {
      id: 'rest-then-ready',
      category: 'wellness',
      tone: 'positive',
      title: 'После отдыха — лучше',
      body: 'Перед последней нагрузкой был отдых — сейчас баланс это подтверждает. Такой ритм обычно даёт более качественные сессии.',
      priority: 58,
      surfaces: ['home', 'analytics'],
      icon: 'sunny-outline',
      tab: TAB.Workouts,
    });
  }

  if (!ctx.stretchRecent && ctx.daysSinceWorkout <= 3) {
    push(out, {
      id: 'mobility-recovery',
      category: 'mobility',
      tone: 'calm',
      title: 'Мобильность поможет',
      body: 'Короткая растяжка сегодня может ускорить восстановление после недавней нагрузки.',
      priority: 74,
      surfaces: [...SURFACE_RECOVERY, 'home'],
      icon: 'body-outline',
      tab: TAB.Workouts,
    });
  }

  if (ctx.isFemale && ctx.cycle?.phase_label && ctx.cycle.tracking !== false) {
    push(out, {
      id: 'cycle-guidance',
      category: 'cycle',
      tone: 'calm',
      title: ctx.cycle.phase_label,
      body:
        ctx.cycle.recovery_note ||
        ctx.cycle.message ||
        'Учитывайте фазу цикла при выборе интенсивности и восстановления.',
      priority: 88,
      surfaces: ['home', 'recovery'],
      icon: 'flower-outline',
      tab: TAB.Analytics,
    });
  }

  if (tsb != null && tsb > 10) {
    push(out, {
      id: 'readiness-high',
      category: 'wellness',
      tone: 'positive',
      title: 'Хороший запас готовности',
      body: 'Восстановление опережает усталость — подходящее окно для целевой тренировки, если чувствуете бодрость.',
      priority: 65,
      surfaces: ['home', 'analytics'],
      icon: 'flash-outline',
      tab: TAB.Workouts,
    });
  }

  if (ctx.streak >= 3) {
    push(out, {
      id: 'streak-steady',
      category: 'progression',
      tone: 'positive',
      title: `${ctx.streak} дня подряд`,
      body: 'Ритм держится — чередуйте нагрузку с восстановлением, чтобы серия работала на вас.',
      priority: 45,
      surfaces: ['home'],
      icon: 'flame-outline',
      tab: TAB.Workouts,
    });
  }

  if (ctx.kcalToday === 0 && (ctx.workoutsLast7d > 0 || ctx.daysSinceWorkout <= 1)) {
    push(out, {
      id: 'nutrition-gap',
      category: 'wellness',
      tone: 'neutral',
      title: 'Питание за день',
      body: 'Приёмы пищи не отмечены — энергия и восстановление проще отслеживать с заполненным дневником.',
      priority: 40,
      surfaces: ['home'],
      icon: 'nutrition-outline',
      tab: TAB.Food,
    });
  }

  if (out.length === 0) {
    if (tsb == null && ctl == null) {
      push(out, {
        id: 'onboard',
        category: 'wellness',
        tone: 'neutral',
        title: 'Собираем картину',
        body: 'Запишите тренировку или кардио — Forma начнёт подсказывать, как балансировать нагрузку и отдых.',
        priority: 10,
        surfaces: [...SURFACE_ALL],
        icon: 'sparkles-outline',
        tab: TAB.Workouts,
      });
    } else {
      push(out, {
        id: 'balanced',
        category: 'wellness',
        tone: 'calm',
        title: 'Сбалансированное состояние',
        body: 'Нагрузка и восстановление в равновесии. Ориентируйтесь на самочувствие при планировании дня.',
        priority: 20,
        surfaces: [...SURFACE_ALL],
        icon: 'checkmark-circle-outline',
      });
    }
  }

  return out
    .filter(i => i.surfaces.includes(surface))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export function generatePostWorkoutInsights(
  ctx: InsightContext,
  event: PostWorkoutEvent,
): Insight[] {
  const out: Insight[] = [];

  if (event.kind === 'strength' && (event.setsOrMinutes ?? 0) >= 12) {
    push(out, {
      id: 'post-heavy-strength',
      category: 'recovery',
      tone: 'calm',
      title: 'Сессия записана',
      body: 'Объём заметный — в ближайшие 24–48 часов уместны сон, питание и лёгкая мобильность.',
      priority: 90,
      surfaces: ['post_workout'],
      icon: 'checkmark-circle-outline',
    });
  } else if (event.kind === 'strength') {
    push(out, {
      id: 'post-strength',
      category: 'wellness',
      tone: 'positive',
      title: 'Сессия записана',
      body: 'Нагрузка учтена. Завтра ориентируйтесь на готовность — при усталости выберите восстановление.',
      priority: 85,
      surfaces: ['post_workout'],
      icon: 'checkmark-circle-outline',
    });
  }

  if (event.kind === 'cardio') {
    push(out, {
      id: 'post-cardio',
      category: 'recovery',
      tone: 'calm',
      title: 'Кардио сохранено',
      body: 'Дайте пульсу и ногам восстановиться — завтра смотрите на баланс формы в аналитике.',
      priority: 85,
      surfaces: ['post_workout'],
      icon: 'bicycle-outline',
    });
  }

  if (event.kind === 'stretch') {
    push(out, {
      id: 'post-stretch',
      category: 'mobility',
      tone: 'positive',
      title: 'Мобильность отмечена',
      body: 'Растяжка поддерживает восстановление — особенно после недавних тренировок.',
      priority: 80,
      surfaces: ['post_workout'],
      icon: 'body-outline',
    });
  }

  if (ctx.tsb != null && ctx.tsb < -10) {
    push(out, {
      id: 'post-fatigue-stack',
      category: 'fatigue',
      tone: 'warm',
      title: 'Усталость накапливается',
      body: 'После этой сессии лучше не добавлять тяжёлую нагрузку — приоритет сну и лёгкому дню.',
      priority: 95,
      surfaces: ['post_workout'],
      icon: 'moon-outline',
      tab: TAB.Workouts,
    });
  } else if (!ctx.stretchRecent && event.kind !== 'stretch') {
    push(out, {
      id: 'post-mobility-hint',
      category: 'mobility',
      tone: 'calm',
      title: 'На восстановление',
      body: 'Короткая растяжка в ближайшие дни поможет телу перераспределить нагрузку.',
      priority: 70,
      surfaces: ['post_workout'],
      icon: 'body-outline',
      tab: TAB.Workouts,
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 2);
}
