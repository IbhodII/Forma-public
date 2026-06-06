import { EmptyState } from "../../ui/empty-state";
import { Loader } from "../../Loader";
import type { CardioWorkout } from "../../../types";
import type { UnitsFormatters } from "../../../hooks/useUnits";
import { CardioWorkoutCard } from "./CardioWorkoutCard";
import { CARDIO_BIKE, CARDIO_POOL, CARDIO_RUN, cardioTabLabel } from "../../../utils/constants";

type CardioUnits = Pick<
  UnitsFormatters,
  "formatSpeed" | "formatSwimSpeed" | "formatPace" | "formatEnergy" | "formatDistance"
>;

const EMPTY_COPY: Record<string, { title: string; description: string }> = {
  [CARDIO_BIKE]: {
    title: "Пока нет заездов",
    description: "Добавьте тренировку на велосипеде или импортируйте FIT — сессии появятся в ленте с картой и мощностью.",
  },
  [CARDIO_POOL]: {
    title: "Пока нет заплывов",
    description: "Запишите бассейн вручную или импортируйте данные — темп, SWOLF и пульс будут в карточке.",
  },
  [CARDIO_RUN]: {
    title: "Пока нет пробежек",
    description: "История бега в архивном режиме — раскройте карточку для темпа и пульса.",
  },
};

export function CardioHistoryFeed({
  workouts,
  fixedType,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
  readOnly,
  units,
  availabilityMap,
  loading,
}: {
  workouts: CardioWorkout[];
  fixedType: string;
  expandedId: number | null;
  onToggle: (id: number) => void;
  onEdit: (workout: CardioWorkout) => void;
  onDelete: (workout: CardioWorkout) => void;
  readOnly?: boolean;
  units: CardioUnits;
  availabilityMap: Map<number, { has_hr: boolean; has_gps: boolean; has_sensors: boolean }>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="py-12">
        <Loader label="История тренировок…" />
      </div>
    );
  }

  if (!workouts.length) {
    const copy = EMPTY_COPY[fixedType] ?? {
      title: "Пока нет тренировок",
      description: `Запишите первую сессию «${cardioTabLabel(fixedType)}» — она появится здесь в виде ленты.`,
    };
    return <EmptyState title={copy.title} description={copy.description} />;
  }

  return (
    <div
      className="space-y-3 sm:space-y-4"
      role="feed"
      aria-label={`История: ${cardioTabLabel(fixedType)}`}
    >
      {workouts.map((w) => {
        const avail = availabilityMap.get(w.id) ?? { has_hr: false, has_gps: false, has_sensors: false };
        return (
          <CardioWorkoutCard
            key={w.id}
            workout={w}
            expanded={expandedId === w.id}
            onToggle={() => onToggle(w.id)}
            onEdit={() => onEdit(w)}
            onDelete={() => onDelete(w)}
            readOnly={readOnly}
            units={units}
            availability={avail}
          />
        );
      })}
    </div>
  );
}
