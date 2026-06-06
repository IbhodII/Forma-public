import React, {useMemo} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';

import {DataStateShell} from './DataStateShell';
import {BodyHistoryRow} from './body/BodyHistoryRow';
import {BODY_BAR_CHART_HEIGHT} from './body/bodyChart';
import {ChartCard} from './analytics/ChartCard';
import {MobileBarChart} from './analytics/MobileBarChart';
import {BodySectionHeader} from './body/BodySectionHeader';
import {AppButton, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useFlexTabListBottomPad} from '../layout/screenContent';
import {useStepsHistory} from '../hooks/useStepsHistory';
import type {PeriodDays} from './analytics/utils';
import type {StepsHistoryPoint} from '../types/body';

type Props = {
  periodDays?: PeriodDays;
};

export function StepsTab({periodDays = 7}: Props) {
  const {colors, layout} = useDesignSystem();
  const listBottomPad = useFlexTabListBottomPad();
  const {items, isLoading, isError, error, refetch, source} = useStepsHistory(periodDays);

  const chartRows = items.slice(-periodDays);

  const barPoints = useMemo(
    () =>
      chartRows.map((x: StepsHistoryPoint) => ({
        date: x.date,
        value: Number(x.steps || 0),
      })),
    [chartRows],
  );

  const stepsSummary = useMemo(() => {
    if (chartRows.length === 0) {
      return undefined;
    }
    const total = chartRows.reduce((s: number, r: StepsHistoryPoint) => s + Number(r.steps || 0), 0);
    const avg = Math.round(total / chartRows.length);
    return `Среднее ${avg.toLocaleString('ru-RU')} · всего ${total.toLocaleString('ru-RU')}`;
  }, [chartRows]);

  return (
    <View style={[styles.root, {gap: layout.blockGap}]}>
      {source === 'hc' ? (
        <AppText variant="caption" color="textMuted">
          Данные с устройства (Health Connect)
        </AppText>
      ) : null}

      <AppButton
        label="Обновить"
        variant="secondary"
        size="sm"
        onPress={() => void refetch()}
      />

      <DataStateShell
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={!isLoading && !isError && items.length === 0}
        onRetry={() => void refetch()}
        emptyMessage="Данных по шагам пока нет. Подключите Health Connect или импортируйте БД."
        loadingLabel="Загрузка шагов…">
      {chartRows.length > 0 ? (
        <ChartCard
          title="Шаги"
          summary={stepsSummary}
          defaultExpanded
          chartHeights={{collapsed: BODY_BAR_CHART_HEIGHT, expanded: BODY_BAR_CHART_HEIGHT}}
          minChartBoxHeight={BODY_BAR_CHART_HEIGHT}>
          {({chartHeight}) => (
            <MobileBarChart
              height={chartHeight}
              color={colors.stateWellness}
              points={barPoints}
            />
          )}
        </ChartCard>
      ) : null}

      {items.length > 0 ? (
        <View style={styles.section}>
          <BodySectionHeader title="История" />
          <FlatList
            data={items.slice().reverse()}
            keyExtractor={(item: StepsHistoryPoint) => `${item.date}-${item.steps}`}
            scrollEnabled
            initialNumToRender={14}
            maxToRenderPerBatch={10}
            contentContainerStyle={[styles.list, {gap: layout.blockGapCompact, paddingBottom: listBottomPad}]}
            renderItem={({item}: {item: StepsHistoryPoint}) => (
              <BodyHistoryRow
                date={item.date}
                detail={`Шаги: ${item.steps}${
                  item.distance_km != null ? ` · ${item.distance_km.toFixed(2)} км` : ''
                }`}
              />
            )}
          />
        </View>
      ) : null}
      </DataStateShell>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0},
  section: {flex: 1, minHeight: 0, gap: 8},
  list: {},
});
