import React, {useMemo} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQuery} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  fetchCardioAvailability,
  fetchCardioWorkoutById,
  fetchGps,
  fetchHeartRate,
  fetchWorkoutPoints,
  fetchWorkoutPower,
  fetchWorkoutSensors,
} from '../api/cardio';
import {CardioGpsRouteBlock} from '../components/cardio/detail/CardioGpsRouteBlock';
import {CardioHrChartBlock} from '../components/cardio/detail/CardioHrChartBlock';
import {CardioHrSummaryBlock} from '../components/cardio/detail/CardioHrSummaryBlock';
import {CardioPowerBlock} from '../components/cardio/detail/CardioPowerBlock';
import {CardioSensorsBlock} from '../components/cardio/detail/CardioSensorsBlock';
import {CardioSummaryBlock} from '../components/cardio/detail/CardioSummaryBlock';
import {AppCard, AppErrorState, AppHeader, AppLoadingState, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {queryKeys} from '../hooks/queryKeys';
import {useScreenInsets} from '../layout/useScreenInsets';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';
import {availabilityForWorkout} from '../utils/cardioAvailability';
import {cardioTypeLabel, formatDuration} from '../utils/cardioFormat';
import type {TrackPoint} from '../utils/bikeTrack';
import type {WorkoutPointsResponse} from '../types/cardio';

type Route = RouteProp<WorkoutsStackParamList, 'CardioDetail'>;
type Nav = NativeStackNavigationProp<WorkoutsStackParamList, 'CardioDetail'>;

export default function CardioDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const {workoutId} = route.params;
  const insets = useSafeAreaInsets();
  const {bottom: scrollBottom} = useScreenInsets();
  const {colors, layout, space} = useDesignSystem();

  const workoutQuery = useQuery({
    queryKey: queryKeys.cardioWorkout(workoutId),
    queryFn: () => fetchCardioWorkoutById(workoutId),
  });

  const availabilityQuery = useQuery({
    queryKey: queryKeys.cardioAvailability([workoutId]),
    queryFn: () => fetchCardioAvailability([workoutId]),
    enabled: Boolean(workoutQuery.data),
  });

  const flags = availabilityForWorkout(availabilityQuery.data, workoutId);
  const workout = workoutQuery.data;
  const isBike = workout?.type === 'вело';
  const isPool = workout?.type === 'бассейн';
  const showHr = flags.has_hr && !isPool;
  const showGps = flags.has_gps && !isPool;
  const showSensors = flags.has_sensors && isBike;
  const showPower = isBike;

  const hrQuery = useQuery({
    queryKey: queryKeys.cardioHr(workoutId),
    queryFn: () => fetchHeartRate(workoutId),
    enabled: showHr,
    staleTime: 5 * 60_000,
  });

  const gpsQuery = useQuery({
    queryKey: queryKeys.cardioGps(workoutId),
    queryFn: () => fetchGps(workoutId),
    enabled: showGps && !isBike,
    staleTime: 5 * 60_000,
  });

  const pointsQuery = useQuery({
    queryKey: queryKeys.cardioPoints(workoutId, 2),
    queryFn: () => fetchWorkoutPoints(workoutId, 2),
    enabled: showGps && isBike,
    staleTime: 5 * 60_000,
  });

  const sensorsQuery = useQuery({
    queryKey: queryKeys.cardioSensors(workoutId, 2),
    queryFn: () => fetchWorkoutSensors(workoutId, 2),
    enabled: showSensors,
    staleTime: 5 * 60_000,
  });

  const powerQuery = useQuery({
    queryKey: queryKeys.cardioPower(workoutId),
    queryFn: () => fetchWorkoutPower(workoutId),
    enabled: showPower,
    staleTime: 5 * 60_000,
  });

  const mapPoints: TrackPoint[] | undefined = useMemo(() => {
    if (pointsQuery.data?.points?.length) {
      return pointsQuery.data.points.map((p: WorkoutPointsResponse['points'][number]) => ({
        lat: p.lat,
        lon: p.lon,
        elapsedSec: p.elapsed_sec,
        speedKmh: p.speed_kmh,
        cadence: p.cadence,
        elevationM: p.elevation_m,
        heartRate: p.heart_rate,
      }));
    }
    return undefined;
  }, [pointsQuery.data]);

  const offlineHint =
    hrQuery.isError || gpsQuery.isError || sensorsQuery.isError || powerQuery.isError;

  return (
    <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
      <AppHeader
        title={workout ? cardioTypeLabel(workout.type) : 'Кардио'}
        subtitle={
          workout
            ? `${workout.date} · ${formatDuration(workout.duration_sec)}`
            : undefined
        }
        onClose={() => navigation.goBack()}
        closeIcon="back"
        inset={false}
      />

      {workoutQuery.isLoading ? <AppLoadingState label="Загрузка…" /> : null}
      {workoutQuery.error || (!workoutQuery.isLoading && !workout) ? (
        <AppErrorState
          message="Тренировка не найдена"
          onRetry={() => workoutQuery.refetch()}
        />
      ) : null}

      {workout ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.screenPaddingX,
            paddingBottom: scrollBottom + space[6],
            gap: layout.blockGap,
          }}
          showsVerticalScrollIndicator={false}>
          {offlineHint ? (
            <AppText variant="caption" color="textMuted">
              Нет сети — детали недоступны
            </AppText>
          ) : null}

          <AppCard padding="md">
            <CardioSummaryBlock workout={workout} />
          </AppCard>

          {showHr ? (
            <AppCard padding="md" style={{gap: layout.stackGap}}>
              <CardioHrSummaryBlock
                workout={workout}
                points={hrQuery.data?.points ?? []}
                hasHr={Boolean(hrQuery.data?.points?.length)}
              />
              <CardioHrChartBlock
                points={hrQuery.data?.points ?? []}
                loading={hrQuery.isLoading}
                error={hrQuery.isError}
                onRetry={() => hrQuery.refetch()}
              />
            </AppCard>
          ) : !isPool ? (
            <AppCard padding="md">
              <AppText variant="caption" color="textMuted">
                Пульс не записан
              </AppText>
            </AppCard>
          ) : null}

          {showGps ? (
            <AppCard padding="md">
              <CardioGpsRouteBlock
                geo={gpsQuery.data}
                pointsOverride={mapPoints}
                loading={gpsQuery.isLoading || pointsQuery.isLoading}
                error={gpsQuery.isError || pointsQuery.isError}
                onRetry={() => {
                  void gpsQuery.refetch();
                  void pointsQuery.refetch();
                }}
              />
            </AppCard>
          ) : null}

          {showSensors ? (
            <AppCard padding="md">
              <CardioSensorsBlock
                sensors={sensorsQuery.data}
                loading={sensorsQuery.isLoading}
                error={sensorsQuery.isError}
                onRetry={() => sensorsQuery.refetch()}
              />
            </AppCard>
          ) : null}

          {showPower ? (
            <AppCard padding="md">
              <CardioPowerBlock
                workout={workout}
                power={powerQuery.data}
                loading={powerQuery.isLoading}
                error={powerQuery.isError}
                onRetry={() => powerQuery.refetch()}
              />
            </AppCard>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});
