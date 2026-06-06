import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStretchingPreset, fetchStretchingPresets } from "../../api/stretching";
import { Loader } from "../../components/Loader";
import { queryKeys } from "../../hooks/queryKeys";
import { FloatingSessionCta } from "./components/FloatingSessionCta";
import { StretchFlowTimeline } from "./components/StretchFlowTimeline";
import { StretchProgramCard } from "./components/StretchProgramCard";
import { useStretchingStats } from "./hooks/useStretchingStats";

export function StretchingJourneyTab() {
  const navigate = useNavigate();
  const stats = useStretchingStats();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const presetsQuery = useQuery({
    queryKey: queryKeys.stretchingPresets(),
    queryFn: () => fetchStretchingPresets(),
  });

  const active = useMemo(
    () => (presetsQuery.data ?? []).filter((p) => p.is_active === 1),
    [presetsQuery.data],
  );

  const featured = useMemo(() => {
    if (!active.length) return null;
    if (selectedId) return active.find((p) => p.id === selectedId) ?? active[0];
    return active[0];
  }, [active, selectedId]);

  const detailQuery = useQuery({
    queryKey: queryKeys.stretchingPresetDetail(featured?.id ?? 0),
    queryFn: () => fetchStretchingPreset(featured!.id),
    enabled: Boolean(featured?.id),
  });

  const exercises = detailQuery.data?.exercises ?? [];
  const estMin = Math.max(
    5,
    Math.round(
      exercises.reduce((s, e) => s + (e.hold_seconds ?? 30) * (e.reps ?? 1), 0) / 60,
    ) || stats.estimatedSessionMin,
  );

  if (presetsQuery.isLoading) return <Loader label="Загружаем программы…" />;

  return (
    <div className="space-y-8 pb-28">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[hsl(var(--stretch-ink))] tracking-tight">
          Рекомендуем сегодня
        </h2>
        {!active.length ? (
          <p className="text-sm text-[hsl(var(--stretch-muted))]">
            Создайте программу во вкладке «Программы», чтобы начать путь к мобильности.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {active.slice(0, 2).map((p) => (
              <StretchProgramCard
                key={p.id}
                preset={p}
                estimatedMin={estMin}
                selected={featured?.id === p.id}
                onSelect={() => setSelectedId(p.id)}
                onStart={() => navigate(`/stretching/session/${p.id}`)}
                onEdit={() => navigate("/stretching?tab=programs")}
              />
            ))}
          </div>
        )}
      </section>

      {featured && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[hsl(var(--stretch-ink))]">Поток поз</h2>
              <p className="text-sm text-[hsl(var(--stretch-muted))] mt-1">
                {featured.name} · последовательность с дыханием и удержаниями
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
              onClick={() => navigate(`/stretching/session/${featured.id}`)}
            >
              Полноэкранная сессия →
            </button>
          </div>
          {detailQuery.isLoading ? (
            <Loader label="Поток…" />
          ) : (
            <StretchFlowTimeline exercises={exercises} previewIndex={0} />
          )}
        </section>
      )}

      <FloatingSessionCta
        visible={Boolean(featured)}
        label="Начать сессию"
        sublabel={featured ? `${featured.name} · ~${estMin} мин` : undefined}
        onStart={() => featured && navigate(`/stretching/session/${featured.id}`)}
      />
    </div>
  );
}
