import { EmptyState } from "../../ui/empty-state";
import { Loader } from "../../Loader";
import type { StrengthSession } from "../../../types";
import { WorkoutSessionCard } from "./WorkoutSessionCard";

export function WorkoutHistoryFeed({
  sessions,
  expandedKey,
  onToggle,
  onEdit,
  onDelete,
  readOnly,
  showWorkoutTitle,
  formatEnergy,
  loading,
}: {
  sessions: StrengthSession[];
  expandedKey: string | null;
  onToggle: (key: string) => void;
  onEdit: (session: StrengthSession) => void;
  onDelete: (session: StrengthSession) => void;
  readOnly?: boolean;
  showWorkoutTitle?: boolean;
  formatEnergy: (kcal: number) => string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="py-12">
        <Loader label="История тренировок…" />
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <EmptyState
        title="Пока нет тренировок"
        description="Запишите первую сессию — она появится здесь в виде ленты с подходами и метриками."
      />
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4" role="feed" aria-label="История силовых тренировок">
      {sessions.map((s) => {
        const key = `${s.date}|${s.workout_title}`;
        return (
          <WorkoutSessionCard
            key={key}
            session={s}
            expanded={expandedKey === key}
            onToggle={() => onToggle(key)}
            onEdit={() => onEdit(s)}
            onDelete={() => onDelete(s)}
            readOnly={readOnly}
            showWorkoutTitle={showWorkoutTitle}
            formatEnergy={formatEnergy}
          />
        );
      })}
    </div>
  );
}
