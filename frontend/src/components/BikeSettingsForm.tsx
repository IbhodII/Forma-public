import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchBikeSettings, saveBikeSettings, type BikeSettings } from "../api/user";
import { ErrorAlert } from "./ErrorAlert";
import { Loader } from "./Loader";
import { useToast } from "./Toast";
import { queryKeys } from "../hooks/queryKeys";
import { useUnits } from "../hooks/useUnits";
import {
  formatAmericanNumber,
  japaneseToKg,
  kgToJapanese,
} from "../utils/americanUnits";
import { parseApiError } from "../utils/validation";

const RIDER_KG_MIN = 30;
const RIDER_KG_MAX = 250;

function kgToRiderInputValue(kg: number, useAmerican: boolean): string {
  if (!useAmerican) return String(kg);
  return formatAmericanNumber(kgToJapanese(kg), "japanese");
}

function riderInputToKg(raw: string, useAmerican: boolean): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return NaN;
  return useAmerican ? japaneseToKg(n) : n;
}

const TIRE_LABELS: Record<string, string> = {
  road_slick: "Шоссейная слик",
  semi_slick: "Полуслик",
  gravel: "Гравийная",
  cx: "CX / грунтовая",
};

const SURFACE_LABELS: Record<string, string> = {
  asphalt: "Асфальт",
  cobblestone: "Брусчатка",
  gravel: "Гравий",
  mixed: "Смешанное покрытие",
};

const WHEEL_OPTIONS = [26, 27.5, 28, 29] as const;

export function BikeSettingsForm({ compact = false }: { compact?: boolean }) {
  const { showToast } = useToast();
  const { system, formatBodyWeight } = useUnits();
  const useAmericanRider = system === "american";
  const riderInputUnit = useAmericanRider ? "Jp" : "кг";
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.bikeSettings,
    queryFn: fetchBikeSettings,
  });

  const [bikeWeight, setBikeWeight] = useState("10");
  const [riderWeight, setRiderWeight] = useState("");
  const [useBodyWeight, setUseBodyWeight] = useState(true);
  const [tireType, setTireType] = useState("road_slick");
  const [tireWidth, setTireWidth] = useState("25");
  const [wheelSize, setWheelSize] = useState("28");
  const [surface, setSurface] = useState("asphalt");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setBikeWeight(String(data.bike_weight_kg));
    setUseBodyWeight(data.rider_weight_kg == null);
    setRiderWeight(
      data.rider_weight_kg != null
        ? kgToRiderInputValue(data.rider_weight_kg, useAmericanRider)
        : data.effective_rider_weight_kg != null
          ? kgToRiderInputValue(data.effective_rider_weight_kg, useAmericanRider)
          : "",
    );
    setTireType(data.tire_type);
    setTireWidth(String(data.tire_width_mm));
    setWheelSize(String(data.wheel_size_inch));
    setSurface(data.default_route_surface);
  }, [data, useAmericanRider]);

  const saveMut = useMutation({
    mutationFn: saveBikeSettings,
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.bikeSettings, saved);
      showToast("Настройки велосипеда сохранены", "success");
    },
    onError: (err) => {
      const msg = parseApiError(err);
      setFormError(msg);
      showToast(msg, "error");
    },
  });

  const tireOptions = data?.tire_options?.length
    ? data.tire_options
    : Object.entries(TIRE_LABELS).map(([tire_type, description]) => ({
        tire_type,
        description,
        crr: 0,
      }));

  const surfaceOptions = data?.surface_options?.length
    ? data.surface_options
    : Object.entries(SURFACE_LABELS).map(([surface, description]) => ({
        surface,
        description,
        crr_multiplier: 1,
      }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!useBodyWeight) {
      const riderKg = riderInputToKg(riderWeight, useAmericanRider);
      if (
        !Number.isFinite(riderKg) ||
        riderKg < RIDER_KG_MIN ||
        riderKg > RIDER_KG_MAX
      ) {
        setFormError(
          useAmericanRider
            ? `Вес райдера: от ${formatAmericanNumber(kgToJapanese(RIDER_KG_MIN), "japanese")} до ${formatAmericanNumber(kgToJapanese(RIDER_KG_MAX), "japanese")} Jp`
            : `Вес райдера: от ${RIDER_KG_MIN} до ${RIDER_KG_MAX} кг`,
        );
        return;
      }
    }
    saveMut.mutate({
      bike_weight_kg: Number(bikeWeight),
      rider_weight_kg: useBodyWeight
        ? null
        : riderInputToKg(riderWeight, useAmericanRider),
      tire_type: tireType,
      tire_width_mm: Number(tireWidth),
      wheel_size_inch: Number(wheelSize),
      default_route_surface: surface,
    });
  };

  if (isLoading) return <Loader label="Загрузка…" />;

  if (isError) {
    return (
      <div className={compact ? "space-y-4" : "space-y-4 max-w-lg"}>
        <ErrorAlert message={parseApiError(error)} />
        <button type="button" className="btn-secondary" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Проверка…" : "Повторить"}
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-4 max-w-lg"}>
      {formError && <ErrorAlert message={formError} />}
      {!compact && (
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Параметры используются для оценки мощности без датчика: только сопротивление качению и
          подъём (без аэродинамики). Crr = коэффициент покрышки × множитель покрытия.
          {data?.effective_crr != null && (
            <span className="block mt-1 tabular-nums">
              Текущий Crr: <strong>{data.effective_crr.toFixed(4)}</strong>
            </span>
          )}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm space-y-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">Вес велосипеда</span>
          <input
            type="number"
            step="0.1"
            min={1}
            value={bikeWeight}
            onChange={(e) => setBikeWeight(e.target.value)}
            className="input-field"
            disabled={saveMut.isPending}
          />
          <p className="text-xs text-slate-500">Указан в килограммах</p>
        </label>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Мой вес</span>
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={useBodyWeight}
              onChange={(e) => setUseBodyWeight(e.target.checked)}
              disabled={saveMut.isPending}
            />
            Брать из последнего замера тела
            {data?.suggested_rider_weight_kg != null && (
              <span className="text-slate-500 tabular-nums">
                ({formatBodyWeight(data.suggested_rider_weight_kg)})
              </span>
            )}
          </label>
          {useBodyWeight && data?.effective_rider_weight_kg != null && (
            <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
              Сейчас: {formatBodyWeight(data.effective_rider_weight_kg)}
            </p>
          )}
          {!useBodyWeight && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={useAmericanRider ? 0.01 : 0.1}
                  min={
                    useAmericanRider ? kgToJapanese(RIDER_KG_MIN) : RIDER_KG_MIN
                  }
                  max={
                    useAmericanRider ? kgToJapanese(RIDER_KG_MAX) : RIDER_KG_MAX
                  }
                  value={riderWeight}
                  onChange={(e) => setRiderWeight(e.target.value)}
                  className="input-field flex-1"
                  disabled={saveMut.isPending}
                />
                <span className="text-sm text-slate-500 shrink-0 w-8">{riderInputUnit}</span>
              </div>
              <p className="text-xs text-slate-500">
                {useAmericanRider ? "Ввод в японцах (Jp)" : "Ввод в килограммах"}
              </p>
            </>
          )}
        </div>

        <label className="block text-sm space-y-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">Тип покрышек</span>
          <select
            value={tireType}
            onChange={(e) => setTireType(e.target.value)}
            className="input-field"
            disabled={saveMut.isPending}
          >
            {tireOptions.map((opt) => (
              <option key={opt.tire_type} value={opt.tire_type}>
                {TIRE_LABELS[opt.tire_type] ?? opt.tire_type}
                {opt.crr ? ` (Crr ${opt.crr})` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            {tireOptions.find((o) => o.tire_type === tireType)?.description ??
              "Влияет на сопротивление качению"}
          </p>
        </label>

        <label className="block text-sm space-y-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">Ширина покрышек, мм</span>
          <input
            type="number"
            min={18}
            max={60}
            step={1}
            value={tireWidth}
            onChange={(e) => setTireWidth(e.target.value)}
            className="input-field"
            disabled={saveMut.isPending}
          />
        </label>

        <label className="block text-sm space-y-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">Размер колёс, дюймы</span>
          <select
            value={wheelSize}
            onChange={(e) => setWheelSize(e.target.value)}
            className="input-field"
            disabled={saveMut.isPending}
          >
            {WHEEL_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w}&quot;
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm space-y-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            Покрытие маршрута по умолчанию
          </span>
          <select
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
            className="input-field"
            disabled={saveMut.isPending}
          >
            {surfaceOptions.map((opt) => (
              <option key={opt.surface} value={opt.surface}>
                {SURFACE_LABELS[opt.surface] ?? opt.surface}
                {opt.crr_multiplier ? ` (×${opt.crr_multiplier})` : ""}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={saveMut.isPending} className="btn-primary">
          {saveMut.isPending ? "Сохранение…" : "Сохранить"}
        </button>
      </form>
    </div>
  );
}

export function bikeSettingsSummary(data: BikeSettings | undefined): string | null {
  if (!data) return null;
  const tire = TIRE_LABELS[data.tire_type] ?? data.tire_type;
  const surf = SURFACE_LABELS[data.default_route_surface] ?? data.default_route_surface;
  return `${data.bike_weight_kg} кг + ${data.effective_rider_weight_kg ?? "?"} кг, ${tire}, ${surf}`;
}
