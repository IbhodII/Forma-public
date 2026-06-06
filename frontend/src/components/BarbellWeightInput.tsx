import type { BodyWeightUnit } from "../utils/americanUnits";
import type { WeightInputUnit } from "../utils/barbellWeightInput";
import { useUnits } from "../hooks/useUnits";

const AMERICAN_UNITS: BodyWeightUnit[] = ["Jp", "Camry"];

export function BarbellWeightInput({
  weight,
  weightUnit,
  onChange,
  className = "input-field text-sm",
  step = "0.001",
}: {
  weight: string;
  weightUnit: WeightInputUnit;
  onChange: (weight: string, unit: WeightInputUnit) => void;
  className?: string;
  step?: string;
}) {
  const { system } = useUnits();

  if (system === "metric") {
    return (
      <input
        type="number"
        step={step}
        placeholder="Вес, кг"
        value={weight}
        onChange={(e) => onChange(e.target.value, "kg")}
        className={className}
      />
    );
  }

  const unit = weightUnit === "kg" ? "Jp" : weightUnit;

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <input
        type="number"
        step={step}
        placeholder="Вес"
        value={weight}
        onChange={(e) => onChange(e.target.value, unit)}
        className={`${className} flex-1 min-w-0`}
      />
      <select
        value={unit}
        onChange={(e) => onChange(weight, e.target.value as BodyWeightUnit)}
        className="input-field text-sm w-[5.5rem] shrink-0 py-1.5"
        aria-label="Единица веса"
      >
        {AMERICAN_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}
