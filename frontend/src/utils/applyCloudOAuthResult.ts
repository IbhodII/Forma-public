import type { QueryClient } from "@tanstack/react-query";
import type { OAuthPopupPayload } from "../hooks/useElectronOAuthPopup";
import { oauthFlowLog } from "./oauthFlowLog";

export type ApplyCloudOAuthOptions = {
  expectedType: string;
  providerLabel: string;
  setSessionFromOAuth: (payload: {
    user_id: number;
    email?: string | null;
    provider?: string | null;
  }) => void;
  refreshSession: () => Promise<void>;
  onConnected?: () => void;
  showToast: (message: string, kind: "success" | "error") => void;
  queryClient?: QueryClient;
  invalidateKeys?: readonly (readonly unknown[])[];
};

function oauthPayloadKey(data: OAuthPopupPayload): string {
  return [
    data.type ?? "",
    data.status ?? "",
    data.user_id ?? "",
    data.provider ?? "",
    data.linked_only ? "linked" : "login",
  ].join("|");
}

export function markCloudOAuthHandled(data: OAuthPopupPayload): void {
  try {
    (
      window as typeof window & {
        __formaCloudOAuthHandledKey?: string;
      }
    ).__formaCloudOAuthHandledKey = oauthPayloadKey(data);
  } catch {
    // ignore non-browser/test environments
  }
}

export function wasCloudOAuthHandled(data: OAuthPopupPayload): boolean {
  try {
    return (
      window as typeof window & {
        __formaCloudOAuthHandledKey?: string;
      }
    ).__formaCloudOAuthHandledKey === oauthPayloadKey(data);
  } catch {
    return false;
  }
}

function oauthErrorToast(
  opts: ApplyCloudOAuthOptions,
  message: string,
  detail?: unknown,
): boolean {
  oauthFlowLog("oauth_ui_error_shown", { message, detail });
  opts.showToast(message, "error");
  return true;
}

export async function applyCloudOAuthResult(
  data: OAuthPopupPayload | null | undefined,
  opts: ApplyCloudOAuthOptions,
): Promise<boolean> {
  if (!data || typeof data !== "object") {
    oauthFlowLog("oauth_ui_error_shown", { step: "empty_payload" });
    opts.showToast("OAuth: пустой ответ. Проверьте oauth-flow.log", "error");
    return false;
  }

  oauthFlowLog("oauth_callback_received", {
    type: data.type,
    status: data.status,
    user_id: data.user_id,
    linked_only: data.linked_only,
  });

  if (data.type !== opts.expectedType) {
    return oauthErrorToast(
      opts,
      "Ответ OAuth не распознан (неверный тип).",
      { expected: opts.expectedType, got: data.type },
    );
  }
  markCloudOAuthHandled(data);

  if (data.status === "error") {
    oauthFlowLog("token_exchange_failed", data);
    return oauthErrorToast(
      opts,
      data.message || data.error
        ? `Не удалось подключить облако: ${data.message || data.error}`
        : "Не удалось подключить облако. Попробуйте снова.",
      data,
    );
  }

  if (data.status !== "success") {
    return oauthErrorToast(opts, "Вход в облако не завершён. Попробуйте снова.", data);
  }

  oauthFlowLog("oauth_code_extracted", {
    user_id: data.user_id,
    linked_only: data.linked_only,
    provider: data.provider,
  });
  oauthFlowLog("token_exchange_success");
  oauthFlowLog("token_saved_to_backend", { user_id: data.user_id, linked_only: data.linked_only });
  oauthFlowLog("cloud_link_saved", { user_id: data.user_id, linked_only: data.linked_only });

  if (data.linked_only) {
    oauthFlowLog("auth_context_refresh_started", { mode: "linked_only" });
    try {
      await opts.refreshSession();
      oauthFlowLog("auth_context_refresh_success");
      oauthFlowLog("auth_refresh_success");
    } catch (e) {
      oauthFlowLog("auth_context_refresh_failure", e);
      oauthFlowLog("auth_refresh_failed", e);
    }
  } else if (data.user_id) {
    opts.setSessionFromOAuth({
      user_id: data.user_id,
      email: data.email,
      provider: data.provider ?? undefined,
    });
    oauthFlowLog("auth_context_refresh_started", { mode: "session" });
    try {
      await opts.refreshSession();
      oauthFlowLog("auth_context_refresh_success");
      oauthFlowLog("auth_refresh_success");
    } catch (e) {
      oauthFlowLog("auth_context_refresh_failure", e);
      oauthFlowLog("auth_refresh_failed", e);
    }
  } else {
    return oauthErrorToast(opts, "Облако подключено, но сессия не обновлена", data);
  }

  if (opts.queryClient && opts.invalidateKeys?.length) {
    oauthFlowLog("cloud_status_reload_started", {
      keys: opts.invalidateKeys.length,
    });
    for (const key of opts.invalidateKeys) {
      await opts.queryClient.invalidateQueries({ queryKey: key });
    }
    oauthFlowLog("cloud_status_reload_success");
  }

  opts.onConnected?.();
  oauthFlowLog("main_window_notified", { ok: true });
  oauthFlowLog("oauth_ui_success_shown", {
    provider: opts.providerLabel,
    linked_only: data.linked_only,
  });
  opts.showToast(
    data.linked_only
      ? `${opts.providerLabel} подключён к профилю`
      : `${opts.providerLabel} подключён`,
    "success",
  );
  return true;
}
