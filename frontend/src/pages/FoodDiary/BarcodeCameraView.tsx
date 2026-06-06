import BarcodeScanner from "react-qr-barcode-scanner";

/** Обёртка для ленивой загрузки камеры (webcam + ZXing). */
export function BarcodeCameraView({
  active,
  onDetected,
}: {
  active: boolean;
  onDetected: (code: string) => void;
}) {
  if (!active) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black aspect-[4/3] max-h-64">
      <BarcodeScanner
        width="100%"
        height="100%"
        facingMode="environment"
        stopStream={!active}
        onUpdate={(_err, result) => {
          const raw = result?.getText?.();
          if (!raw) return;
          const digits = raw.replace(/\D/g, "");
          if (digits.length >= 8) {
            onDetected(digits);
          }
        }}
      />
      <div
        className="pointer-events-none absolute inset-6 border-2 border-white/70 rounded-lg"
        aria-hidden
      />
    </div>
  );
}
