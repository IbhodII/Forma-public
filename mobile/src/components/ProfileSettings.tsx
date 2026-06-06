import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {fetchUserProfile, saveUserProfile} from '../api/user';
import {AppButton, AppChip, AppInput, SettingsPanel} from '../design-system';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function ProfileSettings() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
  });
  const [form, setForm] = useState({
    sex: 'male',
    date_of_birth: '',
    height_cm: '',
    max_heart_rate: '',
    units_system: 'metric',
    week_start_day: 0,
  });

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) {
      return;
    }
    setForm({
      sex: p.sex || 'male',
      date_of_birth: p.date_of_birth || '',
      height_cm: p.height_cm != null ? String(p.height_cm) : '',
      max_heart_rate: p.max_heart_rate != null ? String(p.max_heart_rate) : '',
      units_system: p.units_system || 'metric',
      week_start_day: p.week_start_day ?? 0,
    });
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveUserProfile({
        sex: form.sex as 'male' | 'female',
        date_of_birth: form.date_of_birth || null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        max_heart_rate: form.max_heart_rate ? Number(form.max_heart_rate) : null,
        units_system: form.units_system as 'metric' | 'american',
        week_start_day: Number(form.week_start_day),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['user-profile']});
    },
  });

  return (
    <SettingsPanel title="Профиль">
      <View style={styles.chips}>
        {(['male', 'female'] as const).map(sex => (
          <AppChip
            key={sex}
            label={sex === 'male' ? 'Муж' : 'Жен'}
            variant="pill"
            active={form.sex === sex}
            onPress={() => setForm(prev => ({...prev, sex}))}
          />
        ))}
      </View>
      <AppInput
        label="Дата рождения"
        placeholder="YYYY-MM-DD"
        value={form.date_of_birth}
        onChangeText={v => setForm(prev => ({...prev, date_of_birth: v}))}
      />
      <AppInput
        label="Рост, см"
        placeholder="Рост"
        keyboardType="decimal-pad"
        value={form.height_cm}
        onChangeText={v => setForm(prev => ({...prev, height_cm: v}))}
      />
      <AppInput
        label="Макс. пульс"
        keyboardType="number-pad"
        value={form.max_heart_rate}
        onChangeText={v => setForm(prev => ({...prev, max_heart_rate: v}))}
      />
      <View style={styles.chips}>
        {(['metric', 'american'] as const).map(units => (
          <AppChip
            key={units}
            label={units}
            variant="pill"
            active={form.units_system === units}
            onPress={() => setForm(prev => ({...prev, units_system: units}))}
          />
        ))}
      </View>
      <View style={styles.chips}>
        {DAYS.map((day, idx) => (
          <AppChip
            key={day}
            label={day}
            variant="pill"
            active={form.week_start_day === idx}
            onPress={() => setForm(prev => ({...prev, week_start_day: idx}))}
          />
        ))}
      </View>
      <AppButton
        label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
        size="sm"
      />
    </SettingsPanel>
  );
}

const styles = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
