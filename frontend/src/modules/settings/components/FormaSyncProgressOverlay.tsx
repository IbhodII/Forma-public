import { useEffect, useState } from "react";
import { ModalFrame } from "../../../components/ui/modal";

export type FormaSyncProgressOperation = "sync" | "upload" | "download";

const CONFIG: Record<
  FormaSyncProgressOperation,
  { title: string; steps: string[]; tickMs: number; increment: number; cap: number }
> = {
  sync: {
    title: "Синхронизация FormaSync",
    steps: [
      "Проверка облака…",
      "Загрузка с Яндекс.Диска…",
      "Сбор пакета данных…",
      "Отправка на Диск…",
      "Сохранение manifest…",
    ],
    tickMs: 450,
    increment: 5,
    cap: 92,
  },
  upload: {
    title: "Отправка на Яндекс.Диск",
    steps: [
      "Подготовка пакета…",
      "Создание папок FormaSync…",
      "Загрузка файлов…",
      "Сохранение manifest…",
    ],
    tickMs: 400,
    increment: 6,
    cap: 92,
  },
  download: {
    title: "Загрузка с Яндекс.Диска",
    steps: ["Проверка manifest…", "Скачивание пакета…", "Применение данных…"],
    tickMs: 500,
    increment: 7,
    cap: 90,
  },
};

export function FormaSyncProgressOverlay({
  operation,
}: {
  operation: FormaSyncProgressOperation;
}) {
  const config = CONFIG[operation];
  const [stepIndex, setStepIndex] = useState(0);
  const [percent, setPercent] = useState(6);

  useEffect(() => {
    const cfg = CONFIG[operation];
    setStepIndex(0);
    setPercent(6);

    const stepTimer = window.setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, cfg.steps.length - 1));
    }, 2200);

    const pctTimer = window.setInterval(() => {
      setPercent((prev) => {
        if (prev >= cfg.cap) return prev;
        return Math.min(cfg.cap, prev + cfg.increment);
      });
    }, cfg.tickMs);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(pctTimer);
    };
  }, [operation]);

  const label = config.steps[stepIndex] ?? config.steps[0];

  return (
    <ModalFrame
      open
      onClose={() => {}}
      dismissOnOverlay={false}
      zIndex={70}
      role="status"
      panelClassName="max-w-md flex flex-col gap-4 p-6"
    >
      <p className="text-sm font-medium text-center text-[rgb(var(--app-text))]">{config.title}</p>
      <div
        className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        role="progressbar"
      >
        <div
          className="h-full bg-brand-600 transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-center text-[rgb(var(--app-text-muted))] tabular-nums">{label}</p>
      <p className="text-[11px] text-center text-[rgb(var(--app-text-muted))] leading-relaxed">
        Обычно 10–60 секунд. Окно закроется после завершения — можно не закрывать вкладку.
      </p>
    </ModalFrame>
  );
}
