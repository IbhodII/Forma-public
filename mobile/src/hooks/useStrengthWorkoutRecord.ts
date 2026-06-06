import {useCallback, useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {fetchUserProfile} from '../api/user';
import {fetchStrengthExercises} from '../api/strength';
import {
  deleteStrengthSession,
  fetchStrengthSessionDetail,
  fetchWorkoutFormPrefill,
  saveStrengthWorkout,
  type SavePayload,
} from '../api/workouts';
import {
  approachesFromPrefill,
  approachesFromSessionDetail,
  approachesToStrengthSets,
  cloneWorkoutApproach,
  newWorkoutApproach,
  type WorkoutApproach,
} from '../strength/workoutApproaches';
import {formatDateRu} from '../utils/formatDateRu';

export type WorkoutRecordEdit = {
  date: string;
  workoutTitle: string;
};

type Params = {
  workoutTitle: string;
  presetId?: number;
  date?: string;
  edit?: WorkoutRecordEdit;
};

export function useStrengthWorkoutRecord({workoutTitle, presetId, date: dateParam, edit}: Params) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
  });
  const useAmerican = profileQuery.data?.units_system === 'american';

  const [date, setDate] = useState(edit?.date ?? dateParam ?? new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(edit?.workoutTitle ?? workoutTitle);
  const [avgHr, setAvgHr] = useState('');
  const [kcalChest, setKcalChest] = useState('');
  const [kcalWatch, setKcalWatch] = useState('');
  const [circuitWorkout, setCircuitWorkout] = useState(false);
  const [approaches, setApproaches] = useState<WorkoutApproach[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const sessionStartedAt = useMemo(() => Date.now(), []);

  const catalogQuery = useQuery({
    queryKey: ['strength-exercises-catalog'],
    queryFn: fetchStrengthExercises,
  });

  const prefillQuery = useQuery({
    queryKey: ['strength-prefill', title, date, presetId],
    queryFn: () => fetchWorkoutFormPrefill(title, presetId),
    enabled: !edit && Boolean(title),
  });

  const editQuery = useQuery({
    queryKey: ['strength-detail', edit?.date, edit?.workoutTitle],
    queryFn: () => fetchStrengthSessionDetail(edit!.date, edit!.workoutTitle),
    enabled: Boolean(edit?.date && edit?.workoutTitle),
  });

  useEffect(() => {
    if (!edit || !editQuery.data) {
      return;
    }
    const detail = editQuery.data;
    setDate(detail.date);
    setTitle(detail.workout_title);
    setAvgHr(detail.avg_hr != null ? String(detail.avg_hr) : '');
    setKcalChest(detail.calories_chest != null ? String(detail.calories_chest) : '');
    setKcalWatch(detail.calories_watch != null ? String(detail.calories_watch) : '');
    setCircuitWorkout(Boolean(detail.is_circuit ?? detail.uses_ordered_sets));
    setApproaches(approachesFromSessionDetail(detail, useAmerican));
  }, [edit, editQuery.data, useAmerican]);

  useEffect(() => {
    if (edit || !prefillQuery.data) {
      return;
    }
    const prefill = prefillQuery.data;
    if (prefill.date) {
      setDate(prefill.date);
    }
    const formatWeight = (kg: number) => `${kg} кг`;
    setApproaches(
      approachesFromPrefill(prefill, useAmerican, formatWeight, formatDateRu),
    );
    const m = prefill.session_metrics;
    if (m?.avg_hr != null) {
      setAvgHr(String(m.avg_hr));
    }
    if (m?.calories_chest != null) {
      setKcalChest(String(m.calories_chest));
    }
    if (m?.calories_watch != null) {
      setKcalWatch(String(m.calories_watch));
    }
  }, [prefillQuery.data, edit, useAmerican]);

  const updateApproach = useCallback((index: number, patch: Partial<WorkoutApproach>) => {
    setApproaches(prev =>
      prev.map((row, i) => (i === index ? {...row, ...patch} : row)),
    );
  }, []);

  const removeApproach = useCallback((index: number) => {
    setApproaches(prev => prev.filter((_, i) => i !== index));
  }, []);

  const duplicateApproach = useCallback((index: number) => {
    setApproaches(prev => {
      const copy = cloneWorkoutApproach(prev[index]!);
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const addApproach = useCallback(
    (exercise = '') => {
      setApproaches(prev => [
        ...prev,
        newWorkoutApproach(useAmerican, {exercise}),
      ]);
    },
    [useAmerican],
  );

  const addSetToExercise = useCallback(
    (exerciseName: string) => {
      const last = [...approaches].reverse().find(a => a.exercise === exerciseName);
      setApproaches(prev => [
        ...prev,
        newWorkoutApproach(useAmerican, {
          exercise: exerciseName,
          reps: last?.reps ?? '8',
          weightKg: last ? Number(last.weight) || 0 : 0,
          is_bodyweight: last?.is_bodyweight,
        }),
      ]);
    },
    [approaches, useAmerican],
  );

  const addWarmupToExercise = useCallback(
    (exerciseName: string) => {
      const last = [...approaches].reverse().find(a => a.exercise === exerciseName);
      setApproaches(prev => [
        ...prev,
        newWorkoutApproach(useAmerican, {
          exercise: exerciseName,
          reps: last?.reps ?? '8',
          weightKg: last ? Math.max(0, (Number(last.weight) || 0) * 0.5) : 0,
          is_bodyweight: last?.is_bodyweight,
          is_warmup: true,
        }),
      ]);
    },
    [approaches, useAmerican],
  );

  const draftKey = useMemo(
    () =>
      edit
        ? `workout-draft:edit:${edit.date}:${edit.workoutTitle}`
        : `workout-draft:${workoutTitle}:${dateParam ?? 'new'}`,
    [edit, workoutTitle, dateParam],
  );

  useEffect(() => {
    if (edit) {
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(draftKey).then(raw => {
      if (cancelled || !raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as {
          approaches?: WorkoutApproach[];
          date?: string;
          title?: string;
        };
        if (parsed.approaches?.length) {
          setApproaches(parsed.approaches);
        }
        if (parsed.date) {
          setDate(parsed.date);
        }
        if (parsed.title) {
          setTitle(parsed.title);
        }
      } catch {
        // ignore corrupt draft
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey, edit]);

  useEffect(() => {
    if (edit || approaches.length === 0) {
      return;
    }
    void AsyncStorage.setItem(
      draftKey,
      JSON.stringify({approaches, date, title}),
    );
  }, [approaches, date, title, draftKey, edit]);

  const renameExercise = useCallback((indices: number[], name: string) => {
    setApproaches(prev =>
      prev.map((row, i) => (indices.includes(i) ? {...row, exercise: name} : row)),
    );
  }, []);

  const removeExercise = useCallback((indices: number[]) => {
    const set = new Set(indices);
    setApproaches(prev => prev.filter((_, i) => !set.has(i)));
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (body: SavePayload) => {
      if (edit) {
        await deleteStrengthSession(edit.date, edit.workoutTitle);
      }
      return saveStrengthWorkout(body);
    },
    onSuccess: async () => {
      await AsyncStorage.removeItem(draftKey);
      void queryClient.invalidateQueries({queryKey: ['strength-sessions']});
      void queryClient.invalidateQueries({queryKey: ['strength-sessions-recent']});
      void queryClient.invalidateQueries({queryKey: ['analytics']});
    },
  });

  const buildPayload = useCallback((): SavePayload => {
    const sets = approachesToStrengthSets(approaches, useAmerican);
    return {
      date,
      workout_title: title.trim(),
      preset_id: presetId ?? null,
      is_circuit: circuitWorkout,
      sets,
      avg_hr: avgHr.trim() ? Number(avgHr) : null,
      calories_chest: kcalChest.trim() ? Number(kcalChest) : null,
      calories_watch: kcalWatch.trim() ? Number(kcalWatch) : null,
    };
  }, [approaches, useAmerican, date, title, presetId, circuitWorkout, avgHr, kcalChest, kcalWatch]);

  const submit = useCallback(async () => {
    try {
      setFormError(null);
      const body = buildPayload();
      if (!body.workout_title) {
        throw new Error('Укажите название тренировки');
      }
      await saveMutation.mutateAsync(body);
      return true;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [buildPayload, saveMutation]);

  const loading = Boolean(edit ? editQuery.isLoading : prefillQuery.isLoading);
  const catalogNames = catalogQuery.data ?? [];

  return {
    date,
    setDate,
    title,
    setTitle,
    avgHr,
    setAvgHr,
    kcalChest,
    setKcalChest,
    kcalWatch,
    setKcalWatch,
    circuitWorkout,
    setCircuitWorkout,
    approaches,
    setApproaches,
    formError,
    loading,
    saving: saveMutation.isPending,
    catalogNames,
    updateApproach,
    removeApproach,
    duplicateApproach,
    addApproach,
    addSetToExercise,
    addWarmupToExercise,
    renameExercise,
    removeExercise,
    submit,
    sessionStartedAt,
    isEdit: Boolean(edit),
  };
}
