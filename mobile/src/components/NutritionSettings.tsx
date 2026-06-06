import React, {useCallback, useEffect, useState} from 'react';
import {Alert, StyleSheet, Switch, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  calculateUserLevel,
  fetchAnalyticsSettings,
  fetchNutritionSettings,
  saveAnalyticsSettings,
  saveNutritionSettings,
} from '../api/user';
import {AppButton, AppChip, AppInput, AppText, SettingsPanel} from '../design-system';
import {useDeveloperMode} from '../hooks/useDeveloperMode';

const ACTIVITY_LABELS: Record<'sedentary' | 'active', string> = {
  sedentary: 'Малоактивный',
  active: 'Активный',
};

const HC_KEYS = [
  'steps',
  'sleep',
  'heart_rate',
  'total_calories',
  'active_calories',
  'workout_calories',
  'weight',
] as const;

const HC_LABELS: Record<(typeof HC_KEYS)[number], string> = {
  steps: 'Шаги',
  sleep: 'Сон',
  heart_rate: 'Пульс (passive HR)',
  total_calories: 'Суточные калории',
  active_calories: 'Активные калории',
  workout_calories: 'Калории тренировок',
  weight: 'Вес',
};

type HcPrefs = Record<(typeof HC_KEYS)[number], boolean> & {use_in_analytics: boolean};

const DEFAULT_HC: HcPrefs = {
  use_in_analytics: false,
  steps: false,
  sleep: false,
  heart_rate: false,
  active_calories: false,
  workout_calories: false,
  total_calories: false,
  weight: false,
};

export function NutritionSettings() {
  const {developerMode} = useDeveloperMode();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['nutrition-settings'],
    queryFn: fetchNutritionSettings,
  });
  const analyticsQuery = useQuery({
    queryKey: ['analytics-settings'],
    queryFn: fetchAnalyticsSettings,
  });
  const [includeWarmup, setIncludeWarmup] = useState(false);
  const [hcPrefs, setHcPrefs] = useState<HcPrefs>(DEFAULT_HC);
  const [form, setForm] = useState({
    protein: '',
    fat: '',
    carbs: '',
    activity: 'sedentary' as 'sedentary' | 'active',
  });

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) {
      return;
    }
    setForm({
      protein: s.protein_gram_per_kg != null ? String(s.protein_gram_per_kg) : '',
      fat: s.fat_gram_per_kg != null ? String(s.fat_gram_per_kg) : '',
      carbs: s.carbs_gram_per_kg != null ? String(s.carbs_gram_per_kg) : '',
      activity: s.activity_level || 'sedentary',
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (analyticsQuery.data) {
      setIncludeWarmup(Boolean(analyticsQuery.data.include_warmup_in_analytics));
      setHcPrefs({...DEFAULT_HC, ...analyticsQuery.data.hc_analytics});
    }
  }, [analyticsQuery.data]);

  const saveAnalyticsMutation = useMutation({
    mutationFn: saveAnalyticsSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['analytics-settings']});
    },
  });

  const persistAnalytics = useCallback(
    (patch: Parameters<typeof saveAnalyticsSettings>[0]) => {
      saveAnalyticsMutation.mutate(patch);
    },
    [saveAnalyticsMutation],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      saveNutritionSettings({
        protein_gram_per_kg: form.protein ? Number(form.protein) : null,
        fat_gram_per_kg: form.fat ? Number(form.fat) : null,
        carbs_gram_per_kg: form.carbs ? Number(form.carbs) : null,
        activity_level: form.activity,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['nutrition-settings']});
    },
  });

  const calcMutation = useMutation({
    mutationFn: calculateUserLevel,
    onSuccess: data => {
      const rec = data.recommendations ?? data;
      if (developerMode) {
        Alert.alert('Рекомендации', JSON.stringify(rec, null, 2));
      } else {
        const summary =
          typeof rec === 'object' && rec && 'calories' in rec
            ? `Калории: ${(rec as {calories?: number}).calories ?? '—'}`
            : 'Рекомендации рассчитаны';
        Alert.alert('Рекомендации', summary);
      }
    },
  });

  return (
    <View style={styles.root}>
      <SettingsPanel title="Питание">
        <AppInput
          label="Белки, г/кг"
          keyboardType="decimal-pad"
          value={form.protein}
          onChangeText={v => setForm(prev => ({...prev, protein: v}))}
        />
        <AppInput
          label="Жиры, г/кг"
          keyboardType="decimal-pad"
          value={form.fat}
          onChangeText={v => setForm(prev => ({...prev, fat: v}))}
        />
        <AppInput
          label="Углеводы, г/кг"
          keyboardType="decimal-pad"
          value={form.carbs}
          onChangeText={v => setForm(prev => ({...prev, carbs: v}))}
        />
        <View style={styles.chips}>
          {(['sedentary', 'active'] as const).map(level => (
            <AppChip
              key={level}
              label={ACTIVITY_LABELS[level]}
              variant="pill"
              active={form.activity === level}
              onPress={() => setForm(prev => ({...prev, activity: level}))}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <AppButton
            label={calcMutation.isPending ? 'Расчёт…' : 'Рассчитать уровень'}
            variant="secondary"
            size="sm"
            onPress={() => calcMutation.mutate()}
          />
          <AppButton
            label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
            size="sm"
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          />
        </View>
      </SettingsPanel>

      <SettingsPanel title="Аналитика">
        <View style={styles.switchRow}>
          <AppText variant="body" style={styles.switchLabel}>
            Учитывать разминку в аналитике силы
          </AppText>
          <Switch
            value={includeWarmup}
            onValueChange={v => {
              setIncludeWarmup(v);
              persistAnalytics({include_warmup_in_analytics: v});
            }}
          />
        </View>
        <View style={styles.switchRow}>
          <AppText variant="body" style={styles.switchLabel}>
            Использовать Health Connect в аналитике
          </AppText>
          <Switch
            value={hcPrefs.use_in_analytics}
            onValueChange={v => {
              const patch: Partial<HcPrefs> = {use_in_analytics: v};
              if (v) {
                for (const key of HC_KEYS) {
                  patch[key] = true;
                }
              }
              setHcPrefs(prev => ({...prev, ...patch}));
              persistAnalytics({hc_analytics: patch});
            }}
          />
        </View>
        <AppText variant="caption" style={styles.hcHint}>
          Метрики ниже доступны при включённом переключателе выше.
        </AppText>
        {HC_KEYS.map(key => (
          <View key={key} style={styles.switchRow}>
            <AppText variant="body" style={styles.switchLabel}>
              {HC_LABELS[key]}
            </AppText>
            <Switch
              value={hcPrefs[key]}
              disabled={!hcPrefs.use_in_analytics}
              onValueChange={v => {
                setHcPrefs(prev => ({...prev, [key]: v}));
                persistAnalytics({hc_analytics: {[key]: v}});
              }}
            />
          </View>
        ))}
      </SettingsPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 16},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  switchLabel: {flex: 1},
  hcHint: {opacity: 0.75, marginBottom: 8},
});
