import React from 'react';
import {StyleSheet, Switch, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  fetchAnalyticsSettings,
  saveAnalyticsSettings,
} from '../api/user';
import {AppText} from '../design-system';

const METRIC_KEYS = [
  'steps',
  'sleep',
  'heart_rate',
  'active_calories',
  'workout_calories',
  'total_calories',
  'weight',
] as const;

type HcPrefs = {
  use_in_analytics: boolean;
  steps: boolean;
  sleep: boolean;
  heart_rate: boolean;
  active_calories: boolean;
  workout_calories: boolean;
  total_calories: boolean;
  weight: boolean;
};

const DEFAULT: HcPrefs = {
  use_in_analytics: false,
  steps: false,
  sleep: false,
  heart_rate: false,
  active_calories: false,
  workout_calories: false,
  total_calories: false,
  weight: false,
};

export function HcAnalyticsMasterToggle() {
  const qc = useQueryClient();
  const {data, isLoading} = useQuery({
    queryKey: ['analytics-settings'],
    queryFn: fetchAnalyticsSettings,
  });

  const saveMut = useMutation({
    mutationFn: saveAnalyticsSettings,
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['analytics-settings']});
    },
  });

  const prefs: HcPrefs = {...DEFAULT, ...(data?.hc_analytics as Partial<HcPrefs> | undefined)};

  const onToggle = (enabled: boolean) => {
    const patch: Partial<HcPrefs> = {use_in_analytics: enabled};
    if (enabled) {
      for (const key of METRIC_KEYS) {
        patch[key] = true;
      }
    }
    saveMut.mutate({hc_analytics: patch});
  };

  if (isLoading) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <AppText variant="title3">Использовать Health Connect в аналитике</AppText>
          <AppText variant="caption" color="textSecondary" style={styles.hint}>
            Если выключено, данные видны на экране Health Connect, но не влияют на аналитику на ПК.
          </AppText>
        </View>
        <Switch
          value={prefs.use_in_analytics}
          onValueChange={v => onToggle(v)}
          disabled={saveMut.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  hint: {
    marginTop: 2,
  },
});
