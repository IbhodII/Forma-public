import type { LevelRecommendations } from "../../../api/user";
import { ModalShell } from "../../../components/ui/modal";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function LevelRecommendationsModal({
  recommendations,
  hints = [],
  applying = false,
  onClose,
  onApply,
}: {
  recommendations: LevelRecommendations;
  hints?: string[];
  applying?: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const activityLabel =
    recommendations.activity_level === "active"
      ? "Активный образ жизни / спортсмен"
      : "Сидячий / обычный";

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Рекомендуемые нормы"
      size="md"
      zIndex={50}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={applying}>
            Отмена
          </button>
          <button type="button" className="btn-primary" onClick={onApply} disabled={applying}>
            {applying ? "Сохранение…" : "Применить"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {hints.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            {hints.map((hint) => (
              <p key={hint}>{hint}</p>
            ))}
          </div>
        )}
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Уровень активности: <strong className="text-[rgb(var(--app-text))]">{activityLabel}</strong>
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[rgb(var(--app-text-muted))]">BMR</dt>
          <dd className="font-medium tabular-nums">{fmt(recommendations.bmr)} ккал</dd>
          <dt className="text-[rgb(var(--app-text-muted))]">TDEE</dt>
          <dd className="font-medium tabular-nums">{fmt(recommendations.tdee)} ккал</dd>
          <dt className="text-[rgb(var(--app-text-muted))]">Калории (цель)</dt>
          <dd className="font-medium tabular-nums">{fmt(recommendations.calories)} ккал</dd>
          <dt className="text-[rgb(var(--app-text-muted))]">Белки</dt>
          <dd className="font-medium tabular-nums">
            {fmt(recommendations.protein_grams_per_kg)} г/кг ({fmt(recommendations.protein_grams)} г)
          </dd>
          <dt className="text-[rgb(var(--app-text-muted))]">Жиры</dt>
          <dd className="font-medium tabular-nums">
            {fmt(recommendations.fat_grams_per_kg)} г/кг ({fmt(recommendations.fat_grams)} г)
          </dd>
          <dt className="text-[rgb(var(--app-text-muted))]">Углеводы</dt>
          <dd className="font-medium tabular-nums">
            {fmt(recommendations.carbs_grams_per_kg)} г/кг ({fmt(recommendations.carbs_grams)} г)
          </dd>
        </dl>
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          Нажмите «Применить», чтобы подставить значения в настройки и сохранить их.
        </p>
      </div>
    </ModalShell>
  );
}
