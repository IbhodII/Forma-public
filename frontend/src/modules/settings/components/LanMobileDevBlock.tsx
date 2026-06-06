import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "../../../components/Toast";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";
import { useDeveloperTools } from "../../../hooks/useDeveloperTools";

/** LAN / mobile API — только Developer Tools (desktop). */
export function LanMobileDevBlock() {
  const caps = useClientCapabilities();
  const { developerToolsEnabled } = useDeveloperTools();
  const { showToast } = useToast();
  const [lanStatus, setLanStatus] = useState<{
    enabled: boolean;
    managed: boolean;
    port: number;
    lanIp: string | null;
    url: string | null;
    tailscaleIp: string | null;
    tailscaleUrl: string | null;
    apiPort: number;
    apiLanEnabled: boolean;
    apiLanUrl: string | null;
    apiTailscaleUrl: string | null;
    apiHealthUrl: string | null;
    mobileApiLanEnabled: boolean;
  } | null>(null);
  const [lanBusy, setLanBusy] = useState(false);
  const [mobileApiBusy, setMobileApiBusy] = useState(false);
  const [lanQrDataUrl, setLanQrDataUrl] = useState<string | null>(null);
  const [mobileApiQrDataUrl, setMobileApiQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!window.desktopApp?.isDesktop || !window.electronAPI?.getLanServerStatus) return;
    window.electronAPI.getLanServerStatus().then(setLanStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!lanStatus?.url) {
      setLanQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(lanStatus.url, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#0000" },
    })
      .then((v) => {
        if (!cancelled) setLanQrDataUrl(v);
      })
      .catch(() => {
        if (!cancelled) setLanQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lanStatus?.url]);

  useEffect(() => {
    let cancelled = false;
    const apiUrl = lanStatus?.apiLanUrl;
    if (!apiUrl) {
      setMobileApiQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(apiUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#0000" },
    })
      .then((v) => {
        if (!cancelled) setMobileApiQrDataUrl(v);
      })
      .catch(() => {
        if (!cancelled) setMobileApiQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lanStatus?.apiLanUrl]);

  const refreshLanStatus = async () => {
    if (!window.electronAPI?.getLanServerStatus) return;
    const next = await window.electronAPI.getLanServerStatus();
    setLanStatus(next);
  };

  if (!caps.enableLanControls || !window.desktopApp?.isDesktop || !developerToolsEnabled) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[rgb(var(--app-border)/0.6)] p-3 relative">
        <div className="text-sm font-semibold mb-1">Доступ с телефона (LAN)</div>
        <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3">
          Веб-дашборд с телефона по адресу ПК. Только для отладки.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={lanBusy || lanStatus?.enabled === true}
            onClick={async () => {
              if (!window.electronAPI?.enableLanServer) return;
              setLanBusy(true);
              try {
                const res = await window.electronAPI.enableLanServer();
                showToast(res.message, res.ok ? "success" : "error");
                const next = await window.electronAPI.getLanServerStatus?.();
                if (next) setLanStatus(next);
              } catch {
                showToast("Не удалось включить LAN", "error");
              } finally {
                setLanBusy(false);
              }
            }}
          >
            {lanBusy ? "Запуск…" : lanStatus?.enabled ? "LAN включен" : "Запустить LAN"}
          </button>
          {lanStatus?.url ? (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {lanStatus.url}
            </span>
          ) : null}
        </div>
        {lanStatus?.url && lanQrDataUrl ? (
          <img
            src={lanQrDataUrl}
            alt="QR LAN"
            className="mt-3 h-[160px] w-[160px] rounded-md bg-white"
          />
        ) : null}
        {lanBusy ? (
          <div className="absolute inset-0 rounded-xl bg-[rgb(var(--app-surface)/0.82)] flex items-center justify-center text-sm">
            Запуск…
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[rgb(var(--app-border)/0.6)] p-3">
        <div className="text-sm font-semibold mb-1">API для мобильного приложения</div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={mobileApiBusy || !lanStatus?.managed}
            onClick={async () => {
              if (!window.electronAPI?.setMobileApiLan) return;
              const next = !lanStatus?.mobileApiLanEnabled;
              setMobileApiBusy(true);
              try {
                const res = await window.electronAPI.setMobileApiLan(next);
                showToast(res.message, res.ok ? "success" : "error");
                await refreshLanStatus();
              } catch {
                showToast("Ошибка переключения API", "error");
              } finally {
                setMobileApiBusy(false);
              }
            }}
          >
            {mobileApiBusy
              ? "…"
              : lanStatus?.mobileApiLanEnabled
                ? "Отключить API"
                : "Включить API"}
          </button>
          {lanStatus?.apiLanUrl ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{lanStatus.apiLanUrl}</span>
          ) : null}
        </div>
        {lanStatus?.apiLanUrl && mobileApiQrDataUrl ? (
          <img
            src={mobileApiQrDataUrl}
            alt="QR API"
            className="mt-3 h-[160px] w-[160px] rounded-md bg-white"
          />
        ) : null}
      </div>
    </div>
  );
}
