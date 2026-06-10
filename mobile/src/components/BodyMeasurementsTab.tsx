import React, {useMemo, useState} from 'react';

import {ActivityIndicator, FlatList, StyleSheet, View} from 'react-native';

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';



import {createBodyMetric, deleteBodyMetric} from '../api/body';
import {getBodyLatestLocalFirst, getBodyMetricsLocalFirst} from '../repositories/localBodyRepository';
import {useOperatingMode} from '../context/OperatingModeContext';

import {BodyHistoryRow} from './body/BodyHistoryRow';

import {BodyMetricsGrid} from './body/BodyMetricsGrid';

import {BodyTrendChart} from './body/BodyTrendChart';

import {buildWeightLinePoints} from './body/bodyChart';
import {formatBodyMetricSigned, formatBodyMetricValue} from '../utils/bodyMetrics';

import {BodyInsightsPanel} from './BodyInsightsPanel';

import type {BodyMetricCreatePayload, BodyMetricRow} from '../types/body';

import {BodySectionHeader} from './body/BodySectionHeader';
import {AppButton, AppInput, AppSheet, AppText} from '../design-system';

import {useDesignSystem} from '../design-system/useDesignSystem';
import {useFlexTabListBottomPad} from '../layout/screenContent';



const today = () => new Date().toISOString().slice(0, 10);



export function BodyMeasurementsTab() {

  const {colors, layout} = useDesignSystem();
  const listBottomPad = useFlexTabListBottomPad();

  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState<BodyMetricCreatePayload>({

    date: today(),

    weight_kg: undefined,

    body_fat_percent: undefined,

    muscle_mass_kg: undefined,

    chest_inhale_cm: undefined,

    waist_cm: undefined,

    hips_cm: undefined,

    bicep_relaxed_cm: undefined,

  });



  const {mode, apiReachable} = useOperatingMode();

  const latestQuery = useQuery({

    queryKey: ['body-latest', mode, apiReachable],

    queryFn: () => getBodyLatestLocalFirst({mode, apiReachable}),

  });

  const metricsQuery = useQuery({

    queryKey: ['body-metrics', mode, apiReachable],

    queryFn: () => getBodyMetricsLocalFirst({mode, apiReachable}),

  });



  const createMutation = useMutation({

    mutationFn: () => createBodyMetric({...form, allow_replace: true}),

    onSuccess: async () => {

      await queryClient.invalidateQueries({queryKey: ['body-latest']});

      await queryClient.invalidateQueries({queryKey: ['body-metrics']});

      setModalOpen(false);

    },

  });



  const deleteMutation = useMutation({

    mutationFn: (date: string) => deleteBodyMetric(date),

    onSuccess: async () => {

      await queryClient.invalidateQueries({queryKey: ['body-latest']});

      await queryClient.invalidateQueries({queryKey: ['body-metrics']});

    },

  });



  const items = useMemo(() => metricsQuery.data?.items ?? [], [metricsQuery.data?.items]);

  const chartPoints = useMemo(() => buildWeightLinePoints(items, 12), [items]);
  const waistPoints = useMemo(
    () =>
      items
        .filter((x: BodyMetricRow) => x.waist_cm != null && Number.isFinite(Number(x.waist_cm)))
        .slice(0, 12)
        .reverse()
        .map((x: BodyMetricRow) => ({date: x.date, value: Number(x.waist_cm)})),
    [items],
  );
  const latest = items[0];
  const previous = items[1];
  const weightDelta =
    latest?.weight_kg != null && previous?.weight_kg != null
      ? latest.weight_kg - previous.weight_kg
      : null;
  const waistDelta =
    latest?.waist_cm != null && previous?.waist_cm != null
      ? Number(latest.waist_cm) - Number(previous.waist_cm)
      : null;



  const loading = latestQuery.isLoading || metricsQuery.isLoading;



  return (

    <View style={[styles.root, {gap: layout.blockGap}]}>

      {loading ? <ActivityIndicator color={colors.accent} /> : null}

      {!!latestQuery.error && (

        <AppText variant="body" color="danger">

          Ошибка загрузки замеров

        </AppText>

      )}



      <BodyInsightsPanel latest={latestQuery.data} history={items} />

      <BodyMetricsGrid latest={latestQuery.data} />

      {weightDelta != null || waistDelta != null ? (
        <AppText variant="caption" color="textSecondary">
          {weightDelta != null
            ? `Вес: ${formatBodyMetricSigned(weightDelta)} кг vs пред.`
            : ''}
          {weightDelta != null && waistDelta != null ? ' · ' : ''}
          {waistDelta != null
            ? `Талия: ${formatBodyMetricSigned(waistDelta)} см vs пред.`
            : ''}
        </AppText>
      ) : null}

      <BodyTrendChart title="Динамика веса" points={chartPoints} defaultExpanded />
      {waistPoints.length >= 2 ? (
        <BodyTrendChart
          title="Талия (мини)"
          points={waistPoints}
          defaultExpanded={false}
        />
      ) : null}



      <View style={styles.section}>

        <BodySectionHeader

          title="История"

          actionLabel="Добавить замер"

          onAction={() => setModalOpen(true)}

        />

        <FlatList

          style={styles.flexList}

          data={items}

          keyExtractor={(item: BodyMetricRow) => item.date}

          contentContainerStyle={[styles.list, {gap: layout.blockGapCompact, paddingBottom: listBottomPad}]}

          renderItem={({item}: {item: BodyMetricRow}) => (

            <BodyHistoryRow

              date={item.date}

              detail={`Вес: ${formatBodyMetricValue(item.weight_kg, ' кг')} · Жир: ${formatBodyMetricValue(item.body_fat_percent, '%')} · Талия: ${formatBodyMetricValue(item.waist_cm, ' см')}`}

              onDelete={() => deleteMutation.mutate(item.date)}

              deleting={deleteMutation.isPending}

            />

          )}

        />

      </View>



      <AppSheet visible={modalOpen} title="Новый замер" onClose={() => setModalOpen(false)}>

        <AppInput

          label="Дата"

          value={form.date}

          onChangeText={v => setForm(prev => ({...prev, date: v}))}

          placeholder="YYYY-MM-DD"

        />

        <AppInput

          label="Вес (кг)"

          value={form.weight_kg != null ? String(form.weight_kg) : ''}

          onChangeText={v => setForm(prev => ({...prev, weight_kg: v ? Number(v) : undefined}))}

          placeholder="Вес"

          keyboardType="decimal-pad"

        />

        <AppInput

          label="% жира"

          value={form.body_fat_percent != null ? String(form.body_fat_percent) : ''}

          onChangeText={v =>

            setForm(prev => ({...prev, body_fat_percent: v ? Number(v) : undefined}))

          }

          placeholder="% жира"

          keyboardType="decimal-pad"

        />

        <AppInput

          label="Талия (см)"

          value={form.waist_cm != null ? String(form.waist_cm) : ''}

          onChangeText={v => setForm(prev => ({...prev, waist_cm: v ? Number(v) : undefined}))}

          placeholder="Талия"

          keyboardType="decimal-pad"

        />

        <AppInput

          label="Бёдра (см)"

          value={form.hips_cm != null ? String(form.hips_cm) : ''}

          onChangeText={v => setForm(prev => ({...prev, hips_cm: v ? Number(v) : undefined}))}

          placeholder="Бёдра"

          keyboardType="decimal-pad"

        />

        <View style={styles.actionsRow}>

          <AppButton label="Отмена" variant="secondary" onPress={() => setModalOpen(false)} />

          <AppButton

            label={createMutation.isPending ? 'Сохранение…' : 'Сохранить'}

            onPress={() => createMutation.mutate()}

            loading={createMutation.isPending}

          />

        </View>

      </AppSheet>

    </View>

  );

}



const styles = StyleSheet.create({

  root: {flex: 1, minHeight: 0},

  section: {flex: 1, minHeight: 0, gap: 8},

  flexList: {flex: 1},

  list: {},

  actionsRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},

});


