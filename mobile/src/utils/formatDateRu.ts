export function formatDateRu(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
}
