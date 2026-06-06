import { SyncButton } from "./SyncButton";

type Props = {
  className?: string;
  fitFolderPath?: string | null;
  reimport?: boolean;
  onSuccess?: () => void;
};

/** Кнопка импорта FIT (фоновый режим через SyncButton). */
export function FitImportButton(props: Props) {
  return <SyncButton {...props} />;
}
