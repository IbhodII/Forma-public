import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createStretchingLog, fetchStretchingPreset } from "../../api/stretching";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { ModalShell } from "../../components/ui/modal";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import type { StretchingPresetExercise } from "../../types";
import { parseApiError } from "../../utils/validation";
import {
  clearCountdownBeeps,
  playCompleteBeep,
  playFinalCountdown,
  playMidpointBeep,
  resumeStretchAudio,
} from "./stretchSessionSounds";
import { ExerciseImage } from "./ExerciseImage";
import { StretchingExerciseDescriptionModal } from "./StretchingExerciseDescriptionModal";
import { AppPageShell, UnifiedPageHeader } from "../../components/page-shell";
import "./stretchingWellness.css";

const MIN_HOLD = 15;
const MAX_HOLD = 120;
const HOLD_STEP = 5;
const DEFAULT_HOLD = 30;

type TimerStatus = "idle" | "running" | "paused";

function resolveHoldSeconds(ex: StretchingPresetExercise): number {
  const raw = ex.hold_seconds;
  if (!raw) return DEFAULT_HOLD;
  return Math.min(MAX_HOLD, Math.max(MIN_HOLD, raw));
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return String(s);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ExitConfirmModal({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <ModalShell
      open
      onClose={onStay}
      title="Прервать тренировку?"
      description="Прогресс не будет сохранён в журнале."
      size="sm"
      zIndex={60}
      footer={
        <>
          <button type="button" className="btn-secondary text-sm sm:w-auto" onClick={onStay}>
            Продолжить
          </button>
          <button
            type="button"
            className="btn-primary text-sm bg-red-600 hover:bg-red-700 sm:w-auto"
            onClick={onLeave}
          >
            Выйти
          </button>
        </>
      }
    >
      {null}
    </ModalShell>
  );
}

export function StretchingSession() {
  const { presetId: presetIdParam } = useParams<{ presetId: string }>();
  const presetId = Number(presetIdParam);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [holdSeconds, setHoldSeconds] = useState(DEFAULT_HOLD);
  const [remaining, setRemaining] = useState(DEFAULT_HOLD);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("idle");
  const [allDone, setAllDone] = useState(false);
  const [logged, setLogged] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  /** Снять паузу при «Продолжить» в модалке описания (открыли во время отсчёта). */
  const resumeAfterDescriptionRef = useRef(false);
  const sessionStartedAt = useRef<number | null>(null);
  const pendingExitRef = useRef<(() => void) | null>(null);
  const holdSecondsRef = useRef(holdSeconds);
  const midpointPlayedRef = useRef(false);
  const countdownScheduledRef = useRef(false);

  holdSecondsRef.current = holdSeconds;

  const presetQuery = useQuery({
    queryKey: queryKeys.stretchingPresetDetail(presetId),
    queryFn: () => fetchStretchingPreset(presetId),
    enabled: Number.isFinite(presetId) && presetId > 0,
  });

  const exercises = useMemo(() => {
    const list = presetQuery.data?.exercises ?? [];
    return [...list].sort((a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0));
  }, [presetQuery.data?.exercises]);

  const currentExercise = exercises[currentIndex];
  const totalExercises = exercises.length;

  useEffect(() => {
    if (!currentExercise) return;
    const hold = resolveHoldSeconds(currentExercise);
    setHoldSeconds(hold);
    setRemaining(hold);
    setTimerStatus("idle");
    midpointPlayedRef.current = false;
    countdownScheduledRef.current = false;
    clearCountdownBeeps();
  }, [currentIndex, currentExercise?.exercise_id]);

  useEffect(() => {
    if (timerStatus !== "running") return;
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setTimerStatus("idle");
          playCompleteBeep();
          midpointPlayedRef.current = false;
          countdownScheduledRef.current = false;
          clearCountdownBeeps();
          return 0;
        }

        const next = prev - 1;
        const hold = holdSecondsRef.current;
        const midpoint = Math.floor(hold / 2);

        if (next === midpoint && !midpointPlayedRef.current) {
          midpointPlayedRef.current = true;
          playMidpointBeep();
        }

        if (next === 3 && !countdownScheduledRef.current) {
          countdownScheduledRef.current = true;
          playFinalCountdown();
        }

        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerStatus]);

  const needsConfirmToLeave = !logged && totalExercises > 0;

  useEffect(() => {
    if (!needsConfirmToLeave) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [needsConfirmToLeave]);

  const requestExit = useCallback(
    (onConfirmed: () => void) => {
      if (!needsConfirmToLeave) {
        onConfirmed();
        return;
      }
      pendingExitRef.current = onConfirmed;
      setShowExitConfirm(true);
    },
    [needsConfirmToLeave],
  );

  const finishMut = useMutation({
    mutationFn: () => {
      const started = sessionStartedAt.current;
      const durationMinutes =
        started != null ? Math.max(1, Math.round((Date.now() - started) / 60_000)) : null;
      return createStretchingLog({
        date: new Date().toISOString().slice(0, 10),
        preset_id: presetId,
        duration_minutes: durationMinutes,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      setLogged(true);
      showToast("Тренировка сохранена", "success");
      navigate("/stretching?tab=journal");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const adjustHold = (delta: number) => {
    if (timerStatus === "running") return;
    const next = Math.min(MAX_HOLD, Math.max(MIN_HOLD, holdSeconds + delta));
    setHoldSeconds(next);
    setRemaining(next);
  };

  const handleStart = () => {
    resumeStretchAudio();
    if (sessionStartedAt.current == null) {
      sessionStartedAt.current = Date.now();
    }
    if (remaining <= 0) setRemaining(holdSeconds);
    midpointPlayedRef.current = false;
    countdownScheduledRef.current = false;
    clearCountdownBeeps();
    setTimerStatus("running");
  };

  const pauseTimer = useCallback(() => {
    setTimerStatus((s) => {
      if (s === "running") {
        clearCountdownBeeps();
        return "paused";
      }
      return s;
    });
  }, []);

  const handlePause = () => pauseTimer();

  const openDescription = () => {
    if (timerStatus === "running") {
      resumeAfterDescriptionRef.current = true;
      clearCountdownBeeps();
      setTimerStatus("paused");
    } else {
      resumeAfterDescriptionRef.current = false;
    }
    setShowDescription(true);
  };

  const closeDescriptionContinue = () => {
    setShowDescription(false);
    if (resumeAfterDescriptionRef.current) {
      resumeAfterDescriptionRef.current = false;
      resumeStretchAudio();
      setTimerStatus("running");
    }
  };

  const finishWorkoutFromDescription = () => {
    setShowDescription(false);
    resumeAfterDescriptionRef.current = false;
    setTimerStatus("idle");
    clearCountdownBeeps();
    setAllDone(true);
  };

  const handleReset = () => {
    setTimerStatus("idle");
    setRemaining(holdSeconds);
    midpointPlayedRef.current = false;
    countdownScheduledRef.current = false;
    clearCountdownBeeps();
  };

  const handleDone = () => {
    setTimerStatus("idle");
    clearCountdownBeeps();
    playCompleteBeep();
    midpointPlayedRef.current = false;
    countdownScheduledRef.current = false;
    if (currentIndex < totalExercises - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setAllDone(true);
    }
  };

  const handleBack = () => {
    requestExit(() => navigate("/stretching?tab=programs"));
  };

  if (!Number.isFinite(presetId) || presetId <= 0) {
    return (
      <div className="space-y-4">
        <ErrorAlert message="Неверный идентификатор пресета" />
        <button type="button" className="btn-secondary" onClick={() => navigate("/stretching?tab=programs")}>
          К пресетам
        </button>
      </div>
    );
  }

  if (presetQuery.isLoading) {
    return <Loader label="Загрузка тренировки…" />;
  }

  if (presetQuery.isError) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={parseApiError(presetQuery.error)} />
        <button type="button" className="btn-secondary" onClick={() => navigate("/stretching?tab=programs")}>
          К пресетам
        </button>
      </div>
    );
  }

  const preset = presetQuery.data!;

  if (!exercises.length) {
    return (
      <div className="space-y-4">
        <ErrorAlert message="В пресете нет упражнений" />
        <button type="button" className="btn-secondary" onClick={() => navigate("/stretching?tab=programs")}>
          К пресетам
        </button>
      </div>
    );
  }

  return (
    <AppPageShell width="narrow" className="stretch-wellness pb-8">
      <UnifiedPageHeader
        variant="minimal"
        title={preset.name}
        subtitle={!allDone ? `Упражнение ${currentIndex + 1} из ${totalExercises}` : "Сессия завершена"}
        breadcrumbs={[
          { label: "Растяжка", to: "/stretching?tab=programs" },
          { label: preset.name },
        ]}
        actions={
          <button type="button" className="btn-secondary text-sm sm:w-auto" onClick={handleBack}>
            ← Назад
          </button>
        }
      />

      {!allDone ? (
        <div className="stretch-wellness__glass rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-4 sm:space-y-6 text-center">
          <div
            className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
            role="progressbar"
            aria-valuenow={currentIndex + 1}
            aria-valuemin={1}
            aria-valuemax={totalExercises}
          >
            <div
              className="h-full bg-brand-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / totalExercises) * 100}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
            <div
              className={[
                "text-6xl sm:text-8xl font-bold tabular-nums tracking-tight transition-colors",
                timerStatus === "running" ? "text-brand-600 dark:text-brand-400" : "text-slate-800 dark:text-slate-100",
                remaining === 0 && timerStatus === "idle" ? "text-green-600 dark:text-green-400" : "",
              ].join(" ")}
            >
              {formatTimer(remaining)}
            </div>
            <button
              type="button"
              className="btn-secondary text-sm shrink-0 self-center sm:w-auto"
              onClick={openDescription}
            >
              Описание
            </button>
          </div>

          {timerStatus === "paused" && currentExercise && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3 text-left">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {currentExercise.exercise_name ?? "Упражнение"}
              </h2>
              {currentExercise.target_muscle_group && (
                <p className="text-sm text-slate-500">{currentExercise.target_muscle_group}</p>
              )}
              <ExerciseImage
                imagesJson={currentExercise.images_json}
                alt={currentExercise.exercise_name ?? ""}
              />
              <button type="button" className="btn-secondary text-sm w-full" onClick={openDescription}>
                Описание
              </button>
            </div>
          )}

          {timerStatus !== "paused" && (
            <ExerciseImage
              imagesJson={currentExercise?.images_json}
              alt={currentExercise?.exercise_name ?? ""}
            />
          )}

          <div className="space-y-1 px-1 sm:px-2">
            {timerStatus !== "paused" && (
              <>
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                  {currentExercise?.exercise_name ?? "Упражнение"}
                </h2>
                {currentExercise?.target_muscle_group && (
                  <p className="text-sm text-slate-500">{currentExercise.target_muscle_group}</p>
                )}
              </>
            )}
            {currentExercise?.notes && (
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{currentExercise.notes}</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              className="h-11 w-11 rounded-full border border-slate-300 dark:border-slate-600 text-lg font-semibold disabled:opacity-40"
              disabled={timerStatus === "running" || holdSeconds <= MIN_HOLD}
              onClick={() => adjustHold(-HOLD_STEP)}
              aria-label="Уменьшить время на 5 секунд"
            >
              −
            </button>
            <span className="text-sm text-slate-500 tabular-nums w-16">{holdSeconds} сек</span>
            <button
              type="button"
              className="h-11 w-11 rounded-full border border-slate-300 dark:border-slate-600 text-lg font-semibold disabled:opacity-40"
              disabled={timerStatus === "running" || holdSeconds >= MAX_HOLD}
              onClick={() => adjustHold(HOLD_STEP)}
              aria-label="Увеличить время на 5 секунд"
            >
              +
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              className="btn-primary py-3 min-h-[44px] sm:min-h-0"
              disabled={timerStatus === "running"}
              onClick={handleStart}
            >
              {timerStatus === "paused" ? "Продолжить" : "Старт"}
            </button>
            <button
              type="button"
              className="btn-secondary py-3 min-h-[44px] sm:min-h-0"
              disabled={timerStatus !== "running"}
              onClick={handlePause}
            >
              Пауза
            </button>
            <button
              type="button"
              className="btn-secondary py-3 min-h-[44px] sm:min-h-0"
              disabled={timerStatus === "running"}
              onClick={handleReset}
            >
              Сброс
            </button>
            <button
              type="button"
              className="btn-primary py-3 min-h-[44px] sm:min-h-0 bg-green-600 hover:bg-green-700"
              onClick={handleDone}
            >
              Готово
            </button>
          </div>
        </div>
      ) : (
        <div className="card-panel space-y-6 text-center py-8">
          <div className="text-5xl" aria-hidden>
            ✓
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Тренировка завершена</h2>
            <p className="text-sm text-slate-500">
              {totalExercises} упражнений · {preset.name}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto px-8 py-3"
            disabled={finishMut.isPending}
            onClick={() => finishMut.mutate()}
          >
            {finishMut.isPending ? "Сохранение…" : "Завершить тренировку"}
          </button>
        </div>
      )}

      {showDescription && currentExercise && (
        <StretchingExerciseDescriptionModal
          exercise={currentExercise}
          onContinue={closeDescriptionContinue}
          onFinishWorkout={finishWorkoutFromDescription}
          onClose={closeDescriptionContinue}
        />
      )}

      {showExitConfirm && (
        <ExitConfirmModal
          onStay={() => {
            setShowExitConfirm(false);
            pendingExitRef.current = null;
          }}
          onLeave={() => {
            setShowExitConfirm(false);
            pendingExitRef.current?.();
            pendingExitRef.current = null;
          }}
        />
      )}
    </AppPageShell>
  );
}
