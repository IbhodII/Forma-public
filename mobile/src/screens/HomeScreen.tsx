import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';

import {DashboardActivityRow} from '../components/dashboard/DashboardActivityRow';
import {DashboardMetricGrid} from '../components/dashboard/DashboardMetricGrid';
import {DashboardStaleWarnings} from '../components/dashboard/DashboardStaleWarnings';
import {DashboardSyncStrip} from '../components/dashboard/DashboardSyncStrip';
import {DailyStateCard} from '../components/home/DailyStateCard';
import {GuidanceList} from '../components/home/GuidanceList';
import {OperatingModeChip} from '../components/OperatingModeChip';
import {QuickAccessStrip} from '../components/home/QuickAccessStrip';
import {TodayActionCard} from '../components/home/TodayActionCard';
import {InsightList} from '../components/insights/InsightList';
import {useInsights} from '../insights';
import {DataStateShell} from '../components/DataStateShell';
import {AppScreen} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useStreakMilestoneHaptic} from '../haptics';
import {useHomeCompanion} from '../hooks/useHomeCompanion';
import {useOperatingMode} from '../context/OperatingModeContext';
import {shouldSkipPcApi} from '../mode/operatingMode';
import {useT} from '../i18n';

type TabNav = BottomTabNavigationProp<Record<string, undefined>>;

export default function HomeScreen() {
  const t = useT();
  const navigation = useNavigation<TabNav>();
  const {layout, space} = useDesignSystem();
  const {isLocalFirst, apiReachable, requiresPcApi, mode} = useOperatingMode();
  const skipPcApi = shouldSkipPcApi(mode, apiReachable);

  const {
    greeting,
    daily,
    primary,
    guidanceCards,
    intensityHint,
    recoveryFactors,
    streak,
    metrics,
    latestStrength,
    latestCardio,
    staleFlags,
    isLoading,
    dbInitError,
    retryDbInit,
    refetch,
    isRefetching,
    syncPending,
  } = useHomeCompanion();

  const {insights, recoveryInsights} = useInsights('home', {
    enabled: !isLoading,
    limit: 3,
    skipPcApi,
  });

  const showRecoveryInsights =
    daily.intensity === 'rest' ||
    daily.intensity === 'light' ||
    daily.kind === 'recovery_day' ||
    daily.kind === 'high_fatigue';

  useStreakMilestoneHaptic(streak);

  const openTab = (tab: string) => {
    navigation.navigate(tab);
  };

  const showApiDegraded = requiresPcApi && !apiReachable;
  const hideCoaching = isLocalFirst && showApiDegraded;

  const allStale = [
    ...staleFlags,
    ...(syncPending > 0 ? [`Ожидает синхр. (${syncPending})`] : []),
  ];

  return (
    <AppScreen
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle')}
      scroll
      refreshing={isRefetching}
      onRefresh={refetch}>
      <View style={{marginBottom: space[2]}}>
        <OperatingModeChip />
      </View>

      <DashboardSyncStrip />

      <DataStateShell
        isLoading={isLoading && !dbInitError}
        isError={!!dbInitError}
        error={dbInitError}
        onRetry={() => void retryDbInit()}
        loadingLabel={t('dashboard.loadingDay')}
        emptyMessage="Данных пока нет. Импортируйте БД или подключите источник данных.">
        <View style={[styles.stack, {gap: layout.blockGap}]}>
          {metrics ? (
            <DashboardMetricGrid metrics={metrics} showLoad={!isLocalFirst || apiReachable} />
          ) : null}

          <DashboardStaleWarnings flags={allStale} />

          {!hideCoaching ? (
            <>
              <DailyStateCard greeting={greeting} state={daily} recoveryFactors={recoveryFactors} />

              <TodayActionCard
                cta={primary}
                intensityHint={intensityHint}
                onPress={() => openTab(primary.tab)}
              />

              {insights.length > 0 ? (
                <InsightList insights={insights} onOpen={openTab} />
              ) : null}

              {showRecoveryInsights && recoveryInsights.length > 0 ? (
                <InsightList
                  insights={recoveryInsights}
                  title="Восстановление"
                  onOpen={openTab}
                  compact
                />
              ) : null}

              <GuidanceList cards={guidanceCards} onOpen={openTab} />
            </>
          ) : null}

          <DashboardActivityRow
            strengthTitle={latestStrength?.title ?? null}
            strengthDate={latestStrength?.date ?? null}
            cardioTitle={latestCardio?.title ?? null}
            cardioDate={latestCardio?.date ?? null}
          />

          <QuickAccessStrip onOpen={openTab} />
        </View>
      </DataStateShell>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stack: {},
});
