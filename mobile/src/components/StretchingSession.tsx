import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, StyleSheet, View} from 'react-native';
import {useMutation, useQuery} from '@tanstack/react-query';

import {createStretchingLog, fetchStretchingPreset} from '../api/stretching';
import {notifySave} from '../haptics';
import {generatePostWorkoutInsights, type Insight} from '../insights';
import {useInsights} from '../insights/useInsights';
import {AppButton, AppInput, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  presetId: number;
  onClose: () => void;
};

function imageUrl(path: string | undefined | null): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/${path}`;
}

export function StretchingSession({presetId, onClose}: Props) {
  const {colors, radius, layout} = useDesignSystem();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [notes, setNotes] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [savedInsight, setSavedInsight] = useState<Insight | null>(null);
  const {ctx: insightCtx} = useInsights('post_workout', {limit: 1});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const presetQuery = useQuery({
    queryKey: ['stretching-preset-session', presetId],
    queryFn: () => fetchStretchingPreset(presetId),
  });

  const exercises = presetQuery.data?.exercises || [];
  const current = exercises[currentIndex];

  const initialSec = useMemo(() => {
    const hold = Number(current?.hold_seconds || 0);
    const reps = Number(current?.reps || 0);
    return Math.max(hold, reps > 0 ? reps * 2 : 10, 5);
  }, [current?.hold_seconds, current?.reps]);

  useEffect(() => {
    setRemainingSec(initialSec);
  }, [initialSec, currentIndex]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
      }
    },
    [],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      createStretchingLog({
        date: new Date().toISOString().slice(0, 10),
        preset_id: presetId,
        duration_minutes: Math.max(1, Math.round(elapsedSec / 60)),
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      notifySave();
      const tips = generatePostWorkoutInsights(insightCtx, {
        kind: 'stretch',
        title: presetQuery.data?.name ?? 'Растяжка',
        setsOrMinutes: Math.max(1, Math.round(elapsedSec / 60)),
      });
      if (tips[0]) {
        setSavedInsight(tips[0]);
        setShowFinish(false);
      } else {
        setShowFinish(false);
        onClose();
      }
    },
  });

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearElapsed = () => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  };

  const startTimer = () => {
    if (!current) {
      return;
    }
    setStarted(true);
    setPaused(false);
    if (!elapsedRef.current) {
      elapsedRef.current = setInterval(() => {
        setElapsedSec(prev => prev + 1);
      }, 1000);
    }
    clearTimer();
    timerRef.current = setInterval(() => {
      setRemainingSec(prev => {
        if (prev <= 1) {
          clearTimer();
          if (currentIndex >= exercises.length - 1) {
            setShowFinish(true);
            clearElapsed();
            return 0;
          }
          setCurrentIndex(idx => idx + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pauseTimer = () => {
    setPaused(true);
    clearTimer();
    clearElapsed();
  };

  const nextExercise = () => {
    clearTimer();
    if (currentIndex >= exercises.length - 1) {
      setShowFinish(true);
      clearElapsed();
      return;
    }
    setCurrentIndex(idx => idx + 1);
    if (!paused) {
      startTimer();
    }
  };

  if (presetQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!current) {
    return (
      <View style={styles.center}>
        <AppText variant="body">Упражнения не найдены</AppText>
      </View>
    );
  }

  const firstImage = imageUrl(current.images_json?.[0]);

  return (
    <View style={[styles.root, {backgroundColor: colors.bg, gap: layout.blockGap}]}>
      <AppText variant="title2">{presetQuery.data?.name || 'Растяжка'}</AppText>
      <AppText variant="body" color="textSecondary">
        Упражнение {currentIndex + 1}/{exercises.length}
      </AppText>
      <AppText variant="title3">{current.exercise_name || `#${current.exercise_id}`}</AppText>
      {!!current.notes && (
        <AppText variant="caption" color="textMuted">
          Заметка: {current.notes}
        </AppText>
      )}

      {firstImage ? (
        <Image source={{uri: firstImage}} style={[styles.image, {borderRadius: radius.md}]} />
      ) : (
        <View
          style={[
            styles.image,
            styles.imagePlaceholder,
            {borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
          ]}>
          <AppText variant="body" color="textMuted">
            Нет изображения
          </AppText>
        </View>
      )}

      <AppText variant="display" style={styles.timer}>
        {remainingSec}s
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.elapsed}>
        Прошло: {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
      </AppText>

      <View style={styles.actions}>
        <AppButton
          label={started && !paused ? 'Перезапуск' : 'Старт'}
          size="sm"
          onPress={startTimer}
          style={styles.actionBtn}
        />
        <AppButton label="Пауза" variant="secondary" size="sm" onPress={pauseTimer} style={styles.actionBtn} />
        <AppButton label="Следующее" variant="secondary" size="sm" onPress={nextExercise} style={styles.actionBtn} />
      </View>

      <AppSheet visible={Boolean(savedInsight)} title={savedInsight?.title ?? ''} onClose={onClose}>
        <AppText variant="body" color="textSecondary">
          {savedInsight?.body}
        </AppText>
        <AppButton
          label="Готово"
          onPress={() => {
            setSavedInsight(null);
            onClose();
          }}
        />
      </AppSheet>

      <AppSheet
        visible={showFinish}
        title="Тренировка завершена"
        subtitle={`Длительность: ${Math.max(1, Math.round(elapsedSec / 60))} мин`}
        onClose={() => setShowFinish(false)}>
        <AppInput placeholder="Заметки" value={notes} onChangeText={setNotes} />
        <View style={styles.actions}>
          <AppButton label="Отмена" variant="secondary" onPress={() => setShowFinish(false)} />
          <AppButton
            label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить сессию'}
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          />
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 12},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  image: {width: '100%', height: 240},
  imagePlaceholder: {justifyContent: 'center', alignItems: 'center'},
  timer: {textAlign: 'center', marginVertical: 6},
  elapsed: {textAlign: 'center'},
  actions: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  actionBtn: {flex: 1},
});
