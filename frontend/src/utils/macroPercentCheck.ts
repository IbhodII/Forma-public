/** Сумма долей калорий по БЖУ (алкоголь в totals не участвует). */
export function macroPercentSum(shares: { percent: number }[]): number {
  return shares.reduce((acc, s) => acc + (s.percent || 0), 0);
}

export function macroPercentSumExceeds100(shares: { percent: number }[]): boolean {
  return macroPercentSum(shares) > 100.5;
}
