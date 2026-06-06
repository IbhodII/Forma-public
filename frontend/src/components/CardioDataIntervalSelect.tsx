import { useState } from "react";
import {
  CARDIO_DOWNSAMPLE_ALL_POINTS,
  CARDIO_INTERVAL_OPTIONS,
  type CardioDataInterval,
} from "../utils/cardioDataInterval";
import { ConfirmModal } from "./ConfirmModal";

export function CardioDataIntervalSelect({
  value,
  onChange,
}: {
  value: CardioDataInterval;
  onChange: (next: CardioDataInterval) => void;
}) {
  const [pendingAllPoints, setPendingAllPoints] = useState(false);

  const handleChange = (next: CardioDataInterval) => {
    if (next === CARDIO_DOWNSAMPLE_ALL_POINTS && value !== CARDIO_DOWNSAMPLE_ALL_POINTS) {
      setPendingAllPoints(true);
      return;
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="cardio-interval" className="text-xs text-slate-600 shrink-0">
        Детализация трека
      </label>
      <select
        id="cardio-interval"
        className="input-field text-xs py-1.5 max-w-full"
        value={value}
        onChange={(e) => handleChange(Number(e.target.value) as CardioDataInterval)}
      >
        {CARDIO_INTERVAL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-slate-400">
        {CARDIO_INTERVAL_OPTIONS.find((o) => o.value === value)?.hint}
      </span>

      <ConfirmModal
        open={pendingAllPoints}
        title="Все точки трека?"
        message="Отображение всех точек может сильно замедлить работу при большом объёме данных. Будут загружены все точки GPS и датчиков из FIT. Продолжить?"
        confirmLabel="Продолжить"
        onCancel={() => setPendingAllPoints(false)}
        onConfirm={() => {
          onChange(CARDIO_DOWNSAMPLE_ALL_POINTS);
          setPendingAllPoints(false);
        }}
      />
    </div>
  );
}
