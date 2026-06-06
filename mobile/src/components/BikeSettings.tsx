import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {fetchBikeSettings, saveBikeSettings} from '../api/user';
import {AppButton, AppChip, AppInput, SettingsPanel} from '../design-system';

export function BikeSettings() {
  const queryClient = useQueryClient();
  const bikeQuery = useQuery({
    queryKey: ['bike-settings'],
    queryFn: fetchBikeSettings,
  });
  const [form, setForm] = useState({
    bike_weight_kg: '',
    rider_weight_kg: '',
    tire_type: 'road_slick',
    default_route_surface: 'asphalt',
  });

  useEffect(() => {
    const b = bikeQuery.data;
    if (!b) {
      return;
    }
    setForm({
      bike_weight_kg: String(b.bike_weight_kg ?? ''),
      rider_weight_kg: b.rider_weight_kg != null ? String(b.rider_weight_kg) : '',
      tire_type: b.tire_type || 'road_slick',
      default_route_surface: b.default_route_surface || 'asphalt',
    });
  }, [bikeQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveBikeSettings({
        bike_weight_kg: Number(form.bike_weight_kg),
        rider_weight_kg: form.rider_weight_kg ? Number(form.rider_weight_kg) : null,
        tire_type: form.tire_type,
        default_route_surface: form.default_route_surface,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['bike-settings']});
    },
  });

  return (
    <SettingsPanel title="Велосипед">
      <AppInput
        label="Вес велосипеда, кг"
        keyboardType="decimal-pad"
        value={form.bike_weight_kg}
        onChangeText={v => setForm(prev => ({...prev, bike_weight_kg: v}))}
      />
      <AppInput
        label="Вес райдера, кг"
        keyboardType="decimal-pad"
        value={form.rider_weight_kg}
        onChangeText={v => setForm(prev => ({...prev, rider_weight_kg: v}))}
      />
      <View style={styles.chips}>
        {['road_slick', 'semi_slick', 'gravel', 'cx'].map(type => (
          <AppChip
            key={type}
            label={type}
            variant="pill"
            active={form.tire_type === type}
            onPress={() => setForm(prev => ({...prev, tire_type: type}))}
          />
        ))}
      </View>
      <View style={styles.chips}>
        {['asphalt', 'cobblestone', 'gravel', 'mixed'].map(surface => (
          <AppChip
            key={surface}
            label={surface}
            variant="pill"
            active={form.default_route_surface === surface}
            onPress={() => setForm(prev => ({...prev, default_route_surface: surface}))}
          />
        ))}
      </View>
      <AppButton
        label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
        size="sm"
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
      />
    </SettingsPanel>
  );
}

const styles = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
