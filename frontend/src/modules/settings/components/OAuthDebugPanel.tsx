import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { fetchCloudOAuthDebug, type OAuthProviderDebug } from "../../../api/cloud";
import { resolveApiBaseUrl, resolveApiOrigin } from "../../../api/runtimeBaseUrl";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { SettingsSubsection } from "./SettingsSection";

const RUNTIME_LABELS: Record<string, string> = {
  forma_desktop: "Forma (порт 8002)",
  dev_browser: "Dev-браузер (порт 8000)",
  explicit: "Явный redirect_base",
  unknown: "Не определён",
};

function CopyUriButton({ value }: { value: string }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showToast("Скопировано", "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Не удалось скопировать", "error");
    }
  }, [showToast, value]);

  return (
    <button
      type="button"
      className="btn-secondary shrink-0 px-2 py-1 text-xs"
      onClick={() => void copy()}
    >
      {copied ? "OK" : "Копировать"}
    </button>
  );
}

function RedirectUriRow({ label, uri }: { label: string; uri: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-[rgb(var(--app-text-muted))]">{label}</div>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded-lg bg-[rgb(var(--app-surface-subtle))] px-2 py-1.5 text-xs">
          {uri}
        </code>
        <CopyUriButton value={uri} />
      </div>
    </div>
  );
}

function providerStatusLabel(provider: OAuthProviderDebug): string {
  if (provider.configured) {
    return provider.oauth_flow_mode === "pkce" ? "PKCE готов" : "настроен";
  }
  if (provider.pkce_available || (provider.oauth_flow_mode === "pkce" && provider.client_id_present)) {
    return "PKCE";
  }
  if (provider.setup_required && provider.secret_required !== false) {
    return "нужен секрет";
  }
  return "не настроен";
}

function providerStatusClass(provider: OAuthProviderDebug): string {
  if (provider.configured || provider.pkce_available) {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
  if (provider.setup_required && provider.secret_required !== false) {
    return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
  }
  return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
}

export function OAuthProviderDebugBlock({
  title,
  provider,
}: {
  title: string;
  provider: OAuthProviderDebug;
}) {
  const secretLabel =
    provider.secret_required === false
      ? "не требуется (PKCE)"
      : provider.client_secret_present
        ? "✓"
        : "✗";

  return (
    <div className="space-y-3 rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${providerStatusClass(provider)}`}
        >
          {providerStatusLabel(provider)}
        </span>
        <span className="rounded-full bg-[rgb(var(--app-surface-subtle))] px-2 py-0.5 text-[11px] text-[rgb(var(--app-text-muted))]">
          source: {provider.redirect_source}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-[rgb(var(--app-text-muted))]">
        <span>client_id: {provider.client_id_present ? "✓" : "✗"}</span>
        <span>client_secret: {secretLabel}</span>
        {provider.oauth_flow_mode ? (
          <span>flow: {provider.oauth_flow_mode}</span>
        ) : null}
        {provider.client_id_preview ? (
          <span>id: {provider.client_id_preview}</span>
        ) : null}
      </div>
      {provider.redirect_uri ? (
        <RedirectUriRow label="Redirect URI (используется при входе)" uri={provider.redirect_uri} />
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Redirect URI не задан — проверьте .env
        </p>
      )}
      {provider.env_redirect_uri && provider.env_redirect_uri !== provider.redirect_uri ? (
        <RedirectUriRow label="REDIRECT_URI в .env" uri={provider.env_redirect_uri} />
      ) : null}
      {provider.legacy_redirect_ignored ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Устаревший POLAR_REDIRECT_URI (CLI :8080) игнорирован — задайте POLAR_API_REDIRECT_URI
        </p>
      ) : null}
    </div>
  );
}

function OAuthDebugContent({ embedded = false }: { embedded?: boolean }) {
  const apiOrigin = resolveApiOrigin();
  const clientApiBase = resolveApiBaseUrl();

  const debugQuery = useQuery({
    queryKey: [...queryKeys.cloudOAuthDebug, apiOrigin ?? "default"],
    queryFn: () => fetchCloudOAuthDebug(apiOrigin ?? undefined),
    staleTime: 30_000,
  });

  const devAlternates = (debugQuery.data?.alternate_redirect_uris ?? []).filter(
    (uri) => uri.includes(":8000") || uri.includes(":8002"),
  );

  return (
    <>
      {debugQuery.isLoading ? <Loader label="Загрузка OAuth-конфигурации…" compact={embedded} /> : null}
      {debugQuery.isError ? (
        <ErrorAlert message={parseApiError(debugQuery.error)} />
      ) : null}
      {debugQuery.data ? (
        <div className="space-y-4">
          <div className="grid gap-2 text-xs text-[rgb(var(--app-text-muted))] sm:grid-cols-2">
            <div>
              <span className="font-medium text-[rgb(var(--app-text))]">API base (клиент): </span>
              <code>{clientApiBase}</code>
            </div>
            <div>
              <span className="font-medium text-[rgb(var(--app-text))]">Режим: </span>
              {RUNTIME_LABELS[debugQuery.data.runtime_mode] ?? debugQuery.data.runtime_mode}
            </div>
            <div>
              <span className="font-medium text-[rgb(var(--app-text))]">API origin: </span>
              <code>{debugQuery.data.api_base_url ?? apiOrigin ?? "—"}</code>
            </div>
            <div>
              <span className="font-medium text-[rgb(var(--app-text))]">.env: </span>
              {debugQuery.data.env_file_loaded ? "загружен" : "не найден"}
            </div>
          </div>

          {debugQuery.data.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {debugQuery.data.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          ) : null}

          <OAuthProviderDebugBlock title="Яндекс" provider={debugQuery.data.yandex} />
          <OAuthProviderDebugBlock title="Google" provider={debugQuery.data.google} />

          {devAlternates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
                Callback paths (dev :8000 / Forma :8002)
              </p>
              <ul className="space-y-2">
                {devAlternates.map((uri) => (
                  <li key={uri}>
                    <RedirectUriRow label="" uri={uri} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11px] text-[rgb(var(--app-text-muted))]">
            Google OAuth в режиме Testing: добавьте свой email в Test users.{" "}
            <code>127.0.0.1</code> и <code>localhost</code> — разные redirect URI.
          </p>
        </div>
      ) : null}
    </>
  );
}

export function OAuthDebugPanel({ embedded = false }: { embedded?: boolean }) {
  if (embedded) {
    return <OAuthDebugContent embedded />;
  }

  return (
    <SettingsSubsection
      title="OAuth — redirect URI"
      description="URI для регистрации в Google Cloud Console и oauth.yandex.ru. Должен совпадать побайтно."
    >
      <OAuthDebugContent />
    </SettingsSubsection>
  );
}
