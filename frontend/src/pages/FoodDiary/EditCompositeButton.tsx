/** Кнопка редактирования рецепта составного блюда. */
export function EditCompositeButton({
  onClick,
  className = "",
  label = "Редактировать рецепт",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center shrink-0 rounded-md px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${className}`}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 text-brand-600 dark:text-brand-400"
        aria-hidden
      >
        <path d="M2.695 14.763l-1.262 3.154a1 1 0 001.165 1.165l3.154-1.262a4 4 0 001.343-.885L17.5 5.501a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343zM12.803 4.908l2.289 2.29-1.08 1.081-2.29-2.289 1.081-1.082z" />
      </svg>
    </button>
  );
}
