import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchCtlAtlTsb} from '../api/analytics';
import {queryKeys} from '../hooks/queryKeys';
import {AnalyticsToolbar} from '../components/analytics/AnalyticsToolbar';
import {DataStateShell} from '../components/DataStateShell';
import {EnergyAnalyticsSection} from '../components/analytics/EnergyAnalyticsSection';
import {InsightBanner} from '../components/analytics/InsightBanner';
import {LoadAnalyticsSection} from '../components/analytics/LoadAnalyticsSection';
import {MetricCarousel, type MetricCard} from '../components/analytics/MetricCarousel';
import {ProgressAnalyticsSection} from '../components/analytics/ProgressAnalyticsSection';
import {StrengthAnalyticsSection} from '../components/analytics/StrengthAnalyticsSection';
import {workloadAccent} from '../design-system/brand';
import {InsightList} from '../components/insights/InsightList';
import {interpretWorkload} from '../components/analytics/utils';
import {useInsights} from '../insights';
import {useAnalyticsPeriod} from '../hooks/useAnalyticsPeriod';
import {useScreenInsets} from '../layout/useScreenInsets';
import {scrollContent} from '../layout/screenContent';
import {fetchUserProfile} from '../api/user';
import {AnalyticsBodyPanel} from '../components/analytics/AnalyticsBodyPanel';
import {AnalyticsCyclePanel} from '../components/analytics/AnalyticsCyclePanel';
import {AppScreen} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {loadOnboardingPreferences} from '../onboarding/storage';
import {isFemaleProfile} from '../utils/profileSex';

const BASE_DOMAINS = ['Нагрузка', 'Сила', 'Энергия', 'Прогресс', 'Тело'] as const;
type Domain = (typeof BASE_DOMAINS)[number] | 'Цикл';

const DOMAIN_KEY: Record<string, 'load' | 'strength' | 'energy' | 'progress' | 'body' | 'cycle'> = {
  Нагрузка: 'load',
  Сила: 'strength',
  Энергия: 'energy',
  Прогресс: 'progress',
  Тело: 'body',
  Цикл: 'cycle',
};

export default function AnalyticsScreen() {
  const {bottom} = useScreenInsets();
  const {colors, layout, brand} = useDesignSystem();
  const {period, setPeriod, ready: periodReady} = useAnalyticsPeriod(30);
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
    staleTime: 120_000,
  });
  const onboardingPrefsQuery = useQuery({
    queryKey: ['onboarding-preferences'],
    queryFn: loadOnboardingPreferences,
    staleTime: Infinity,
  });
  const isFemale = isFemaleProfile(profileQuery.data, onboardingPrefsQuery.data?.sex);
  const domains = useMemo(
    () => (isFemale ? [...BASE_DOMAINS, 'Цикл' as const] : [...BASE_DOMAINS]),
    [isFemale],
  );
  const [domain, setDomain] = useState<Domain>('Нагрузка');
  const key = DOMAIN_KEY[domain] ?? 'load';

  const ctlQuery = useQuery({
    queryKey: queryKeys.analyticsCtl(period),
    queryFn: () => fetchCtlAtlTsb(period),
    staleTime: 5 * 60 * 1000,
    enabled: periodReady,
  });

  const ctlItems = ctlQuery.data?.items ?? [];
  const ctlEmpty =
    periodReady &&
    !ctlQuery.isLoading &&
    !ctlQuery.isError &&
    (ctlItems.length < 2 || ctlItems.every(p => !p.trimp && !p.ctl));

  const current = ctlQuery.data?.current;
  const {insights: analyticsInsights, primary: primaryInsight} = useInsights('analytics', {
    limit: 4,
    historyDays: period,
  });

  const insight = useMemo(() => {
    if (primaryInsight) {
      const tsb = current?.tsb;
      const mapped = interpretWorkload(tsb, current?.ctl, current?.atl);
      return {
        status: mapped.status,
        title: primaryInsight.title,
        body: primaryInsight.body,
      };
    }
    return interpretWorkload(current?.tsb, current?.ctl, current?.atl);
  }, [primaryInsight, current?.tsb, current?.ctl, current?.atl]);

  const heroMetrics: MetricCard[] = [
    {
      id: 'ctl',
      label: 'CTL',
      value: current?.ctl != null ? String(Math.round(current.ctl)) : '—',
      hint: 'форма',
      accent: colors.stateTraining,
    },
    {
      id: 'atl',
      label: 'ATL',
      value: current?.atl != null ? String(Math.round(current.atl)) : '—',
      hint: 'усталость',
      accent: colors.accentWarm,
    },
    {
      id: 'tsb',
      label: 'TSB',
      value: current?.tsb != null ? String(Math.round(current.tsb)) : '—',
      hint: 'баланс',
      accent: workloadAccent(insight.status, colors),
    },
  ];

  return (
    <AppScreen
      scroll={false}
      title="Аналитика"
      subtitle={`${brand.name} · инсайты и ритм нагрузки`}
      animateOnFocus>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        contentContainerStyle={scrollContent(bottom, layout.sectionGap)}>
        <View style={{gap: layout.blockGap}}>
          <InsightBanner insight={insight} />
          {analyticsInsights.length > 1 ? (
            <InsightList
              insights={analyticsInsights.slice(1)}
              title="Ещё по нагрузке"
              compact
            />
          ) : null}
          <DataStateShell
            isLoading={ctlQuery.isLoading}
            isError={ctlQuery.isError}
            error={ctlQuery.error}
            onRetry={() => void ctlQuery.refetch()}
            loadingLabel="Загрузка метрик…"
            isEmpty={ctlEmpty}
            emptyMessage="Добавьте тренировки с пульсом или шаги Health Connect, чтобы увидеть CTL/ATL/TSB.">
            <MetricCarousel items={heroMetrics} />
          </DataStateShell>
        </View>

        <AnalyticsToolbar
          period={period}
          onPeriodChange={setPeriod}
          domains={domains}
          domain={domain}
          onDomainChange={setDomain}
        />

        {key === 'load' && periodReady ? (
          <LoadAnalyticsSection key={`load-${period}`} period={period} />
        ) : null}
        {key === 'strength' && periodReady ? (
          <StrengthAnalyticsSection key={`strength-${period}`} period={period} />
        ) : null}
        {key === 'energy' && periodReady ? (
          <EnergyAnalyticsSection key={`energy-${period}`} period={period} />
        ) : null}
        {key === 'progress' && periodReady ? (
          <ProgressAnalyticsSection key={`progress-${period}`} period={period} />
        ) : null}
        {key === 'body' && periodReady ? (
          <AnalyticsBodyPanel period={period} />
        ) : null}
        {key === 'cycle' ? <AnalyticsCyclePanel /> : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minHeight: 0},
});
