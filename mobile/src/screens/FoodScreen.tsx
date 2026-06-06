import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {getDailyBraceletCalories, getWeekEntries, getWeekExpenditure} from '../api/food';
import {useOffline} from '../context/OfflineContext';
import {DayModal} from '../components/DayModal';
import {FoodPlansPanel} from '../components/FoodPlansPanel';
import {FoodMicrosTab} from '../components/FoodMicrosTab';
import {FoodProductsTab} from '../components/FoodProductsTab';
import {FoodWeekGrid} from '../components/FoodWeekGrid';
import {FoodWeekSummary} from '../components/food/FoodWeekSummary';
import {FoodPhaseToggle} from '../components/food/FoodPhaseToggle';
import {
  AppButton,
  AppErrorState,
  AppLoadingState,
  AppScreen,
  AppTabs,
} from '../design-system';
import {AppText} from '../design-system/components/AppText';
import {PressableScale} from '../design-system/motion/PressableScale';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {formatWeekRange} from '../utils/formatWeekRange';
import {addDaysIso, getWeekStart} from '../utils/formaWeek';
import type {
  DailyBraceletCalories,
  FoodPhase,
  FoodWeekDaySummary,
} from '../types/food';

const today = () => new Date().toISOString().slice(0, 10);
const PREFER_CHEST_KEY = 'food:preferChest';

const FOOD_TABS = ['Дневник', 'Микро', 'Продукты', 'Расписание'] as const;

export default function FoodScreen() {
  const [foodTab, setFoodTab] = useState<(typeof FOOD_TABS)[number]>('Дневник');
  const [phase, setPhase] = useState<FoodPhase>('cut');
  const [anchorDate, setAnchorDate] = useState(getWeekStart(today()));
  const [selectedDate, setSelectedDate] = useState(today());
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [preferChest, setPreferChest] = useState(true);
  const {colors, typography, radius, layout} = useDesignSystem();
  const {isOnline} = useOffline();

  useEffect(() => {
    AsyncStorage.getItem(PREFER_CHEST_KEY).then(v => {
      if (v != null) {
        setPreferChest(v === '1');
      }
    });
  }, []);

  const weekQuery = useQuery({
    queryKey: ['food-week', phase, anchorDate],
    queryFn: () => getWeekEntries(anchorDate, phase),
  });

  const expQuery = useQuery({
    queryKey: ['food-expenditure-week', phase, anchorDate, preferChest],
    queryFn: () => getWeekExpenditure(anchorDate, phase, preferChest),
    enabled: isOnline,
  });

  const braceletQuery = useQuery({
    queryKey: ['food-bracelet-week', weekQuery.data?.week_start, weekQuery.data?.week_end],
    enabled: Boolean(weekQuery.data?.week_start && weekQuery.data?.week_end),
    queryFn: () => getDailyBraceletCalories(weekQuery.data!.week_start, weekQuery.data!.week_end),
  });

  const days = useMemo(() => {
    const weekDays = weekQuery.data?.days || [];
    const expByDate = new Map(
      (expQuery.data?.items || []).map((i: {date: string; total_expenditure: number | null}) => [
        i.date,
        i.total_expenditure,
      ]),
    );
    const braceletByDate = new Map(
      (braceletQuery.data || []).map((i: DailyBraceletCalories) => [i.date, i.total_calories]),
    );
    return weekDays.map((day: FoodWeekDaySummary) => {
      const totals = day.daily_totals;
      const expenditure: number | null =
        (expByDate.get(day.date) as number | null | undefined) ?? null;
      const intake = Number(totals.calories || 0);
      return {
        date: day.date,
        protein: totals.protein || 0,
        fat: totals.fat || 0,
        carbs: totals.carbs || 0,
        fiber: totals.fiber || 0,
        calories_intake: intake,
        calories_expenditure: expenditure,
        balance: expenditure == null ? null : intake - expenditure,
        bracelet_calories: braceletByDate.get(day.date) ?? null,
      };
    });
  }, [weekQuery.data?.days, expQuery.data?.items, braceletQuery.data]);

  const selectedDay = useMemo(
    () => days.find((d: {date: string}) => d.date === selectedDate),
    [days, selectedDate],
  );

  const diaryLoading = weekQuery.isLoading;
  const weekError = weekQuery.error;
  const expError = expQuery.error;

  const weekNav = (
    <View style={styles.navRow}>
      <PressableScale
        onPress={() => setAnchorDate(addDaysIso(anchorDate, -7))}
        scaleTo={0.96}
        style={[styles.navBtn, {backgroundColor: colors.surfaceMuted, borderRadius: radius.md}]}>
        <AppText variant="caption" color="textSecondary">
          ← Неделя
        </AppText>
      </PressableScale>
      <Text style={[typography.title3, {color: colors.text}]}>
        {formatWeekRange(anchorDate)}
      </Text>
      <PressableScale
        onPress={() => setAnchorDate(addDaysIso(anchorDate, 7))}
        scaleTo={0.96}
        style={[styles.navBtn, {backgroundColor: colors.surfaceMuted, borderRadius: radius.md}]}>
        <AppText variant="caption" color="textSecondary">
          Неделя →
        </AppText>
      </PressableScale>
    </View>
  );

  return (
    <AppScreen
      title="Питание"
      subtitle="Дневник, макросы и планы"
      stickyFooter={
        foodTab === 'Дневник' ? (
          <AppButton
            label="Добавить приём"
            icon="add"
            size="md"
            fullWidth
            onPress={() => {
              if (!selectedDate) {
                setSelectedDate(today());
              }
              setDayModalOpen(true);
            }}
          />
        ) : undefined
      }>
      <View style={{gap: layout.blockGap, marginTop: layout.blockGap}}>
      <AppTabs options={FOOD_TABS} value={foodTab} onChange={setFoodTab} scrollable compact />

      <FoodPhaseToggle phase={phase} onChange={setPhase} />

      {foodTab !== 'Дневник' ? (
        <>
          {foodTab === 'Микро' ? (
            <FoodMicrosTab anchorDate={anchorDate} phase={phase} />
          ) : foodTab === 'Продукты' ? (
            <FoodProductsTab />
          ) : (
            <FoodPlansPanel anchorDate={anchorDate} />
          )}
        </>
      ) : (
        <>
          {weekNav}
          {!diaryLoading && !weekError && days.length > 0 ? (
            <FoodWeekSummary days={days} phase={phase} />
          ) : null}
          {diaryLoading ? <AppLoadingState label="Загружаем неделю…" compact /> : null}
          {weekError ? (
            <AppErrorState
              message="Не удалось загрузить дневник"
              onRetry={() => {
                weekQuery.refetch();
                expQuery.refetch();
              }}
              compact
            />
          ) : null}
          {expError && !weekError ? (
            <AppText variant="caption" color="warning">
              Расход временно недоступен — показываем дневник без баланса.
            </AppText>
          ) : null}
          {!diaryLoading && !weekError ? (
            <FoodWeekGrid
              days={days}
              onPressDay={date => {
                setSelectedDate(date);
                setDayModalOpen(true);
              }}
            />
          ) : null}
          <DayModal
            visible={dayModalOpen}
            date={selectedDate}
            phase={phase}
            caloriesExpenditure={selectedDay?.calories_expenditure ?? null}
            braceletCalories={selectedDay?.bracelet_calories ?? null}
            onClose={() => setDayModalOpen(false)}
          />
        </>
      )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  navRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  navBtn: {paddingHorizontal: 16, paddingVertical: 10, minHeight: 44},
});
