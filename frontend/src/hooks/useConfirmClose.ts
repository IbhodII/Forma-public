import { useCallback, useState } from "react";

/** Confirm before closing a modal/drawer when the user has unsaved edits. */
export function useConfirmClose(isDirty: boolean, onClose: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setConfirmOpen(false);
    onClose();
  }, [onClose]);

  const cancelConfirm = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return { requestClose, confirmOpen, confirmDiscard, cancelConfirm };
}
