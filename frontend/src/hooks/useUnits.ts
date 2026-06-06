import { useMemo } from "react";
import type { UnitsSystem } from "../api/user";
import {
  americanWeightToKg,
  type BodyWeightUnit,
  celsiusToRankinJunior,
  cmToDick,
  cmToTrump,
  formatAmericanNumber,
  formatBodyWeight,
  formatFoodWeightAmerican,
  kcalToIcharge,
  kgToAmericanWeight,
  formatDistanceKm,
  kgToJapanese,
  kmhToSolPerHour,
  metersToRushmores,
  mlToSyringes,
  paceMinPerKmToMinPerSol,
  SECONDS_PER_FEP,
  secondsToFep,
  secondsToSb,
  wattsToIchargePerMin,
} from "../utils/americanUnits";
import { useUserProfile } from "./useUserProfile";

export type UnitsFormatters = {
  system: UnitsSystem;
  formatWeight: (kg: number) => string;
  /** Вес тела (кг → кг / Jp / Camry). */
  formatBodyWeight: (kg: number) => string;
  /** Мышечная масса и силовой вес на штанге (кг → кг / Jp / Camry). */
  formatBarbellWeight: (kg: number) => string;
  formatBarbellWeightForInput: (kg: number) => { value: number; unit: string };
  parseBarbellWeightInput: (value: number, unit: string) => number;
  /** Рост (см → см / Tp). */
  formatHeight: (cm: number) => string;
  /** Обхваты — всегда в сантиметрах. */
  formatCircumference: (cm: number) => string;
  /** Силовой тоннаж / объём нагрузки (сумма кг×повторения); в american — японцы (Jp). */
  formatLoad: (kg: number) => string;
  formatLength: (cm: number) => string;
  /** Мелкие длины (шаг, амплитуда): см → см / Dk. */
  formatSmallLength: (cm: number) => string;
  formatVolume: (ml: number) => string;
  formatEnergy: (kcal: number) => string;
  formatTemperature: (celsius: number) => string;
  /** Высота над уровнем моря; вход в метрах. */
  formatElevation: (meters: number) => string;
  formatDuration: (seconds: number) => string;
  formatFoodWeight: (grams: number) => string;
  formatWeightChange: (kgChange: number) => string;
  formatSpeed: (kmh: number) => string;
  /** Скорость в бассейне; вход в км/ч. */
  formatSwimSpeed: (kmh: number) => string;
  formatPace: (minPerKm: number) => string;
  formatPower: (watts: number) => string;
  /** Дистанция; вход в километрах. */
  formatDistance: (km: number) => string;
};

function resolveSystem(raw: string | undefined): UnitsSystem {
  return raw === "american" ? "american" : "metric";
}

function metricNum(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  if (digits === 0) return String(Math.round(n));
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(rounded) && digits > 0 ? String(rounded) : rounded.toFixed(digits);
}

function buildMetricFormatters(): UnitsFormatters {
  const bodyWeight = (kg: number) => `${metricNum(kg, 1)} кг`;
  const barbellWeight = (kg: number) => `${metricNum(kg, 1)} кг`;
  const height = (cm: number) => `${metricNum(cm, 1)} см`;
  const circumference = (cm: number) => `${metricNum(cm, 1)} см`;
  return {
    system: "metric",
    formatWeight: bodyWeight,
    formatBodyWeight: bodyWeight,
    formatBarbellWeight: barbellWeight,
    formatBarbellWeightForInput: (kg) => ({ value: kg, unit: "кг" }),
    parseBarbellWeightInput: (value) => value,
    formatHeight: height,
    formatCircumference: circumference,
    formatLoad: (kg) => `${metricNum(kg, 0)} кг`,
    formatLength: (cm) => `${metricNum(cm, 1)} см`,
    formatSmallLength: (cm) => `${metricNum(cm, 1)} см`,
    formatVolume: (ml) => `${metricNum(ml, 0)} мл`,
    formatEnergy: (kcal) => `${metricNum(kcal, 0)} ккал`,
    formatTemperature: (c) => `${metricNum(c, 1)} °C`,
    formatElevation: (m) => `${metricNum(m, 0)} м`,
    formatDuration: (seconds) => {
      const s = Math.max(0, seconds);
      if (s >= 3600) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
      }
      if (s > 60) {
        const m = Math.floor(s / 60);
        const r = Math.round(s % 60);
        return r > 0 ? `${m} мин ${r} с` : `${m} мин`;
      }
      return `${Math.round(s)} с`;
    },
    formatFoodWeight: (grams) => `${metricNum(grams, grams >= 10 ? 0 : 1)} г`,
    formatWeightChange: (kgChange) => {
      const sign = kgChange > 0 ? "+" : "";
      return `${sign}${metricNum(kgChange, 2)} кг`;
    },
    formatSpeed: (kmh) => `${metricNum(kmh, 1)} км/ч`,
    formatSwimSpeed: (kmh) => `${metricNum(kmh, 1)} км/ч`,
    formatPace: (minPerKm) => `${metricNum(minPerKm, 1)} мин/км`,
    formatPower: (watts) => `${metricNum(watts, 0)} Вт`,
    formatDistance: (km) => `${metricNum(km, 2)} км`,
  };
}

function buildAmericanFormatters(): UnitsFormatters {
  const formatBodyWeightDisplay = (kg: number) => {
    const { value, unit } = formatBodyWeight(kg);
    const kind = unit === "Jp" ? "japanese" : "camry";
    return `${formatAmericanNumber(value, kind)} ${unit}`;
  };
  const formatBarbellWeight = (kg: number) => {
    const { value, unit } = kgToAmericanWeight(kg);
    const kind = unit === "Jp" ? "japanese" : "camry";
    return `${formatAmericanNumber(value, kind)} ${unit}`;
  };
  const formatBarbellWeightForInput = (kg: number) => {
    const { value, unit } = kgToAmericanWeight(kg);
    const kind = unit === "Jp" ? "japanese" : "camry";
    return { value: Number(formatAmericanNumber(value, kind)), unit };
  };
  const parseBarbellWeightInput = (value: number, unit: string) => {
    if (unit === "кг" || unit === "kg") return value;
    if (unit === "Jp" || unit === "Camry") {
      return americanWeightToKg(value, unit as BodyWeightUnit);
    }
    return value;
  };
  const formatHeight = (cm: number) =>
    `${formatAmericanNumber(cmToTrump(cm), "default")} Tp`;
  const formatCircumference = (cm: number) => `${metricNum(cm, 1)} см`;
  return {
    system: "american",
    formatWeight: formatBodyWeightDisplay,
    formatBodyWeight: formatBodyWeightDisplay,
    formatBarbellWeight,
    formatBarbellWeightForInput,
    parseBarbellWeightInput,
    formatHeight,
    formatCircumference,
    formatLoad: (kg) =>
      `${formatAmericanNumber(kgToJapanese(kg), "japanese")} Jp`,
    formatLength: (cm) => {
      if (cm < 50) {
        return `${formatAmericanNumber(cmToDick(cm), "default")} Dk`;
      }
      return `${formatAmericanNumber(cmToTrump(cm), "default")} Tp`;
    },
    formatVolume: (ml) => `${formatAmericanNumber(mlToSyringes(ml), "syringes")} syr`,
    formatEnergy: (kcal) => `${kcalToIcharge(kcal).toFixed(1)} iCharge`,
    formatTemperature: (c) =>
      `${formatAmericanNumber(celsiusToRankinJunior(c), "default")} °Rj`,
    formatElevation: (m) => `${metersToRushmores(m).toFixed(3)} рашморов`,
    formatDuration: (seconds) => {
      const s = Math.max(0, seconds);
      if (s > SECONDS_PER_FEP) {
        return `${formatAmericanNumber(secondsToFep(s), "fep")} FEP`;
      }
      return `${Math.round(secondsToSb(s))} SB`;
    },
    formatFoodWeight: formatFoodWeightAmerican,
    formatWeightChange: (kgChange) => {
      const sign = kgChange > 0 ? "+" : "";
      return `${sign}${formatAmericanNumber(kgToJapanese(kgChange), "japanese")} Jp`;
    },
    formatSpeed: (kmh) => `${formatAmericanNumber(kmhToSolPerHour(kmh), "default")} SoL/h`,
    formatSwimSpeed: (kmh) => `${formatAmericanNumber(kmhToSolPerHour(kmh), "default")} SoL/h`,
    formatPace: (minPerKm) =>
      `${formatAmericanNumber(paceMinPerKmToMinPerSol(minPerKm), "default")} мин/SoL`,
    formatPower: (watts) =>
      `${wattsToIchargePerMin(watts).toFixed(3)} iCharge/мин`,
    formatDistance: formatDistanceKm,
    formatSmallLength: (cm) => `${formatAmericanNumber(cmToDick(cm), "default")} Dk`,
  };
}

/** Текущая система единиц из профиля и форматтеры для отображения (данные в метрике). */
export function useUnits(): UnitsFormatters & { isLoading: boolean } {
  const { data, isLoading } = useUserProfile();
  const system = resolveSystem(data?.units_system);

  const formatters = useMemo(
    () => (system === "american" ? buildAmericanFormatters() : buildMetricFormatters()),
    [system],
  );

  return { ...formatters, isLoading };
}
