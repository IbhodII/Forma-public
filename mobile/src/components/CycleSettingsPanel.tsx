import React, {useEffect, useState} from 'react';
import {StyleSheet, Switch, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {fetchCycleSettings, saveCycleSettings} from '../api/cycle';
import {AppButton, AppInput, AppText} from '../design-system';

export function CycleSettingsPanel() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['cycle-settings'],
    queryFn: fetchCycleSettings,
  });
  const [cycleLength, setCycleLength] = useState('28');
  const [periodLength, setPeriodLength] = useState('5');
  const [lastStart, setLastStart] = useState('');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) {
      return;
    }
    setCycleLength(String(s.cycle_length_days));
    setPeriodLength(String(s.period_length_days));
    setLastStart(s.last_period_start ?? s.last_menstruation ?? '');
    setEnabled(s.cycle_enabled !== false);
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveCycleSettings({
        cycle_length_days: Number(cycleLength) || 28,
        period_length_days: Number(periodLength) || 5,
        last_period_start: lastStart.trim() || null,
        cycle_enabled: enabled,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({queryKey: ['cycle-settings']});
      await qc.invalidateQueries({queryKey: ['cycle-impact']});
      await qc.invalidateQueries({queryKey: ['cycle-phases']});
    },
  });

  return (
    <View style={styles.root}>
      <AppText variant="title2">Цикл</AppText>
      <View style={styles.row}>
        <AppText variant="body">Учитывать в расчётах</AppText>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
      <AppInput label="Длина цикла, дней" value={cycleLength} onChangeText={setCycleLength} keyboardType="number-pad" />
      <AppInput label="Длина менструации" value={periodLength} onChangeText={setPeriodLength} keyboardType="number-pad" />
      <AppInput
        label="Начало последней менструации"
        value={lastStart}
        onChangeText={setLastStart}
        placeholder="YYYY-MM-DD"
      />
      <AppButton
        label="Сохранить настройки цикла"
        onPress={() => saveMut.mutate()}
        loading={saveMut.isPending}
        size="sm"
      />
      <AppText variant="caption" color="textMuted">
        Импорт FIT и Polar настраиваются на компьютере в разделе «Синхронизация».
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 10},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
