type EnergyLike = {
  unit?: string;
  value?: number;
  inKilocalories?: number;
  inKilojoules?: number;
  inJoules?: number;
  inCalories?: number;
};

/** Энергия Health Connect → килокалории (ккал). */
export function energyToKcal(energy?: EnergyLike | null): number {
  if (!energy) {
    return 0;
  }
  if (typeof energy.inKilocalories === 'number' && !Number.isNaN(energy.inKilocalories)) {
    return energy.inKilocalories;
  }
  if (typeof energy.inKilojoules === 'number' && !Number.isNaN(energy.inKilojoules)) {
    return energy.inKilojoules / 4.184;
  }
  if (typeof energy.inJoules === 'number' && !Number.isNaN(energy.inJoules)) {
    return energy.inJoules / 4184;
  }
  const v = energy.value ?? 0;
  if (energy.unit === 'kilojoules') {
    return v / 4.184;
  }
  if (energy.unit === 'kilocalories' || energy.unit === 'calories') {
    return energy.unit === 'calories' ? v / 1000 : v;
  }
  if (energy.unit === 'joules') {
    return v / 4184;
  }
  return 0;
}

type MassLike = {
  unit?: string;
  value?: number;
  inKilograms?: number;
  inGrams?: number;
};

/** Масса → килограммы. */
export function massToKg(mass?: MassLike | null): number | undefined {
  if (!mass) {
    return undefined;
  }
  if (typeof mass.inKilograms === 'number') {
    return mass.inKilograms;
  }
  if (typeof mass.inGrams === 'number') {
    return mass.inGrams / 1000;
  }
  const v = mass.value ?? 0;
  switch (mass.unit) {
    case 'kilograms':
      return v;
    case 'grams':
      return v / 1000;
    case 'milligrams':
      return v / 1_000_000;
    case 'pounds':
      return v * 0.45359237;
    case 'ounces':
      return v * 0.0283495;
    default:
      return v;
  }
}

type LengthLike = {
  unit?: string;
  value?: number;
  inMeters?: number;
};

/** Длина → метры. */
export function lengthToMeters(length?: LengthLike | null): number | undefined {
  if (!length) {
    return undefined;
  }
  if (typeof length.inMeters === 'number') {
    return length.inMeters;
  }
  const v = length.value ?? 0;
  switch (length.unit) {
    case 'meters':
      return v;
    case 'kilometers':
      return v * 1000;
    case 'miles':
      return v * 1609.344;
    case 'feet':
      return v * 0.3048;
    case 'inches':
      return v * 0.0254;
    default:
      return v;
  }
}

type TemperatureLike = {
  unit?: string;
  value?: number;
};

/** Температура → °C (в т.ч. из кельвинов, если придёт как числовое значение K). */
export function temperatureToCelsius(temp?: TemperatureLike | null): number | undefined {
  if (!temp) {
    return undefined;
  }
  const v = temp.value ?? 0;
  if (temp.unit === 'celsius') {
    return v;
  }
  if (temp.unit === 'fahrenheit') {
    return ((v - 32) * 5) / 9;
  }
  if (v > 200) {
    return v - 273.15;
  }
  return v;
}
