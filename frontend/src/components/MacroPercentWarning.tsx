/** Предупреждение, если сумма % БЖУ > 100.5 (округление / ошибка ввода). */
export function MacroPercentWarning({ sumPercent }: { sumPercent: number }) {
  if (sumPercent <= 100.5) return null;
  return (
    <p
      className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-1.5"
      title="Сумма процентов превышает 100%. Возможна ошибка ввода БЖУ."
    >
      <span className="shrink-0" aria-hidden>
        ⚠️
      </span>
      <span>
        Сумма процентов ({sumPercent.toFixed(1)}%) превышает 100%. Возможна ошибка ввода БЖУ.
      </span>
    </p>
  );
}
