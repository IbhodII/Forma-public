/** Подпись оси X: ISO YYYY-MM-DD → DD.MM.YY */
export function chartDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).trim());
  if (!m) return String(iso).slice(0, 10);
  return `${m[3]}.${m[2]}.${m[1].slice(2)}`;
}

/** Сортировка точек графика по дате */
export function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}
