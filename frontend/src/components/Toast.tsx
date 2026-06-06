import {

  createContext,

  useCallback,

  useContext,

  useMemo,

  useRef,

  useState,

  type ReactNode,

} from "react";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "../lib/utils";



type ToastKind = "success" | "error" | "info" | "warning";



interface ToastItem {

  id: number;

  message: string;

  kind: ToastKind;

}



interface ToastContextValue {

  showToast: (message: string, kind?: ToastKind) => void;

}



const ToastContext = createContext<ToastContextValue | null>(null);



let toastId = 0;



const TOAST_TIMEOUT: Record<ToastKind, number> = {

  success: 5000,

  error: 8000,

  info: 5000,

  warning: 7000,

};



const TOAST_STYLES: Record<

  ToastKind,

  { panel: string; icon: typeof CheckCircle2 }

> = {

  success: {

    panel:

      "border-emerald-200/80 bg-emerald-50 text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-100",

    icon: CheckCircle2,

  },

  error: {

    panel:

      "border-red-200/80 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100",

    icon: AlertCircle,

  },

  info: {

    panel:

      "border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))]",

    icon: Info,

  },

  warning: {

    panel:

      "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100",

    icon: AlertCircle,

  },

};



export function ToastProvider({ children }: { children: ReactNode }) {

  const [items, setItems] = useState<ToastItem[]>([]);

  const timersRef = useRef<Map<number, number>>(new Map());



  const dismiss = useCallback((id: number) => {

    const t = timersRef.current.get(id);

    if (t) {

      clearTimeout(t);

      timersRef.current.delete(id);

    }

    setItems((prev) => prev.filter((item) => item.id !== id));

  }, []);



  const showToast = useCallback(

    (message: string, kind: ToastKind = "info") => {

      const id = ++toastId;

      setItems((prev) => [...prev, { id, message, kind }]);

      const timer = window.setTimeout(() => dismiss(id), TOAST_TIMEOUT[kind]);

      timersRef.current.set(id, timer);

    },

    [dismiss],

  );



  const value = useMemo(() => ({ showToast }), [showToast]);



  return (

    <ToastContext.Provider value={value}>

      {children}

      <div

        className="fixed bottom-20 lg:bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none"

        aria-live="polite"

        aria-relevant="additions"

      >

        {items.map((t) => {

          const { panel, icon: Icon } = TOAST_STYLES[t.kind];

          return (

            <div

              key={t.id}

              role="alert"

              className={cn(

                "toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",

                panel,

              )}

            >

              <Icon className="h-5 w-5 shrink-0 mt-0.5 opacity-90" aria-hidden />

              <p className="leading-snug flex-1 min-w-0">{t.message}</p>

              <button

                type="button"

                onClick={() => dismiss(t.id)}

                className="shrink-0 p-1 rounded-lg text-current opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"

                aria-label="Закрыть уведомление"

              >

                <X className="h-4 w-4" />

              </button>

            </div>

          );

        })}

      </div>

    </ToastContext.Provider>

  );

}



export function useToast() {

  const ctx = useContext(ToastContext);

  if (!ctx) throw new Error("useToast must be used within ToastProvider");

  return ctx;

}

