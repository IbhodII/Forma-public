import { useCallback } from "react";
import { useToast } from "../../../components/Toast";
import { CollapsibleSection } from "./CollapsibleSection";

const SUPPORT_EMAIL = "Health_Dashboard@yandex.ru";

function MailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function SupportProjectSettings({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();

  const copyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      showToast("Email скопирован", "success");
    } catch {
      showToast("Не удалось скопировать email", "error");
    }
  }, [showToast]);

  return (
    <CollapsibleSection
      title="Поддержать проект"
      description="Помочь развитию Forma"
      defaultOpen={false}
      embedded={embedded}
    >
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-slate-200/80 dark:border-slate-700 px-4 py-4 sm:px-5 sm:py-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <MailIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-3">
              <p>
                Если Forma помогает вам в тренировках и аналитике, вы можете поддержать
                проект. Также можно связаться по почте — ваши идеи и отзывы очень важны.
              </p>
              <p>
                <a
                  href="https://tips.yandex.ru/guest/payment/3893596"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 dark:text-blue-400 underline hover:no-underline"
                >
                  Поддержать проект
                </a>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-brand-700 dark:text-brand-300 hover:underline break-all"
                >
                  {SUPPORT_EMAIL}
                </a>
                <button
                  type="button"
                  className="btn-secondary text-xs px-3 py-1.5"
                  onClick={() => void copyEmail()}
                >
                  Скопировать
                </button>
              </div>
            </div>
          </div>
        </div>

        <ul className="space-y-2">
          <li className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-3">
            <p className="font-medium text-slate-800 dark:text-slate-100">Обратная связь</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Идеи, баги и пожелания по функциям — самый ценный вклад в развитие проекта.
            </p>
          </li>
          <li className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-3">
            <p className="font-medium text-slate-800 dark:text-slate-100">Расскажите другим</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Порекомендуйте приложение тем, кому оно может пригодиться.
            </p>
          </li>
          <li className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-3">
            <p className="font-medium text-slate-800 dark:text-slate-100">Другие проекты автора</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              <a
                href="https://music.yandex.ru/artist/25591288"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 dark:text-blue-400 underline hover:no-underline"
              >
                🎵 Яндекс.Музыка
              </a>
            </p>
          </li>
        </ul>
      </div>
    </CollapsibleSection>
  );
}
