import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Switch, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  addFoodEntry,
  deleteFoodEntry,
  saveDailyBraceletCalories,
} from '../api/food';
import {getFoodDayLocalFirst} from '../repositories/localFoodRepository';
import {useOperatingMode} from '../context/OperatingModeContext';
import type {FoodEntry, FoodPhase, FoodProduct} from '../types/food';
import {mealLabel} from '../constants/mealLabels';
import {AddProductModal} from './AddProductModal';
import {AppButton, AppCard, AppInput, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  visible: boolean;
  date: string;
  phase: FoodPhase;
  caloriesExpenditure: number | null;
  braceletCalories: number | null;
  onClose: () => void;
};

const PREFER_CHEST_KEY = 'food:preferChest';
const MEALS = ['breakfast1', 'breakfast2', 'lunch', 'dinner', 'snack'] as const;

export function DayModal({
  visible,
  date,
  phase,
  caloriesExpenditure,
  braceletCalories,
  onClose,
}: Props) {
  const {colors, layout} = useDesignSystem();
  const queryClient = useQueryClient();
  const [mealForAdd, setMealForAdd] = useState<(typeof MEALS)[number]>('lunch');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [braceletInput, setBraceletInput] = useState('');
  const [preferChest, setPreferChest] = useState(true);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setBraceletInput(braceletCalories != null ? String(Math.round(braceletCalories)) : '');
    AsyncStorage.getItem(PREFER_CHEST_KEY).then(v => {
      if (v != null) {
        setPreferChest(v === '1');
      }
    });
  }, [visible, braceletCalories]);

  const {mode, apiReachable} = useOperatingMode();

  const dayQuery = useQuery({
    queryKey: ['food-day', date, phase, mode, apiReachable],
    queryFn: () => getFoodDayLocalFirst(date, phase, {mode, apiReachable}),
    enabled: visible,
  });

  const addEntryMutation = useMutation({
    mutationFn: (payload: {product: FoodProduct; meal: string}) =>
      addFoodEntry({
        date,
        phase,
        product_id: payload.product.id,
        quantity: 100,
        meal_type: payload.meal,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['food-day', date, phase]});
      await queryClient.invalidateQueries({queryKey: ['food-week', phase]});
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: number) => deleteFoodEntry(entryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['food-day', date, phase]});
      await queryClient.invalidateQueries({queryKey: ['food-week', phase]});
    },
  });

  const saveBraceletMutation = useMutation({
    mutationFn: async () => {
      if (!braceletInput.trim()) {
        return null;
      }
      return saveDailyBraceletCalories(date, Number(braceletInput));
    },
  });

  const totals = useMemo(() => dayQuery.data?.daily_totals, [dayQuery.data]);
  const balance = useMemo(() => {
    if (!totals || caloriesExpenditure == null) {
      return null;
    }
    return totals.calories - caloriesExpenditure;
  }, [totals, caloriesExpenditure]);

  const onSelectProduct = async (product: FoodProduct) => {
    await addEntryMutation.mutateAsync({product, meal: mealForAdd});
    setShowAddProduct(false);
  };

  return (
    <>
      <AppSheet visible={visible} title={`День · ${date}`} onClose={onClose} scroll>
        {dayQuery.isLoading && <ActivityIndicator color={colors.accent} />}
        {!!dayQuery.error && (
          <AppText variant="body" color="danger">
            Ошибка загрузки дня
          </AppText>
        )}

        {MEALS.map(meal => {
          const entries = dayQuery.data?.by_meal?.[meal] || [];
          return (
            <AppCard key={meal} padding="md" style={{marginBottom: layout.blockGapCompact}}>
              <View style={styles.rowBetween}>
                <AppText variant="title3">{mealLabel(meal)}</AppText>
                <AppButton
                  label="Добавить"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setMealForAdd(meal);
                    setShowAddProduct(true);
                  }}
                />
              </View>
              {entries.length === 0 ? (
                <AppText variant="caption" color="textMuted">
                  Нет записей
                </AppText>
              ) : (
                entries.map((e: FoodEntry) => (
                  <View key={e.id} style={styles.entryRow}>
                    <AppText variant="body" style={styles.entryText}>
                      {e.product_name} ({Math.round(e.quantity)} г) · {Math.round(e.calories)} ккал
                    </AppText>
                    <AppButton
                      label="Удалить"
                      variant="ghost"
                      size="sm"
                      onPress={() => deleteEntryMutation.mutate(e.id)}
                    />
                  </View>
                ))
              )}
            </AppCard>
          );
        })}

        <AppCard padding="md">
          <AppText variant="title3">Калории браслета за день</AppText>
          <AppInput
            keyboardType="number-pad"
            placeholder="например 750"
            value={braceletInput}
            onChangeText={setBraceletInput}
          />
          <View style={styles.rowBetween}>
            <AppText variant="body">Приоритет пульсометра</AppText>
            <Switch
              value={preferChest}
              onValueChange={v => {
                setPreferChest(v);
                void AsyncStorage.setItem(PREFER_CHEST_KEY, v ? '1' : '0');
              }}
            />
          </View>
          <AppText variant="caption" color="textSecondary">
            Итого: Б/Ж/У {Math.round(totals?.protein || 0)}/{Math.round(totals?.fat || 0)}/
            {Math.round(totals?.carbs || 0)} · Клетч. {Math.round(totals?.fiber || 0)} · Ккал{' '}
            {Math.round(totals?.calories || 0)}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Расход: {caloriesExpenditure == null ? '-' : Math.round(caloriesExpenditure)} · Баланс:{' '}
            {balance == null ? '-' : Math.round(balance)}
          </AppText>
        </AppCard>

        <View style={styles.actions}>
          <AppButton label="Закрыть" variant="secondary" onPress={onClose} />
          <AppButton
            label="Сохранить"
            onPress={() => {
              saveBraceletMutation.mutate();
              onClose();
            }}
          />
        </View>
      </AppSheet>

      <AddProductModal
        visible={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        onSelectProduct={onSelectProduct}
      />
    </>
  );
}

const styles = StyleSheet.create({
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  entryText: {flex: 1},
  actions: {flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8},
});
