import { useQuery } from "@tanstack/react-query";
import { fetchSessionDetail } from "../../api/strength";
import { useUnits } from "../../hooks/useUnits";
import { queryKeys } from "../../hooks/queryKeys";
import type { StrengthSession } from "../../types";
import { formatDateRu, formatDuration } from "../../utils/format";
import { parseApiError } from "../../utils/validation";
import { ErrorAlert } from "../ErrorAlert";
import { Loader } from "../Loader";
import {
  countSetsInRepsStr,
  countStrengthSetsFromDetail,
  formatSessionSetLabel,
  groupSessionSetsByExercise,
  sessionDisplaySetsFromDetail,
  sessionTimelineItemsFromDetail,
  type SessionDisplaySet,
} from "./workoutApproaches";

function formatSetLoad(
  s: SessionDisplaySet,
  formatBarbellWeight: (kg: number) => string,
): string {
  if (s.is_bodyweight || s.reps_str.includes("сек")) {
    return s.reps_str;
  }
  return `${formatBarbellWeight(s.weight)} × ${s.reps_str}`;
}

export function StrengthSessionDetailView({
  session,
  onBack,
}: {
  session: StrengthSession;
  onBack?: () => void;
}) {
  const { formatBarbellWeight, formatEnergy } = useUnits();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.strengthDetail(session.date, session.workout_title),
    queryFn: () => fetchSessionDetail(session.date, session.workout_title),
  });

  const setsCount =
    data != null ? countStrengthSetsFromDetail(data) : session.sets_count;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-slate-900">
            {formatDateRu(session.date)} · {session.workout_title}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">Силовая тренировка</p>
        </div>
        {onBack && (
          <button type="button" className="btn-secondary text-sm" onClick={onBack}>
            ← К списку
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Подходы</p>
          <p className="font-semibold text-slate-900 tabular-nums">{setsCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Объём</p>
          <p className="font-semibold text-slate-900 tabular-nums">
            {session.volume_kg != null && session.volume_kg > 0
              ? `${Math.round(session.volume_kg)} кг`
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Длительность</p>
          <p className="font-semibold text-slate-900 tabular-nums">
            {session.duration_sec != null && session.duration_sec > 0
              ? formatDuration(session.duration_sec)
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Ср. пульс</p>
          <p className="font-semibold text-slate-900 tabular-nums">
            {(data?.avg_hr ?? session.avg_hr) != null ? `${data?.avg_hr ?? session.avg_hr} уд/мин` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Ккал пульсометр</p>
          <p className="font-semibold text-slate-900 tabular-nums">
            {(data?.calories_chest ?? session.calories_chest) != null
              ? formatEnergy((data?.calories_chest ?? session.calories_chest)!)
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Ккал часы</p>
          <p className="font-semibold text-slate-900 tabular-nums">
            {(data?.calories_watch ?? session.calories_watch) != null
              ? formatEnergy((data?.calories_watch ?? session.calories_watch)!)
              : "—"}
          </p>
        </div>
      </div>

      {isLoading && <Loader label="Подходы…" />}
      {isError && <ErrorAlert message={parseApiError(error)} />}
      {data &&
        (() => {
          const sets = sessionDisplaySetsFromDetail(data);
          if (!sets.length) {
            return <p className="text-sm text-slate-500">Нет данных по подходам.</p>;
          }
          const timelineItems = sessionTimelineItemsFromDetail(data);
          const isCircuit = Boolean(data.is_circuit);

          if (timelineItems.some((item) => item.kind === "block")) {
            return (
              <div className="space-y-3">
                {timelineItems.map((item, itemIndex) =>
                  item.kind === "normal" ? (
                      <div key={`normal-${item.exercise}-${itemIndex}`} className="rounded-lg border border-slate-200 overflow-hidden">
                        <p className="px-3 py-2 bg-slate-100 font-medium text-slate-900">{item.exercise}</p>
                        <ul className="divide-y divide-slate-100">
                          {(() => {
                            let prior = 0;
                            return item.sets.map((s, j) => {
                              const label = formatSessionSetLabel(s.reps_str, prior);
                              prior += countSetsInRepsStr(s.reps_str);
                              return (
                                <li key={j} className="px-3 py-2 text-sm text-slate-800">
                                  <span className="text-slate-500 tabular-nums">{label}:</span>{" "}
                                  {s.is_warmup && (
                                    <span className="text-xs mr-1 rounded bg-slate-200 px-1.5 py-0.5">
                                      Разминка
                                    </span>
                                  )}
                                  {formatSetLoad(s, formatBarbellWeight)}
                                </li>
                              );
                            });
                          })()}
                        </ul>
                      </div>
                  ) : (
                  <div key={item.block.id} className="rounded-lg border border-slate-200 overflow-hidden">
                    <p className="px-3 py-2 bg-slate-100 font-medium text-slate-900">
                      {item.block.title || (item.block.type === "superset" ? "Суперсет" : "Круг")}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        #{timelineItems.slice(0, itemIndex + 1).filter((x) => x.kind === "block").length}
                        {` · ${item.block.rounds} раунд.`}
                      </span>
                    </p>
                    <ul className="divide-y divide-slate-100">
                      {item.block.sets.filter((s) => (s.round_index ?? 1) === 1).map((s, i) => (
                        <li key={`${s.order_index ?? i}-${s.exercise}`} className="px-3 py-2 text-sm text-slate-800">
                          <span className="text-slate-500 tabular-nums">
                            {i + 1}:
                          </span>{" "}
                          <span className="font-medium">{s.exercise}</span>
                          {" — "}
                          {s.is_warmup && (
                            <span className="text-xs mr-1 rounded bg-slate-200 px-1.5 py-0.5">
                              Разминка
                            </span>
                          )}
                          {formatSetLoad(s, formatBarbellWeight)}
                        </li>
                      ))}
                    </ul>
                    {item.block.rounds > 1 ? (
                      <p className="px-3 py-2 text-xs font-medium text-slate-500">
                        Повторено {item.block.rounds} раунд.
                      </p>
                    ) : null}
                  </div>
                  ),
                )}
              </div>
            );
          }

          if (!isCircuit) {
            const groups = groupSessionSetsByExercise(sets);
            return (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.exercise} className="rounded-lg border border-slate-200 overflow-hidden">
                    <p className="px-3 py-2 bg-slate-100 font-medium text-slate-900">{g.exercise}</p>
                    <ul className="divide-y divide-slate-100">
                      {(() => {
                        let prior = 0;
                        return g.sets.map((s, j) => {
                          const label = formatSessionSetLabel(s.reps_str, prior);
                          prior += countSetsInRepsStr(s.reps_str);
                          return (
                            <li key={j} className="px-3 py-2 text-sm text-slate-800">
                              <span className="text-slate-500 tabular-nums">{label}:</span>{" "}
                              {s.is_warmup && (
                                <span className="text-xs mr-1 rounded bg-slate-200 px-1.5 py-0.5">
                                  Разминка
                                </span>
                              )}
                              {formatSetLoad(s, formatBarbellWeight)}
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {sets.map((s, i) => (
                <li key={i} className="px-3 py-2 text-sm text-slate-800">
                  <span className="text-slate-500 tabular-nums">
                    #{s.order_index ?? i + 1}
                  </span>{" "}
                  <span className="font-medium">{s.exercise}</span>
                  {" — "}
                  {s.is_warmup && (
                    <span className="text-xs mr-1 rounded bg-slate-200 px-1.5 py-0.5">Разминка</span>
                  )}
                  {formatSetLoad(s, formatBarbellWeight)}
                </li>
              ))}
            </ul>
          );
        })()}
    </div>
  );
}
