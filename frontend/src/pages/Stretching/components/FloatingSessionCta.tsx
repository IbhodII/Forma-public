import { Play } from "lucide-react";

type Props = {
  label: string;
  sublabel?: string;
  onStart: () => void;
  visible: boolean;
};

export function FloatingSessionCta({ label, sublabel, onStart, visible }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(100%,24rem)] px-4 sm:px-0">
      <button
        type="button"
        onClick={onStart}
        className="stretch-floating-cta w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 text-white py-4 px-6 font-semibold text-base hover:brightness-105 active:scale-[0.98] transition-all"
      >
        <Play className="h-5 w-5 fill-current" aria-hidden />
        <span className="flex flex-col items-start text-left">
          <span>{label}</span>
          {sublabel && <span className="text-xs font-normal opacity-90">{sublabel}</span>}
        </span>
      </button>
    </div>
  );
}
