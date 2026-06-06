import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {FadeIn} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppHero} from '../design-system/components/AppHero';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {haptics, notifySave} from '../haptics';
import {PressableScale} from '../design-system/motion/PressableScale';
import {
  ACTIVITY_OPTIONS,
  buildPersonalizedSummary,
  GOAL_OPTIONS,
  RECOVERY_OPTIONS,
  TRAINING_OPTIONS,
  WELLNESS_OPTIONS,
} from './copy';
import {OnboardingMultiSelect} from './components/OnboardingMultiSelect';
import {OnboardingOption} from './components/OnboardingOption';
import {OnboardingShell} from './components/OnboardingShell';
import {logStartup} from '../debug/startupLog';
import {ONBOARDING_HYDRATE_MS, withTimeout} from '../startup/startupWatchdog';
import {draftToPreferences, syncOnboardingToBackend} from './persist';
import {completeOnboarding, loadOnboardingDraft, saveOnboardingDraft} from './storage';
import type {CyclePreference, OnboardingDraft, SexChoice} from './types';
import {EMPTY_DRAFT} from './types';

type StepId =
  | 'welcome'
  | 'goals'
  | 'activity'
  | 'recovery'
  | 'training'
  | 'body'
  | 'cycle'
  | 'wellness'
  | 'complete';

function buildStepOrder(draft: OnboardingDraft): StepId[] {
  const steps: StepId[] = [
    'welcome',
    'goals',
    'activity',
    'recovery',
    'training',
    'body',
  ];
  if (draft.sex === 'female') {
    steps.push('cycle');
  }
  steps.push('wellness', 'complete');
  return steps;
}

type Props = {
  onComplete: () => void;
};

export function OnboardingFlow({onComplete}: Props) {
  const insets = useSafeAreaInsets();
  const {colors, typography, heroText, layout, space, radius, iconSize} = useDesignSystem();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pcSyncWarning, setPcSyncWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    withTimeout(loadOnboardingDraft(), ONBOARDING_HYDRATE_MS, 'onboarding_hydrate')
      .then(loaded => {
        if (!cancelled) {
          setDraft(loaded);
          setHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          logStartup('onboarding', 'hydrate timeout — using empty draft');
          setDraft({...EMPTY_DRAFT});
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = useMemo(() => buildStepOrder(draft), [draft.sex]);
  const currentStep = steps[stepIndex] ?? 'welcome';
  const totalSteps = steps.length;

  useEffect(() => {
    if (stepIndex >= steps.length) {
      setStepIndex(Math.max(0, steps.length - 1));
    }
  }, [stepIndex, steps.length]);

  const patch = useCallback((partial: Partial<OnboardingDraft>) => {
    setDraft(prev => {
      const next = {...prev, ...partial};
      void saveOnboardingDraft(next);
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    haptics.light();
    setStepIndex(i => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    haptics.soft();
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  const finish = useCallback(
    async (skipPcSync = false) => {
      setFinishing(true);
      setPcSyncWarning(null);
      try {
        logStartup('onboarding', 'settings_saved locally');
        await completeOnboarding(draftToPreferences(draft));
        if (!skipPcSync) {
          try {
            await syncOnboardingToBackend(draft);
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Синхронизация с ПК недоступна';
            logStartup('onboarding', `pc_sync_failed: ${msg}`);
            setPcSyncWarning('Сохранено на устройстве. Синхронизация с ПК пропущена.');
          }
        } else {
          logStartup('onboarding', 'pc_sync_skipped user choice');
        }
        await queryClient.invalidateQueries({queryKey: ['user-profile']});
        await queryClient.invalidateQueries({queryKey: ['nutrition-settings']});
        notifySave();
        logStartup('onboarding', 'navigation_target MainTabs');
        onComplete();
      } finally {
        setFinishing(false);
      }
    },
    [draft, onComplete, queryClient],
  );

  const summary = useMemo(() => buildPersonalizedSummary(draft), [draft]);

  if (!hydrated) {
    return <View style={[styles.boot, {backgroundColor: colors.bg}]} />;
  }

  if (currentStep === 'welcome') {
    return (
      <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
        <View style={{flex: 1, paddingHorizontal: layout.screenPaddingX}}>
          <View style={{paddingTop: space[4], flex: 1, justifyContent: 'center', gap: space[4]}}>
            <Animated.View entering={FadeIn.duration(400)}>
              <AppHero compact>
                <Text style={[styles.heroBrand, heroText.overline]}>Forma</Text>
                <Text style={[typography.display, heroText.title, styles.heroTitle]}>
                  Ваш ритм.{'\n'}Ваше восстановление.
                </Text>
                <Text style={[typography.body, heroText.body, styles.heroSub]}>
                  Не ещё один дневник — спокойная система, которая помогает понять тело, баланс
                  нагрузки и то, что делать сегодня.
                </Text>
              </AppHero>
            </Animated.View>

            <View style={{gap: space[3]}}>
              {[
                {icon: 'leaf-outline', text: 'Восстановление и готовность без перегруза цифрами'},
                {icon: 'pulse-outline', text: 'Умная интерпретация нагрузки и усталости'},
                {icon: 'heart-outline', text: 'Устойчивый тренинг — в вашем темпе'},
              ].map((row, i) => (
                <Animated.View
                  key={row.icon}
                  entering={FadeIn.duration(300).delay(120 + i * 60)}
                  style={[styles.bullet, {backgroundColor: colors.surface}]}>
                  <Icon name={row.icon} size={iconSize.md} color={colors.accent} />
                  <Text style={[typography.body, {color: colors.textSecondary, flex: 1}]}>
                    {row.text}
                  </Text>
                </Animated.View>
              ))}
            </View>
          </View>
        </View>
        <View style={{paddingHorizontal: layout.screenPaddingX, paddingBottom: insets.bottom + space[4]}}>
          <PressableScale onPress={goNext} haptic="cta" scaleTo={0.98}>
            <View style={[styles.cta, {backgroundColor: colors.accent, borderRadius: radius.lg}]}>
              <Text style={[typography.title3, {color: colors.textInverse, fontWeight: '700'}]}>
                Начать настройку
              </Text>
            </View>
          </PressableScale>
          <Text style={[typography.caption, {color: colors.textMuted, textAlign: 'center', marginTop: space[2]}]}>
            Пара минут — только то, что важно для вас
          </Text>
        </View>
      </View>
    );
  }

  if (currentStep === 'complete') {
    return (
      <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: layout.screenPaddingX,
            paddingBottom: insets.bottom + 100,
            justifyContent: 'center',
            gap: space[4],
          }}>
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={[styles.completeIcon, {backgroundColor: colors.accentMuted}]}>
              <Icon name="sparkles" size={36} color={colors.accent} />
            </View>
            <Text style={[typography.display, {color: colors.text, marginTop: space[4]}]}>
              Forma настроена под вас
            </Text>
            <Text style={[typography.body, {color: colors.textSecondary, marginTop: space[2], lineHeight: 22}]}>
              {summary}
            </Text>
          </Animated.View>

          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                borderColor: colors.border,
              },
            ]}>
            {draft.goals.length > 0 ? (
              <Text style={[typography.caption, {color: colors.textMuted}]}>
                Фокус:{' '}
                {draft.goals
                  .map(g => GOAL_OPTIONS.find(o => o.id === g)?.title)
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
            {draft.trainingStyle ? (
              <Text style={[typography.caption, {color: colors.textMuted, marginTop: 6}]}>
                Тренировки:{' '}
                {TRAINING_OPTIONS.find(o => o.id === draft.trainingStyle)?.title}
              </Text>
            ) : null}
          </View>
        </ScrollView>
        <View style={{paddingHorizontal: layout.screenPaddingX, paddingBottom: insets.bottom + space[3]}}>
          {pcSyncWarning ? (
            <Text
              style={[
                typography.caption,
                {color: colors.textMuted, textAlign: 'center', marginBottom: space[2]},
              ]}>
              {pcSyncWarning}
            </Text>
          ) : null}
          <PressableScale
            onPress={() => void finish(false)}
            disabled={finishing}
            haptic="cta"
            scaleTo={0.98}>
            <View
              style={[
                styles.cta,
                {
                  backgroundColor: colors.accent,
                  borderRadius: radius.lg,
                  opacity: finishing ? 0.7 : 1,
                },
              ]}>
              <Text style={[typography.title3, {color: colors.textInverse, fontWeight: '700'}]}>
                {finishing ? 'Сохраняем…' : 'Войти в Forma'}
              </Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => void finish(true)}
            disabled={finishing}
            haptic="soft"
            scaleTo={0.98}
            style={{marginTop: space[2]}}>
            <Text style={[typography.body, {color: colors.textMuted, textAlign: 'center'}]}>
              Продолжить без ПК
            </Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  const shellProps = {
    stepIndex,
    totalSteps,
    onBack: goBack,
    showBack: stepIndex > 0,
  };

  if (currentStep === 'goals') {
    return (
      <OnboardingShell
        {...shellProps}
        overline="Шаг 1"
        title="Что для вас важнее всего?"
        subtitle="Forma подстроит главный экран и подсказки — без длинных анкет."
        onNext={goNext}
        nextDisabled={draft.goals.length === 0}
        secondaryAction={{label: 'Пропустить', onPress: goNext}}>
        <OnboardingMultiSelect
          options={GOAL_OPTIONS}
          selected={draft.goals}
          max={3}
          onChange={goals => patch({goals})}
        />
      </OnboardingShell>
    );
  }

  if (currentStep === 'activity') {
    return (
      <OnboardingShell
        {...shellProps}
        overline="Ритм"
        title="Насколько активны ваши дни?"
        subtitle="Это поможет оценивать энергию и нагрузку — приблизительно, без лишней точности."
        onNext={goNext}
        nextDisabled={!draft.activityLevel}
        secondaryAction={{
          label: 'Не уверен(а)',
          onPress: () => {
            patch({activityLevel: 'moderate'});
            goNext();
          },
        }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {ACTIVITY_OPTIONS.map((opt, index) => (
            <OnboardingOption
              key={opt.id}
              index={index}
              title={opt.title}
              subtitle={opt.subtitle}
              icon="walk-outline"
              selected={draft.activityLevel === opt.id}
              onPress={() => patch({activityLevel: opt.id})}
            />
          ))}
        </ScrollView>
      </OnboardingShell>
    );
  }

  if (currentStep === 'recovery') {
    return (
      <OnboardingShell
        {...shellProps}
        overline="Восстановление"
        title="Что поддерживать в первую очередь?"
        subtitle="Мы не ставим диагнозы — только помогаем держать устойчивый ритм."
        onNext={goNext}
        nextDisabled={!draft.recoveryFocus}
        secondaryAction={{label: 'Пропустить', onPress: goNext}}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {RECOVERY_OPTIONS.map((opt, index) => (
            <OnboardingOption
              key={opt.id}
              index={index}
              title={opt.title}
              subtitle={opt.subtitle}
              icon={opt.icon}
              selected={draft.recoveryFocus === opt.id}
              onPress={() => patch({recoveryFocus: opt.id})}
            />
          ))}
        </ScrollView>
      </OnboardingShell>
    );
  }

  if (currentStep === 'training') {
    return (
      <OnboardingShell
        {...shellProps}
        overline="Тренировки"
        title="Как вы обычно тренируетесь?"
        subtitle="Запись сессий станет быстрой и приятной — как в лучших трекерах зала."
        onNext={goNext}
        nextDisabled={!draft.trainingStyle}
        secondaryAction={{label: 'Пропустить', onPress: goNext}}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {TRAINING_OPTIONS.map((opt, index) => (
            <OnboardingOption
              key={opt.id}
              index={index}
              title={opt.title}
              subtitle={opt.subtitle}
              icon={opt.icon}
              selected={draft.trainingStyle === opt.id}
              onPress={() => patch({trainingStyle: opt.id})}
            />
          ))}
        </ScrollView>
      </OnboardingShell>
    );
  }

  if (currentStep === 'body') {
    return (
      <OnboardingShell
        {...shellProps}
        overline="Персонализация"
        title="Несколько слов о вас"
        subtitle="Нужно для цикла и более точных подсказок. Можно пропустить."
        onNext={goNext}
        nextLabel="Продолжить"
        secondaryAction={{
          label: 'Пропустить этот шаг',
          onPress: () => {
            patch({sex: 'skip', cyclePreference: 'no'});
            goNext();
          },
        }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {(
            [
              {id: 'female' as SexChoice, title: 'Женский', subtitle: 'Цикл и восстановление'},
              {id: 'male' as SexChoice, title: 'Мужской', subtitle: 'Нагрузка и форма'},
              {id: 'skip' as SexChoice, title: 'Не указывать', subtitle: 'Минимум данных'},
            ] as const
          ).map((opt, index) => (
            <OnboardingOption
              key={opt.id}
              index={index}
              title={opt.title}
              subtitle={opt.subtitle}
              icon={opt.id === 'female' ? 'flower-outline' : opt.id === 'male' ? 'person-outline' : 'ellipse-outline'}
              selected={draft.sex === opt.id}
              onPress={() =>
                patch({
                  sex: opt.id,
                  cyclePreference: opt.id === 'female' ? draft.cyclePreference : 'no',
                })
              }
            />
          ))}
        </ScrollView>
      </OnboardingShell>
    );
  }

  if (currentStep === 'cycle') {
    const cycleOpts: {id: CyclePreference; title: string; subtitle: string; icon: string}[] = [
      {
        id: 'track',
        title: 'Учитывать цикл',
        subtitle: 'Фаза и восстановление в рекомендациях',
        icon: 'flower-outline',
      },
      {
        id: 'later',
        title: 'Позже',
        subtitle: 'Включу, когда буду готова',
        icon: 'time-outline',
      },
      {
        id: 'no',
        title: 'Не сейчас',
        subtitle: 'Без раздела цикла',
        icon: 'close-circle-outline',
      },
    ];
    return (
      <OnboardingShell
        {...shellProps}
        overline="Цикл"
        title="Учитывать ритм цикла?"
        subtitle="Forma мягко подскажет нагрузку и восстановление по фазе — без медицинских обещаний."
        onNext={goNext}
        nextDisabled={!draft.cyclePreference}
        secondaryAction={{label: 'Пропустить', onPress: goNext}}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {cycleOpts.map((opt, index) => (
            <OnboardingOption
              key={opt.id}
              index={index}
              title={opt.title}
              subtitle={opt.subtitle}
              icon={opt.icon}
              selected={draft.cyclePreference === opt.id}
              onPress={() => patch({cyclePreference: opt.id})}
            />
          ))}
        </ScrollView>
      </OnboardingShell>
    );
  }

  if (currentStep === 'wellness') {
    return (
      <OnboardingShell
        {...shellProps}
        overline="Последний шаг"
        title="Что хотите чувствовать чаще?"
        subtitle="Приоритеты дня — не цели на год."
        onNext={goNext}
        nextLabel="Готово"
        nextDisabled={draft.wellnessPriorities.length === 0}
        secondaryAction={{label: 'Пропустить', onPress: goNext}}>
        <OnboardingMultiSelect
          options={WELLNESS_OPTIONS}
          selected={draft.wellnessPriorities}
          max={3}
          onChange={wellnessPriorities => patch({wellnessPriorities})}
        />
      </OnboardingShell>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: {flex: 1},
  boot: {flex: 1},
  heroBrand: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {marginTop: 8, fontWeight: '800'},
  heroSub: {marginTop: 12},
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
  },
  cta: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
