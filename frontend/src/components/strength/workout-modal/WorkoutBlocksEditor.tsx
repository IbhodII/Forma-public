import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { StrengthNextWorkoutSuggestion } from "../../../api/strength";
import { cn } from "../../../lib/utils";
import {
  applyRoundToAllRounds,
  cloneWorkoutApproach,
  cloneWorkoutBlock,
  ensureBlockRoundApproaches,
  newWorkoutApproach,
  newWorkoutBlock,
  type WorkoutApproach,
  type WorkoutBlock,
  type WorkoutBlockType,
} from "../workoutApproaches";
import { ExerciseCard } from "./ExerciseCard";
import { ExerciseSetTable } from "./ExerciseSetTable";
import { SetRow } from "./SetRow";

const BLOCK_LABEL: Record<WorkoutBlockType, string> = {
  normal: "Обычный блок",
  superset: "Суперсет",
  circuit: "Круг",
};

const BLOCK_HINT: Record<WorkoutBlockType, string> = {
  normal: "Подходы выполняются как в обычной тренировке.",
  superset: "2 упражнения выполняются подряд, затем следующий раунд.",
  circuit: "Несколько упражнений выполняются по кругу заданное число раундов.",
};

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function exerciseKey(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU");
}

function orderedExerciseNames(approaches: WorkoutApproach[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of approaches) {
    const name = row.exercise.trim();
    const key = exerciseKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function WorkoutBlocksEditor({
  blocks,
  catalogNames,
  suggestionByExercise,
  useAmerican,
  simpleVariant = "cards",
  structureVariant = "sets",
  onReplaceBlocks,
}: {
  blocks: WorkoutBlock[];
  catalogNames: string[];
  suggestionByExercise: Map<string, StrengthNextWorkoutSuggestion>;
  useAmerican: boolean;
  simpleVariant?: "cards" | "list";
  structureVariant?: "sets" | "layout";
  onReplaceBlocks: (next: WorkoutBlock[]) => void;
}) {
  const [completedRounds, setCompletedRounds] = useState<Record<string, number>>({});
  const [expandedWorkoutBlocks, setExpandedWorkoutBlocks] = useState<Record<string, boolean>>({});
  const [activeRoundByBlock, setActiveRoundByBlock] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<"simple" | "structure">("simple");

  const updateBlock = (blockIndex: number, patch: Partial<WorkoutBlock>) => {
    onReplaceBlocks(blocks.map((b, i) => (i === blockIndex ? { ...b, ...patch } : b)));
  };

  const patchBlock = (blockIndex: number, next: WorkoutBlock) => {
    onReplaceBlocks(blocks.map((b, i) => (i === blockIndex ? next : b)));
  };

  const activeRoundFor = (block: WorkoutBlock) => {
    const idx = activeRoundByBlock[block.id] ?? 0;
    return Math.min(Math.max(0, idx), Math.max(0, block.rounds - 1));
  };

  const updateBlockRounds = (blockIndex: number, rounds: number) => {
    const block = blocks[blockIndex];
    if (!block) return;
    patchBlock(blockIndex, ensureBlockRoundApproaches({ ...block, rounds }, useAmerican));
  };

  const updateRoundApproach = (
    blockIndex: number,
    roundIndex: number,
    approachIndex: number,
    patch: Partial<WorkoutApproach>,
  ) => {
    const block = ensureBlockRoundApproaches(blocks[blockIndex], useAmerican);
    const roundApproaches = block.roundApproaches?.map((round, ri) =>
      ri === roundIndex
        ? round.map((row, j) => (j === approachIndex ? { ...row, ...patch } : row))
        : round,
    );
    const approaches =
      roundIndex === 0
        ? roundApproaches?.[0]?.map(cloneWorkoutApproach) ?? block.approaches
        : block.approaches;
    patchBlock(blockIndex, { ...block, roundApproaches, approaches });
  };

  const updateRoundApproaches = (
    blockIndex: number,
    roundIndex: number,
    approaches: WorkoutApproach[],
  ) => {
    const block = ensureBlockRoundApproaches(blocks[blockIndex], useAmerican);
    const roundApproaches = block.roundApproaches?.map((round, ri) =>
      ri === roundIndex ? approaches : round,
    );
    const nextApproaches =
      roundIndex === 0 ? approaches.map(cloneWorkoutApproach) : block.approaches;
    patchBlock(blockIndex, { ...block, roundApproaches, approaches: nextApproaches });
  };

  const updateApproach = (
    blockIndex: number,
    approachIndex: number,
    patch: Partial<WorkoutApproach>,
  ) => {
    onReplaceBlocks(
      blocks.map((b, i) => {
        if (i !== blockIndex) return b;
        return {
          ...b,
          approaches: b.approaches.map((row, j) =>
            j === approachIndex ? { ...row, ...patch } : row,
          ),
        };
      }),
    );
  };

  const addBlock = (type: WorkoutBlockType) => {
    const approaches =
      type === "normal"
        ? [newWorkoutApproach(useAmerican)]
        : [newWorkoutApproach(useAmerican), newWorkoutApproach(useAmerican)];
    const block = newWorkoutBlock(useAmerican, type, { approaches });
    onReplaceBlocks([
      ...blocks,
      type === "normal" ? block : ensureBlockRoundApproaches(block, useAmerican),
    ]);
  };

  const duplicateBlock = (blockIndex: number) => {
    const next = [...blocks];
    next.splice(blockIndex + 1, 0, cloneWorkoutBlock(blocks[blockIndex]));
    onReplaceBlocks(next);
  };

  const removeBlock = (blockIndex: number) => {
    if (blocks.length <= 1) {
      onReplaceBlocks([newWorkoutBlock(useAmerican)]);
      return;
    }
    onReplaceBlocks(blocks.filter((_, i) => i !== blockIndex));
  };

  const updateApproaches = (blockIndex: number, approaches: WorkoutApproach[]) => {
    updateBlock(blockIndex, { approaches });
  };

  const addSetToBlockExercise = (blockIndex: number, exercise: string, isWarmup: boolean) => {
    const block = blocks[blockIndex];
    const indices = block.approaches
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => exerciseKey(row.exercise) === exerciseKey(exercise))
      .map(({ index }) => index);
    if (!indices.length) return;
    const sameKind = indices.filter((index) => block.approaches[index]?.is_warmup === isWarmup);
    const baseIndex = sameKind.length ? sameKind[sameKind.length - 1] : indices[indices.length - 1];
    const row = cloneWorkoutApproach(block.approaches[baseIndex]);
    row.exercise = exercise;
    row.is_warmup = isWarmup;
    const insertAt = baseIndex + 1;
    updateApproaches(blockIndex, [
      ...block.approaches.slice(0, insertAt),
      row,
      ...block.approaches.slice(insertAt),
    ]);
  };

  const removeSetFromBlockExercise = (blockIndex: number, approachIndex: number) => {
    const block = blocks[blockIndex];
    const row = block.approaches[approachIndex];
    if (!row) return;
    const indices = block.approaches
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => exerciseKey(candidate.exercise) === exerciseKey(row.exercise))
      .map(({ index }) => index);
    if (row.is_warmup) {
      updateApproaches(blockIndex, block.approaches.filter((_, index) => index !== approachIndex));
      return;
    }
    const workingCount = indices.filter((index) => !block.approaches[index]?.is_warmup).length;
    if (workingCount <= 1) return;
    updateApproaches(blockIndex, block.approaches.filter((_, index) => index !== approachIndex));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.4)] p-1">
          <button
            type="button"
            onClick={() => setViewMode("simple")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              viewMode === "simple"
                ? "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))] shadow-sm"
                : "text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]",
            )}
          >
            Простой список
          </button>
          <button
            type="button"
            onClick={() => setViewMode("structure")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              viewMode === "structure"
                ? "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))] shadow-sm"
                : "text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]",
            )}
          >
            Структура блоков
          </button>
        </div>

        {viewMode === "structure" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => addBlock("normal")}>
              <Plus className="h-4 w-4" /> Обычный блок
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => addBlock("superset")}>
              <Plus className="h-4 w-4" /> Суперсет
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => addBlock("circuit")}>
              <Plus className="h-4 w-4" /> Круг
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === "simple" ? (
        <div className="space-y-3">
          {!blocks.some((block) => block.approaches.some((row) => row.exercise.trim())) ? (
            <div className="rounded-xl border-2 border-dashed border-[rgb(var(--app-border))] px-4 py-8 text-center">
              <p className="text-sm font-semibold text-[rgb(var(--app-text))]">Состав пока пуст</p>
              <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
                Добавьте упражнения или откройте структуру блоков для суперсета/круга.
              </p>
            </div>
          ) : null}
          {simpleVariant === "list" ? (
            <div className="rounded-2xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface))] p-3 sm:p-4">
              <ol className="flex flex-wrap items-center gap-2">
                {blocks.flatMap((block) => block.approaches)
                  .map((row) => row.exercise.trim())
                  .filter(Boolean)
                  .map((exercise, index) => (
                    <li key={`${index}-${exercise}`} className="flex items-center gap-2">
                      {index > 0 ? (
                        <span className="text-lg leading-none text-[rgb(var(--app-text-muted))]" aria-hidden>
                          →
                        </span>
                      ) : null}
                      <span className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.35)] px-2.5 py-1.5 text-sm font-semibold text-[rgb(var(--app-text))]">
                        <span className="tabular-nums text-xs text-[rgb(var(--app-accent))]">
                          {index + 1}
                        </span>
                        <span className="truncate" title={exercise}>
                          {exercise}
                        </span>
                      </span>
                    </li>
                  ))}
              </ol>
              <p className="mt-3 text-xs text-[rgb(var(--app-text-muted))]">
                Простой список показывает только порядок упражнений. Суперсеты и круги доступны во вкладке структуры.
              </p>
            </div>
          ) : blocks.map((block, blockIndex) => {
            if (block.type !== "normal") {
              const names = orderedExerciseNames(block.approaches);
              const expanded = Boolean(expandedWorkoutBlocks[block.id]);
              return (
                <article
                  key={block.id}
                  className="rounded-2xl border border-[rgb(var(--app-accent)/0.28)] bg-[rgb(var(--app-accent)/0.06)] px-3 py-3 sm:px-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
                        {block.title || (block.type === "superset" ? "Суперсет" : "Круг")}
                        <span className="ml-2 text-xs font-medium text-[rgb(var(--app-text-muted))]">
                          {block.rounds} раунд.
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-[rgb(var(--app-text-muted))]">
                        {names.length ? names.join(" → ") : "Добавьте упражнения в структуре блока"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() =>
                          setExpandedWorkoutBlocks((prev) => ({
                            ...prev,
                            [block.id]: !expanded,
                          }))
                        }
                      >
                        {expanded ? "Свернуть" : "Раскрыть"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => setViewMode("structure")}
                      >
                        Редактировать структуру
                      </button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="mt-3 space-y-3">
                      {names.map((exercise) => {
                        const indices = block.approaches
                          .map((row, index) => ({ row, index }))
                          .filter(({ row }) => exerciseKey(row.exercise) === exerciseKey(exercise))
                          .map(({ index }) => index);
                        const lastHint = indices.map((index) => block.approaches[index]?.lastHint).find(Boolean);
                        return (
                          <div
                            key={exercise}
                            className="rounded-xl border border-[rgb(var(--app-border)/0.7)] bg-[rgb(var(--app-surface))] p-3"
                          >
                            <div className="mb-2">
                              <p className="text-sm font-semibold text-[rgb(var(--app-text))]">{exercise}</p>
                              {lastHint ? (
                                <p className="mt-0.5 text-xs text-[rgb(var(--app-text-muted))]">{lastHint}</p>
                              ) : null}
                            </div>
                            <ExerciseSetTable
                              indices={indices}
                              approaches={block.approaches}
                              suggestion={suggestionByExercise.get(exercise)}
                              onUpdateAt={(localIndex, patch) => updateApproach(blockIndex, localIndex, patch)}
                              onDuplicateAt={(localIndex) =>
                                updateApproaches(blockIndex, [
                                  ...block.approaches.slice(0, localIndex + 1),
                                  cloneWorkoutApproach(block.approaches[localIndex]),
                                  ...block.approaches.slice(localIndex + 1),
                                ])
                              }
                              onRemoveAt={(localIndex) => removeSetFromBlockExercise(blockIndex, localIndex)}
                              onAddWorkingSet={() => addSetToBlockExercise(blockIndex, exercise, false)}
                              onAddWarmupSet={() => addSetToBlockExercise(blockIndex, exercise, true)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            }

            const exercise = block.approaches.find((row) => row.exercise.trim())?.exercise ?? "";
            const indices = block.approaches.map((_, i) => i);
            return (
              <ExerciseCard
                key={block.id}
                exercise={exercise}
                indices={indices}
                approaches={block.approaches}
                catalogNames={catalogNames}
                suggestion={exercise ? suggestionByExercise.get(exercise) : undefined}
                onUpdateAt={(localIndex, patch) => updateApproach(blockIndex, localIndex, patch)}
                onDuplicateAt={(localIndex) =>
                  updateApproaches(blockIndex, [
                    ...block.approaches.slice(0, localIndex + 1),
                    cloneWorkoutApproach(block.approaches[localIndex]),
                    ...block.approaches.slice(localIndex + 1),
                  ])
                }
                onRemoveAt={(localIndex) =>
                  updateApproaches(
                    blockIndex,
                    block.approaches.length <= 1
                      ? [newWorkoutApproach(useAmerican, { exercise })]
                      : block.approaches.filter((_, i) => i !== localIndex),
                  )
                }
                onAddSet={() => {
                  const last = block.approaches[block.approaches.length - 1];
                  const row = last
                    ? cloneWorkoutApproach(last)
                    : newWorkoutApproach(useAmerican, { exercise });
                  row.is_warmup = false;
                  updateApproaches(blockIndex, [...block.approaches, row]);
                }}
                onAddWarmupSet={() => {
                  const last = block.approaches[block.approaches.length - 1];
                  const row = last
                    ? cloneWorkoutApproach(last)
                    : newWorkoutApproach(useAmerican, { exercise, is_warmup: true });
                  row.is_warmup = true;
                  updateApproaches(blockIndex, [row, ...block.approaches]);
                }}
                onRemoveExercise={() => removeBlock(blockIndex)}
                onRenameExercise={(name) =>
                  updateApproaches(
                    blockIndex,
                    block.approaches.map((row) => ({ ...row, exercise: name })),
                  )
                }
              />
            );
          })}
        </div>
      ) : null}

      {viewMode === "structure" ? blocks.map((block, blockIndex) => {
        const roundsDone = completedRounds[block.id] ?? 0;
        return (
          <article
            key={block.id}
            className="rounded-2xl border border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface))] shadow-[var(--app-shadow-sm)] overflow-hidden"
          >
            <header className="flex flex-wrap items-start gap-2 border-b border-[rgb(var(--app-border)/0.55)] bg-gradient-to-r from-[rgb(var(--app-accent)/0.07)] to-transparent px-3 sm:px-4 py-3">
              <div className="pt-1 text-[rgb(var(--app-text-muted))]" title="Блок можно перемещать кнопками">
                <GripVertical className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={block.type}
                    onChange={(e) => {
                      const type = e.target.value as WorkoutBlockType;
                      const next = ensureBlockRoundApproaches(
                        {
                          ...block,
                          type,
                          rounds: type === "normal" ? 1 : Math.max(2, block.rounds),
                        },
                        useAmerican,
                      );
                      patchBlock(blockIndex, next);
                    }}
                    className="input-field text-sm w-auto min-w-[9rem]"
                  >
                    <option value="normal">Обычный блок</option>
                    <option value="superset">Суперсет</option>
                    <option value="circuit">Круг</option>
                  </select>
                  {structureVariant === "sets" ? (
                    <input
                      value={block.title ?? ""}
                      onChange={(e) => updateBlock(blockIndex, { title: e.target.value })}
                      placeholder="Название блока (необязательно)"
                      className="input-field text-sm min-w-[12rem] flex-1"
                    />
                  ) : null}
                  {block.type !== "normal" ? (
                    <label className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--app-text-muted))]">
                      Раундов
                      <input
                        type="number"
                        min={1}
                        value={block.rounds}
                        onChange={(e) =>
                          updateBlockRounds(blockIndex, Math.max(1, Number(e.target.value) || 1))
                        }
                        className="input-field h-9 w-20 text-sm tabular-nums"
                      />
                    </label>
                  ) : null}
                </div>
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  {BLOCK_HINT[block.type]}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onReplaceBlocks(moveItem(blocks, blockIndex, blockIndex - 1))}
                  disabled={blockIndex === 0}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))] disabled:opacity-35"
                  aria-label="Переместить блок выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onReplaceBlocks(moveItem(blocks, blockIndex, blockIndex + 1))}
                  disabled={blockIndex === blocks.length - 1}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))] disabled:opacity-35"
                  aria-label="Переместить блок ниже"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => duplicateBlock(blockIndex)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
                  aria-label="Дублировать блок"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => updateBlock(blockIndex, { collapsed: !block.collapsed })}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
                  aria-label={block.collapsed ? "Развернуть блок" : "Свернуть блок"}
                >
                  {block.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(blockIndex)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  aria-label="Удалить блок"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </header>

            {block.collapsed ? (
              <div className="px-4 py-3 text-sm text-[rgb(var(--app-text-muted))]">
                {BLOCK_LABEL[block.type]} · {block.approaches.length} упражн. · {block.rounds} раунд.
              </div>
            ) : structureVariant === "layout" ? (
              <div className="p-3 sm:p-4 space-y-3">
                <div className="space-y-2">
                  {block.approaches.map((row, approachIndex) => {
                    const listId = `workout-block-layout-${block.id}-${approachIndex}`;
                    return (
                      <div
                        key={row.id}
                        className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--app-border)/0.65)] bg-[rgb(var(--app-surface-subtle)/0.25)] p-2.5 sm:flex-row sm:items-center"
                      >
                        <div className="flex items-center gap-2 sm:w-24">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[rgb(var(--app-accent)/0.12)] px-2 text-xs font-semibold tabular-nums text-[rgb(var(--app-accent))]">
                            {approachIndex + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateApproaches(
                                  blockIndex,
                                  moveItem(block.approaches, approachIndex, approachIndex - 1),
                                )
                              }
                              disabled={approachIndex === 0}
                              className="h-8 w-8 rounded-md text-xs text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface))] disabled:opacity-35"
                              aria-label="Переместить упражнение выше"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateApproaches(
                                  blockIndex,
                                  moveItem(block.approaches, approachIndex, approachIndex + 1),
                                )
                              }
                              disabled={approachIndex === block.approaches.length - 1}
                              className="h-8 w-8 rounded-md text-xs text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface))] disabled:opacity-35"
                              aria-label="Переместить упражнение ниже"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            list={listId}
                            value={row.exercise}
                            onChange={(e) => updateApproach(blockIndex, approachIndex, { exercise: e.target.value })}
                            placeholder="Название упражнения"
                            className="input-field w-full text-sm"
                          />
                          <datalist id={listId}>
                            {catalogNames.map((name) => (
                              <option key={name} value={name} />
                            ))}
                          </datalist>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateApproaches(
                              blockIndex,
                              block.approaches.length <= 1
                                ? [newWorkoutApproach(useAmerican)]
                                : block.approaches.filter((_, i) => i !== approachIndex),
                            )
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          aria-label="Удалить упражнение"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateApproaches(blockIndex, [
                      ...block.approaches,
                      newWorkoutApproach(useAmerican),
                    ])
                  }
                  className="btn-secondary text-sm"
                >
                  <Plus className="h-4 w-4" /> Добавить упражнение
                </button>
              </div>
            ) : (
              <div className="p-3 sm:p-4 space-y-3">
                {block.type !== "normal" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgb(var(--app-border)/0.65)] bg-[rgb(var(--app-surface-subtle)/0.35)] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
                    <span>Редактируйте каждый раунд отдельно. Изменения не копируются в другие раунды.</span>
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg px-3 py-1.5 font-semibold transition-colors",
                        roundsDone >= block.rounds
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-[rgb(var(--app-accent)/0.1)] text-[rgb(var(--app-accent))] hover:bg-[rgb(var(--app-accent)/0.16)]",
                      )}
                      onClick={() =>
                        setCompletedRounds((prev) => ({
                          ...prev,
                          [block.id]: Math.min(block.rounds, roundsDone + 1),
                        }))
                      }
                    >
                      Раунд выполнен {Math.min(roundsDone, block.rounds)}/{block.rounds}
                    </button>
                  </div>
                ) : null}

                {(() => {
                  const hydrated =
                    block.type === "normal"
                      ? block
                      : ensureBlockRoundApproaches(block, useAmerican);
                  const roundIndex = block.type === "normal" ? 0 : activeRoundFor(hydrated);
                  const roundRows =
                    block.type === "normal"
                      ? hydrated.approaches
                      : hydrated.roundApproaches?.[roundIndex] ?? hydrated.approaches;

                  return (
                    <>
                      {block.type !== "normal" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {Array.from({ length: hydrated.rounds }, (_, i) => (
                            <button
                              key={`${block.id}-round-${i}`}
                              type="button"
                              className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                                roundIndex === i
                                  ? "bg-[rgb(var(--app-accent)/0.14)] text-[rgb(var(--app-accent))]"
                                  : "border border-[rgb(var(--app-border)/0.75)] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]",
                              )}
                              onClick={() =>
                                setActiveRoundByBlock((prev) => ({ ...prev, [block.id]: i }))
                              }
                            >
                              Раунд {i + 1}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="rounded-lg border border-[rgb(var(--app-border)/0.75)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]"
                            onClick={() =>
                              patchBlock(blockIndex, applyRoundToAllRounds(hydrated, roundIndex))
                            }
                          >
                            Применить ко всем раундам
                          </button>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        {roundRows.map((row, approachIndex) => (
                          <div key={row.id} className="flex gap-2">
                            <div className="flex flex-col gap-1 pt-3">
                              <button
                                type="button"
                                onClick={() =>
                                  block.type === "normal"
                                    ? updateApproaches(
                                        blockIndex,
                                        moveItem(hydrated.approaches, approachIndex, approachIndex - 1),
                                      )
                                    : updateRoundApproaches(
                                        blockIndex,
                                        roundIndex,
                                        moveItem(roundRows, approachIndex, approachIndex - 1),
                                      )
                                }
                                disabled={approachIndex === 0}
                                className="h-7 w-7 rounded-md text-xs text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))] disabled:opacity-35"
                                aria-label="Переместить выше"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  block.type === "normal"
                                    ? updateApproaches(
                                        blockIndex,
                                        moveItem(hydrated.approaches, approachIndex, approachIndex + 1),
                                      )
                                    : updateRoundApproaches(
                                        blockIndex,
                                        roundIndex,
                                        moveItem(roundRows, approachIndex, approachIndex + 1),
                                      )
                                }
                                disabled={approachIndex === roundRows.length - 1}
                                className="h-7 w-7 rounded-md text-xs text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))] disabled:opacity-35"
                                aria-label="Переместить ниже"
                              >
                                ↓
                              </button>
                            </div>
                            <div className="min-w-0 flex-1">
                              <SetRow
                                row={row}
                                setNumber={approachIndex + 1}
                                sequenceLabel={`${approachIndex + 1}`}
                                listId={`workout-block-${block.id}-r${roundIndex}-${approachIndex}`}
                                catalogNames={catalogNames}
                                showExerciseName
                                compact
                                weightSuggestion={suggestionByExercise.get(row.exercise.trim())}
                                onChange={(patch) =>
                                  block.type === "normal"
                                    ? updateApproach(blockIndex, approachIndex, patch)
                                    : updateRoundApproach(blockIndex, roundIndex, approachIndex, patch)
                                }
                                onDuplicate={() =>
                                  block.type === "normal"
                                    ? updateApproaches(blockIndex, [
                                        ...hydrated.approaches.slice(0, approachIndex + 1),
                                        cloneWorkoutApproach(row),
                                        ...hydrated.approaches.slice(approachIndex + 1),
                                      ])
                                    : updateRoundApproaches(blockIndex, roundIndex, [
                                        ...roundRows.slice(0, approachIndex + 1),
                                        cloneWorkoutApproach(row),
                                        ...roundRows.slice(approachIndex + 1),
                                      ])
                                }
                                onRemove={() =>
                                  block.type === "normal"
                                    ? updateApproaches(
                                        blockIndex,
                                        hydrated.approaches.length <= 1
                                          ? [newWorkoutApproach(useAmerican)]
                                          : hydrated.approaches.filter((_, i) => i !== approachIndex),
                                      )
                                    : updateRoundApproaches(
                                        blockIndex,
                                        roundIndex,
                                        roundRows.length <= 1
                                          ? [newWorkoutApproach(useAmerican)]
                                          : roundRows.filter((_, i) => i !== approachIndex),
                                      )
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          block.type === "normal"
                            ? updateApproaches(blockIndex, [
                                ...hydrated.approaches,
                                newWorkoutApproach(useAmerican),
                              ])
                            : updateRoundApproaches(blockIndex, roundIndex, [
                                ...roundRows,
                                newWorkoutApproach(useAmerican),
                              ])
                        }
                        className="btn-secondary text-sm"
                      >
                        <Plus className="h-4 w-4" /> Добавить упражнение в блок
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </article>
        );
      }) : null}
    </div>
  );
}
