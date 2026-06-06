import { ModalCloseButton, ModalFrame } from "./ui/modal";
import { PolarPendingSection } from "../pages/PolarPendingSection";
import type { PolarPendingListItem } from "../api/polar";

interface PolarPendingModalProps {
  open: boolean;
  onClose: () => void;
  onCreateItem: (item: PolarPendingListItem) => void;
  onAttachItem: (item: PolarPendingListItem) => void;
}

export function PolarPendingModal({
  open,
  onClose,
  onCreateItem,
  onAttachItem,
}: PolarPendingModalProps) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      zIndex={55}
      panelClassName="max-w-4xl max-h-[min(90dvh,720px)] flex flex-col p-0 overflow-hidden"
    >
      <div
        className="flex items-center justify-between gap-3 px-6 py-4 border-b shrink-0"
        style={{ borderColor: "rgb(var(--app-border) / 0.6)" }}
      >
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-[rgb(var(--app-text))]">
            Незаписанные тренировки Polar
          </h3>
          <p className="text-sm text-[rgb(var(--app-text-muted))] mt-0.5">
            Привяжите к существующей записи или создайте новую
          </p>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
        <PolarPendingSection
          embedded
          onCreateItem={(item) => {
            onClose();
            onCreateItem(item);
          }}
          onAttachItem={(item) => {
            onClose();
            onAttachItem(item);
          }}
        />
      </div>
    </ModalFrame>
  );
}
