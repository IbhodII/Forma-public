import { useEffect, useMemo, useState } from "react";
import type { GoalsPayload, NutritionGoals } from "../../api/food";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { useConfirmClose } from "../../hooks/useConfirmClose";
import { ModalShell } from "../../components/ui/modal";
import { useUnits } from "../../hooks/useUnits";

export function GoalsModal({
  date,
  initial,
  onClose,
  onSubmit,
  isPending,
  formError,
}: {
  date: string;
  initial: NutritionGoals | null;
  onClose: () => void;
  onSubmit: (goals: GoalsPayload) => void;
  isPending: boolean;
  formError: string | null;
}) {
  const { formatFoodWeight, formatEnergy } = useUnits();
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [calories, setCalories] = useState("");

  useEffect(() => {
    setProtein(initial?.protein_goal != null ? String(initial.protein_goal) : "");
    setFat(initial?.fat_goal != null ? String(initial.fat_goal) : "");
    setCarbs(initial?.carbs_goal != null ? String(initial.carbs_goal) : "");
    setCalories(initial?.calories_goal != null ? String(initial.calories_goal) : "");
  }, [initial]);

  const num = (s: string) => {
    const v = parseFloat(s.replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : null;
  };

  const isDirty = useMemo(() => {
    const initP = initial?.protein_goal != null ? String(initial.protein_goal) : "";
    const initF = initial?.fat_goal != null ? String(initial.fat_goal) : "";
    const initC = initial?.carbs_goal != null ? String(initial.carbs_goal) : "";
    const initK = initial?.calories_goal != null ? String(initial.calories_goal) : "";
    return protein !== initP || fat !== initF || carbs !== initC || calories !== initK;
  }, [initial, protein, fat, carbs, calories]);

  const { requestClose, confirmOpen, confirmDiscard, cancelConfirm } = useConfirmClose(
    isDirty,
    onClose,
  );

  return (
    <>
    <ModalShell open onClose={requestClose} dismissOnOverlay={false} title={`Нормы на ${date}`} size="md">
      {formError && <ErrorAlert message={formError} />}
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            protein_goal: num(protein),
            fat_goal: num(fat),
            carbs_goal: num(carbs),
            calories_goal: num(calories),
          });
        }}
      >
        <p className="col-span-2 text-xs text-[rgb(var(--app-text-muted))]">
          Ввод в граммах и ккал; ниже — как будет показано в дневнике.
        </p>
        <label className="text-sm block">
          Белки, г
          <input value={protein} onChange={(e) => setProtein(e.target.value)} className="input-field mt-1" type="number" min={0} />
          {num(protein) != null && (
            <span className="block text-xs text-[rgb(var(--app-text-muted))] mt-0.5 tabular-nums">
              → {formatFoodWeight(num(protein)!)}
            </span>
          )}
        </label>
        <label className="text-sm block">
          Жиры, г
          <input value={fat} onChange={(e) => setFat(e.target.value)} className="input-field mt-1" type="number" min={0} />
          {num(fat) != null && (
            <span className="block text-xs text-[rgb(var(--app-text-muted))] mt-0.5 tabular-nums">
              → {formatFoodWeight(num(fat)!)}
            </span>
          )}
        </label>
        <label className="text-sm block">
          Углеводы, г
          <input value={carbs} onChange={(e) => setCarbs(e.target.value)} className="input-field mt-1" type="number" min={0} />
          {num(carbs) != null && (
            <span className="block text-xs text-[rgb(var(--app-text-muted))] mt-0.5 tabular-nums">
              → {formatFoodWeight(num(carbs)!)}
            </span>
          )}
        </label>
        <label className="text-sm block">
          Калории, ккал
          <input value={calories} onChange={(e) => setCalories(e.target.value)} className="input-field mt-1" type="number" min={0} />
          {num(calories) != null && (
            <span className="block text-xs text-[rgb(var(--app-text-muted))] mt-0.5 tabular-nums">
              → {formatEnergy(num(calories)!)}
            </span>
          )}
        </label>
        <div className="col-span-2 flex gap-2 pt-2">
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? "Сохранение…" : "Сохранить"}
          </button>
          <button type="button" onClick={requestClose} className="btn-secondary">
            Отмена
          </button>
        </div>
      </form>
    </ModalShell>
    <ConfirmModal
      open={confirmOpen}
      title="Закрыть без сохранения?"
      message="Изменения норм не будут сохранены."
      confirmLabel="Закрыть"
      danger
      onCancel={cancelConfirm}
      onConfirm={confirmDiscard}
    />
    </>
  );
}
