import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQuery} from '@tanstack/react-query';

import {fetchCycleImpact} from '../../api/cycle';
import {TAB} from '../../navigation/routes';
import {AppButton, AppCard, AppLoadingState, AppText} from '../../design-system';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';

const today = () => new Date().toISOString().slice(0, 10);

type TabNav = BottomTabNavigationProp<Record<string, undefined>>;

export function CycleImpactCard() {
  const navigation = useNavigation<TabNav>();

  const impactQuery = useQuery({
    queryKey: ['cycle-impact', today()],
    queryFn: () => fetchCycleImpact(today()),
    enabled: true,
  });

  if (impactQuery.isLoading) {
    return <AppLoadingState label="Фаза цикла…" compact />;
  }

  const data = impactQuery.data;

  if (!data?.tracking) {
    return (
      <AppCard padding="md">
        <AppText variant="title2">Цикл</AppText>
        <AppText variant="body" color="textSecondary">
          {data?.message ?? 'Добавьте данные о цикле в настройках или календаре.'}
        </AppText>
        <AppButton
          label="Открыть календарь"
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate(TAB.Analytics)}
        />
      </AppCard>
    );
  }

  return (
    <AppCard padding="md">
      <AppText variant="title2">{data.phase_label ?? 'Фаза цикла'}</AppText>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <AppText variant="caption" color="textMuted">
            BMR
          </AppText>
          <AppText variant="body">×{data.bmr_multiplier?.toFixed(2) ?? '1.00'}</AppText>
          {data.bmr_note ? (
            <AppText variant="caption" color="textSecondary">
              {data.bmr_note}
            </AppText>
          ) : null}
        </View>
        <View style={styles.cell}>
          <AppText variant="caption" color="textMuted">
            Восстановление
          </AppText>
          <AppText variant="body">×{data.recovery_multiplier?.toFixed(2) ?? '1.00'}</AppText>
          {data.recovery_note ? (
            <AppText variant="caption" color="textSecondary">
              {data.recovery_note}
            </AppText>
          ) : null}
        </View>
      </View>
      <AppButton
        label="Календарь цикла"
        variant="secondary"
        size="sm"
        onPress={() => navigation.navigate(TAB.Analytics)}
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', gap: 12, marginTop: 8},
  cell: {flex: 1},
});
