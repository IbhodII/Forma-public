import React, {useMemo, useState} from 'react';

import {FlatList, StyleSheet, View} from 'react-native';

import {Calendar} from 'react-native-calendars';

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';



import {saveWeightDaily} from '../api/body';
import {useOperatingMode} from '../context/OperatingModeContext';
import {getWeightDailyLocalFirst} from '../repositories/localBodyRepository';

import {BodyHistoryRow} from './body/BodyHistoryRow';

import {BodyTrendChart} from './body/BodyTrendChart';

import {buildWeightLinePoints} from './body/bodyChart';

import type {WeightDailyRow} from '../types/body';

import {BodySectionHeader} from './body/BodySectionHeader';
import {AppButton, AppCard, AppInput, AppSheet, AppText} from '../design-system';

import {useDesignSystem} from '../design-system/useDesignSystem';
import {useFlexTabListBottomPad} from '../layout/screenContent';



const today = () => new Date().toISOString().slice(0, 10);



export function WeightTab() {

  const {layout} = useDesignSystem();
  const listBottomPad = useFlexTabListBottomPad();

  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(today());

  const [modalOpen, setModalOpen] = useState(false);

  const [weight, setWeight] = useState('');

  const [fat, setFat] = useState('');



  const {mode, apiReachable} = useOperatingMode();

  const weightQuery = useQuery({

    queryKey: ['weight-daily', mode, apiReachable],

    queryFn: () => getWeightDailyLocalFirst({mode, apiReachable}),

  });



  const saveMutation = useMutation({

    mutationFn: () =>

      saveWeightDaily({

        date: selectedDate,

        weight_kg: Number(weight),

        body_fat_percent: fat ? Number(fat) : null,

        only_weight: !fat,

      }),

    onSuccess: async () => {

      await queryClient.invalidateQueries({queryKey: ['weight-daily']});

      setModalOpen(false);

    },

  });



  const items = useMemo(() => weightQuery.data?.items ?? [], [weightQuery.data?.items]);
  const lastHcWeight = useMemo(
    () => items.find((x: WeightDailyRow) => x.source === 'health_connect'),
    [items],
  );

  const chartPoints = useMemo(() => buildWeightLinePoints(items, 30), [items]);



  const markedDates = useMemo(() => {

    const out: Record<string, {marked: boolean; selected?: boolean}> = {};

    items.forEach((x: WeightDailyRow) => {

      out[x.date] = {marked: true};

    });

    out[selectedDate] = {...(out[selectedDate] || {}), selected: true};

    return out;

  }, [items, selectedDate]);



  return (

    <View style={[styles.root, {gap: layout.blockGap}]}>

      <BodyTrendChart title="Вес за 30 дней" points={chartPoints} defaultExpanded />

      {lastHcWeight ? (
        <AppText variant="caption" color="textSecondary">
          Последний вес из HC: {lastHcWeight.weight_kg} кг ({lastHcWeight.date})
        </AppText>
      ) : null}



      <AppCard padding="md" animateEnter={false}>

        <Calendar markedDates={markedDates} onDayPress={d => setSelectedDate(d.dateString)} />

        <AppText variant="caption" color="textSecondary" style={{marginTop: layout.stackGap}}>

          Выбрано: {selectedDate}

        </AppText>

      </AppCard>



      <View style={styles.section}>

        <BodySectionHeader title="История" actionLabel="Добавить" onAction={() => setModalOpen(true)} />

        <FlatList

          style={styles.flexList}

          data={items.slice().reverse()}

          keyExtractor={(item: WeightDailyRow) => item.date}

          contentContainerStyle={[styles.list, {gap: layout.blockGapCompact, paddingBottom: listBottomPad}]}

          renderItem={({item}: {item: WeightDailyRow}) => (
            <BodyHistoryRow
              date={item.date}
              detail={`Вес: ${item.weight_kg} кг${item.body_fat_percent != null ? ` · %жира ${item.body_fat_percent}` : ''}${item.source === 'health_connect' ? ' · HC' : item.source === 'manual' || !item.source ? '' : ` · ${item.source}`}`}
            />
          )}

        />

      </View>



      <AppSheet

        visible={modalOpen}

        title={`Вес на дату ${selectedDate}`}

        onClose={() => setModalOpen(false)}>

        <AppInput

          value={weight}

          onChangeText={setWeight}

          placeholder="Вес (кг)"

          keyboardType="decimal-pad"

        />

        <AppInput

          value={fat}

          onChangeText={setFat}

          placeholder="% жира (опционально)"

          keyboardType="decimal-pad"

        />

        <View style={styles.actionsRow}>

          <AppButton label="Отмена" variant="secondary" onPress={() => setModalOpen(false)} />

          <AppButton

            label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}

            onPress={() => saveMutation.mutate()}

            loading={saveMutation.isPending}

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


