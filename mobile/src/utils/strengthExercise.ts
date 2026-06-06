export function isPlankExercise(name: string): boolean {
  return name.trim().toLowerCase().replace(/ё/g, 'е').includes('планк');
}
