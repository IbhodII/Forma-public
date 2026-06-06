export function StickyWorkoutFooter({
  saving,
  isEdit,
  onCancel,
}: {
  saving: boolean;
  isEdit?: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-5 sm:px-6 py-4 border-t border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface))]/95 backdrop-blur-md"
    >
      <button type="button" onClick={onCancel} className="btn-secondary" disabled={saving}>
        Отмена
      </button>
      <button type="submit" disabled={saving} className="btn-primary min-w-[8rem]">
        {saving ? "Сохранение…" : isEdit ? "Сохранить изменения" : "Сохранить тренировку"}
      </button>
    </div>
  );
}
