import { useQueryClient } from "@tanstack/react-query";
import {
  isPolarCardioType,
  isPolarStrengthType,
  type PolarPendingListItem,
} from "../api/polar";
import { PolarAttachExistingModal } from "./PolarAttachExistingModal";
import { WorkoutFormModal } from "./strength/workout-modal/WorkoutFormModal";
import { CardioFormModal } from "../pages/CardioSection";
import { queryKeys } from "../hooks/queryKeys";

export function PolarPendingFollowUpModals({
  createItem,
  attachItem,
  strengthTypes,
  onCloseCreate,
  onCloseAttach,
}: {
  createItem: PolarPendingListItem | null;
  attachItem: PolarPendingListItem | null;
  strengthTypes: string[];
  onCloseCreate: () => void;
  onCloseAttach: () => void;
}) {
  const qc = useQueryClient();

  const refreshList = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
  };

  return (
    <>
      {createItem && isPolarCardioType(createItem.type) && (
        <CardioFormModal
          defaultType={createItem.type ?? undefined}
          polarAttach={createItem}
          onPolarDone={refreshList}
          onClose={onCloseCreate}
        />
      )}

      {createItem && isPolarStrengthType(createItem.type) && (
        <WorkoutFormModal
          workoutTypes={strengthTypes}
          defaultWorkoutTitle={strengthTypes[0]}
          polarAttach={createItem}
          onPolarDone={refreshList}
          onClose={onCloseCreate}
          onSaved={refreshList}
        />
      )}

      {attachItem && (
        <PolarAttachExistingModal
          item={attachItem}
          onClose={onCloseAttach}
          onDone={() => {
            refreshList();
            onCloseAttach();
          }}
        />
      )}
    </>
  );
}
