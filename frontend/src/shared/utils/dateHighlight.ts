export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isToday(date: string): boolean {
  return date.slice(0, 10) === todayIso();
}

/** Visual emphasis hook for the current day card. Color is owned by the local component CSS. */
export function todayHighlightClass(isSelected: boolean): string {
  return [
    "relative z-10",
    "border-2 ring-2 ring-inset",
    isSelected ? "food-week-overview__card--today-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** ~1.2× default week card width; keeps carousel layout stable. */
export function todayCardWidthClass(): string {
  return "w-[11.5rem]";
}

export function todayBadgeLabel(date: string): string | null {
  return isToday(date) ? "Сегодня" : null;
}
