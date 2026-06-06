import React, {useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  createStretchingLog,
  fetchStretchingActivity,
  fetchStretchingLog,
  fetchStretchingPresets,
} from '../api/stretching';
import type {StretchingLogEntry, StretchingPreset} from '../types/stretching';
import {AppButton, AppCard, AppChip, AppInput, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useFlexTabListBottomPad} from '../layout/screenContent';

function getPastDates(days: number) {
  const arr: string[] = [];
  const d = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const x = new Date(d);
    x.setDate(x.getDate() - i);
    arr.push(x.toISOString().slice(0, 10));
  }
  return arr;
}

export function StretchingHistoryTab() {
  const {colors, radius, layout} = useDesignSystem();
  const listBottomPad = useFlexTabListBottomPad();
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualPresetId, setManualPresetId] = useState<number | null>(null);
  const [manualDuration, setManualDuration] = useState('20');
  const [manualNotes, setManualNotes] = useState('');

  const logQuery = useQuery({
    queryKey: ['stretching-log', 30],
    queryFn: () => fetchStretchingLog(30),
  });
  const activityQuery = useQuery({
    queryKey: ['stretching-activity', 365],
    queryFn: () => fetchStretchingActivity(365),
  });
  const presetsQuery = useQuery({
    queryKey: ['stretching-presets', true, 'manual'],
    queryFn: () => fetchStretchingPresets(true),
  });

  const activitySet = useMemo(
    () => new Set((activityQuery.data || []).map((x: {date: string}) => x.date)),
    [activityQuery.data],
  );
  const last42Days = useMemo(() => getPastDates(42), []);

  const saveManualMutation = useMutation({
    mutationFn: () =>
      createStretchingLog({
        date: manualDate,
        preset_id: manualPresetId || 0,
        duration_minutes: Number(manualDuration) || 0,
        notes: manualNotes || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['stretching-log']});
      await queryClient.invalidateQueries({queryKey: ['stretching-activity']});
      setManualOpen(false);
    },
  });

  return (
    <View style={[styles.root, {gap: layout.blockGap}]}>
      <View style={styles.header}>
        <AppText variant="title2">История растяжки</AppText>
        <AppButton label="Добавить вручную" size="sm" onPress={() => setManualOpen(true)} />
      </View>

      {(logQuery.isLoading || activityQuery.isLoading) && (
        <ActivityIndicator color={colors.accent} />
      )}

      <AppText variant="title3">Календарь активности (последние 6 недель)</AppText>
      <View style={styles.calendarGrid}>
        {last42Days.map(day => {
          const active = activitySet.has(day);
          return (
            <View
              key={day}
              style={[
                styles.dayCell,
                {
                  borderRadius: radius.sm,
                  backgroundColor: active ? colors.successMuted : colors.surfaceMuted,
                },
              ]}>
              <AppText variant="caption">{day.slice(8)}</AppText>
            </View>
          );
        })}
      </View>

      <AppText variant="title3">Журнал сессий</AppText>
      <ScrollView
        style={styles.flexScroll}
        contentContainerStyle={[styles.logList, {paddingBottom: listBottomPad}]}>
        {(logQuery.data || []).map((item: StretchingLogEntry) => (
          <AppCard key={item.id} padding="md" style={styles.logCard}>
            <AppText variant="title3">
              {item.date} · {item.preset_name}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {item.duration_minutes ?? '-'} мин {item.notes ? `· ${item.notes}` : ''}
            </AppText>
          </AppCard>
        ))}
      </ScrollView>

      <AppSheet
        visible={manualOpen}
        title="Добавить сессию вручную"
        onClose={() => setManualOpen(false)}
        scroll>
        <AppInput value={manualDate} onChangeText={setManualDate} placeholder="YYYY-MM-DD" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.presetsRow}>
            {(presetsQuery.data || []).map((p: StretchingPreset) => (
              <AppChip
                key={p.id}
                label={p.name}
                variant="pill"
                active={manualPresetId === p.id}
                onPress={() => setManualPresetId(p.id)}
              />
            ))}
          </View>
        </ScrollView>
        <AppInput
          value={manualDuration}
          onChangeText={setManualDuration}
          placeholder="Длительность, мин"
          keyboardType="number-pad"
        />
        <AppInput value={manualNotes} onChangeText={setManualNotes} placeholder="Заметки" />
        <View style={styles.footer}>
          <AppButton label="Отмена" variant="secondary" onPress={() => setManualOpen(false)} />
          <AppButton
            label={saveManualMutation.isPending ? 'Сохранение…' : 'Сохранить'}
            onPress={() => saveManualMutation.mutate()}
            loading={saveManualMutation.isPending}
          />
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  calendarGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  dayCell: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flexScroll: {flex: 1},
  logList: {gap: 8},
  logCard: {marginBottom: 0},
  presetsRow: {flexDirection: 'row', gap: 8, paddingVertical: 8},
  footer: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
});
