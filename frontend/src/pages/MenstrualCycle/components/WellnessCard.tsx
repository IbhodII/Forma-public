import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function WellnessCard({ title, description, children, className = "" }: Props) {
  return (
    <div className={`cycle-wellness__card cycle-wellness__glass p-5 sm:p-6 space-y-4 ${className}`}>
      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--cycle-ink))]">{title}</h3>
        {description && (
          <p className="text-xs text-[hsl(var(--cycle-muted))] mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
