import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Calendar} from 'react-native-calendars';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  fetchCycleImpact,
  fetchCycleLog,
  fetchCyclePhases,
  upsertCycleLog,
  type CycleLogItem,
} from '../api/cycle';
import {
  AppButton,
  AppCard,
  AppChip,
  AppEmptyState,
  AppInput,
  AppLoadingState,
  AppScreen,
  AppText,
} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

function getPhaseColors(colors: ReturnType<typeof useDesignSystem>['colors']): Record<string, string> {
  return {
    menstrual: colors.danger,
    follicular: colors.stateAnalytics,
    ovulatory: colors.accentSecondary,
    luteal: colors.warning,
  };
}

const PHASE_LABELS: Record<string, string> = {
  menstrual: 'Менструация',
  follicular: 'Фолликулярная',
  ovulatory: 'Овуляция',
  luteal: 'Лютеиновая',
};

const FLOW_LABELS: Record<string, string> = {
  light: 'Слабое',
  medium: 'Среднее',
  heavy: 'Сильное',
};

export default function CycleScreen({embedded = false}: {embedded?: boolean}) {
  const {colors} = useDesignSystem();
  const phaseColors = useMemo(() => getPhaseColors(colors), [colors]);
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(toIso(new Date()));
  const [phase, setPhase] = useState<CycleLogItem['phase']>('menstrual');
  const [flow, setFlow] = useState<CycleLogItem['flow_intensity']>('medium');
  const [notes, setNotes] = useState('');

  const from = useMemo(() => toIso(addDays(new Date(), -45)), []);
  const to = useMemo(() => toIso(addDays(new Date(), 45)), []);

  const logQuery = useQuery({
    queryKey: ['cycle-log', from, to],
    queryFn: () => fetchCycleLog(from, to),
    enabled: true,
  });
  const phaseQuery = useQuery({
    queryKey: ['cycle-phases', from, to],
    queryFn: () => fetchCyclePhases(from, to),
    enabled: true,
  });
  const impactQuery = useQuery({
    queryKey: ['cycle-impact', selectedDate],
    queryFn: () => fetchCycleImpact(selectedDate),
    enabled: true,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertCycleLog({
        date: selectedDate,
        phase: phase ?? undefined,
        flow_intensity: flow ?? undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['cycle-log']});
      await queryClient.invalidateQueries({queryKey: ['cycle-phases']});
      await queryClient.invalidateQueries({queryKey: ['cycle-impact']});
      setNotes('');
    },
  });

  const markedDates = useMemo(() => {
    const out: Record<string, object> = {};
    for (const p of phaseQuery.data || []) {
      out[p.date] = {
        selected: true,
        selectedColor: phaseColors[p.phase] || colors.textMuted,
        selectedTextColor: colors.textInverse,
      };
    }
    for (const l of logQuery.data || []) {
      out[l.date] = {
        ...(out[l.date] || {}),
        marked: true,
        dotColor: colors.text,
      };
    }
    out[selectedDate] = {
      ...(out[selectedDate] || {}),
      selected: true,
      selectedColor:
        (out[selectedDate] as {selectedColor?: string})?.selectedColor || colors.accent,
      selectedTextColor: colors.textInverse,
    };
    return out;
  }, [phaseQuery.data, logQuery.data, selectedDate, colors, phaseColors]);

  const selectedLog = useMemo(
    () => (logQuery.data || []).find((x: CycleLogItem) => x.date === selectedDate),
    [logQuery.data, selectedDate],
  );

  const loading = logQuery.isLoading || phaseQuery.isLoading || impactQuery.isLoading;
  const hasCycleData = (logQuery.data?.length ?? 0) > 0 || (phaseQuery.data?.length ?? 0) > 0;

  const body = (
    <>
      <Calendar
        markedDates={markedDates}
        onDayPress={d => setSelectedDate(d.dateString)}
        firstDay={6}
        theme={{
          calendarBackground: colors.surface,
          dayTextColor: colors.text,
          monthTextColor: colors.text,
          arrowColor: colors.accent,
        }}
      />

      {loading ? <AppLoadingState label="Загрузка…" compact /> : null}
      {!loading && !hasCycleData ? (
        <AppEmptyState
          icon="flower-outline"
          title="Собираем данные цикла"
          description="Добавьте первую запись, чтобы увидеть фазу и персональные подсказки."
        />
      ) : null}

      <AppCard padding="lg">
        <AppText variant="title2">{selectedDate}</AppText>
        <AppText variant="body" color="textSecondary">
          Фаза: {impactQuery.data?.phase_label || impactQuery.data?.phase || '—'}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          BMR ×{impactQuery.data?.bmr_multiplier ?? '—'} · восстановление ×
          {impactQuery.data?.recovery_multiplier ?? '—'}
        </AppText>
        {impactQuery.data?.bmr_note ? (
          <AppText variant="caption" color="textMuted">
            {impactQuery.data.bmr_note}
          </AppText>
        ) : null}
        {impactQuery.data?.recovery_note ? (
          <AppText variant="caption" color="textMuted">
            {impactQuery.data.recovery_note}
          </AppText>
        ) : null}
      </AppCard>

      <AppCard padding="lg">
        <AppText variant="title2">Запись дня</AppText>
        <View style={styles.chips}>
          {(['menstrual', 'follicular', 'ovulatory', 'luteal'] as const).map(p => (
            <AppChip
              key={p}
              label={PHASE_LABELS[p]}
              variant="pill"
              active={phase === p}
              onPress={() => setPhase(p)}
            />
          ))}
        </View>
        <View style={styles.chips}>
          {(['light', 'medium', 'heavy'] as const).map(f => (
            <AppChip
              key={f}
              label={FLOW_LABELS[f]}
              variant="pill"
              active={flow === f}
              onPress={() => setFlow(f)}
            />
          ))}
        </View>
        <AppInput
          label="Заметки"
          value={notes}
          onChangeText={setNotes}
          placeholder="Симптомы, самочувствие"
          multiline
        />
        <AppButton
          label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить день'}
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          fullWidth
        />
      </AppCard>

      {selectedLog ? (
        <AppCard padding="lg">
          <AppText variant="title2">Запись на дату</AppText>
          <AppText variant="body">Фаза: {selectedLog.phase || '—'}</AppText>
          <AppText variant="body">Интенсивность: {selectedLog.flow_intensity || '—'}</AppText>
          {selectedLog.notes ? (
            <AppText variant="caption" color="textSecondary">
              {selectedLog.notes}
            </AppText>
          ) : null}
        </AppCard>
      ) : null}
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <AppScreen title="Цикл" subtitle="Календарь и влияние на метаболизм">
      {body}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8},
});
