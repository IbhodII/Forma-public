import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader } from "../../../components/Loader";
import type { HeartRateZone } from "../../../api/user";

const ZONE_RECOMMENDATIONS: { title: string; text: string }[] = [
  {
    title: "Восстановление (50–60%)",
    text: "Разминка, заминка, дни отдыха. Разговорный темп, лёгкое жжение не требуется.",
  },
  {
    title: "Лёгкая (60–70%)",
    text: "Длительные базовые тренировки, жиросжигание, восстановление после тяжёлых дней.",
  },
  {
    title: "Аэробная (70–80%)",
    text: "Основной объём выносливости. Комфортно тяжело, но без «разрыва» дыхания.",
  },
  {
    title: "Пороговая (80–90%)",
    text: "Темповые интервалы, подготовка к соревнованиям. Держать недолго, с отдыхом между отрезками.",
  },
  {
    title: "Анаэробная (90–100%)",
    text: "Короткие спринты и максимальные усилия. Только при хорошем восстановлении (TSB > 0).",
  },
];

const TABS = [
  { id: "zones", label: "Зоны" },
  { id: "tips", label: "Рекомендации по пульсу" },
] as const;

export function HeartRateZones({
  zones,
  maxHr,
  isLoading,
  hasProfileMax,
}: {
  zones: HeartRateZone[];
  maxHr: number | null;
  isLoading: boolean;
  hasProfileMax: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("zones");

  if (isLoading) return <Loader />;

  if (!hasProfileMax || !maxHr) {
    return (
      <div className="card-panel border-dashed text-sm text-slate-600 space-y-2">
        <p>Укажите максимальный пульс в профиле — от него считаются зоны.</p>
        <Link to="/settings?tab=profile" className="text-brand-600 hover:underline font-medium">
          Перейти в профиль →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "zones" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {zones.map((z) => (
            <div key={z.id} className="card-panel py-3">
              <p className="font-medium text-slate-800">{z.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {z.pct_min}–{z.pct_max}% max HR
              </p>
              <p className="text-lg font-semibold text-brand-700 mt-2 tabular-nums">
                {z.min_bpm}–{z.max_bpm} уд/мин
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "tips" && (
        <ul className="space-y-3 text-sm text-slate-700">
          {ZONE_RECOMMENDATIONS.map((item) => (
            <li key={item.title} className="card-panel py-3">
              <p className="font-medium text-slate-800">{item.title}</p>
              <p className="mt-1 text-slate-600">{item.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
