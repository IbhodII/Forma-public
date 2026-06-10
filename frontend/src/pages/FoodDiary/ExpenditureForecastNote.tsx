import { cn } from "../../lib/utils";
import type { TodayExpenditureForecast } from "./todayExpenditureForecast";

export function ExpenditureForecastNote({
  forecast,
  value,
  formatEnergy,
  className,
  compact = false,
}: {
  forecast: TodayExpenditureForecast;
  value: number;
  formatEnergy: (n: number) => string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("food-expenditure-forecast", compact && "food-expenditure-forecast--compact", className)}>
      <p className="food-expenditure-forecast__label">{forecast.label}</p>
      <p className="food-expenditure-forecast__value tabular-nums">{formatEnergy(value)}</p>
      <p className="food-expenditure-forecast__hint">{forecast.explanation}</p>
    </div>
  );
}
