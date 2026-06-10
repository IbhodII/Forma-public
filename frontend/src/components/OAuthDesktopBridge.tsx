import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchOAuthStatus } from "../api/cloud";
import { useAuth } from "../auth/AuthContext";
import { queryKeys } from "../hooks/queryKeys";
import { useToast } from "./Toast";
import {
  useElectronOAuthPopup,
  type OAuthPopupPayload,
} from "../hooks/useElectronOAuthPopup";
import {
  applyCloudOAuthResult,
  wasCloudOAuthHandled,
} from "../utils/applyCloudOAuthResult";
import { oauthFlowLog } from "../utils/oauthFlowLog";

/** Global packaged-desktop OAuth IPC listener: always logs + surfaces errors in UI. */
export function OAuthDesktopBridge() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { setSessionFromOAuth, refreshSession } = useAuth();

  const applyFallback = useCallback(
    (payload: OAuthPopupPayload) => {
      const isYandex = payload.type === "yandex-disk-auth";
      const isGoogle = payload.type === "google-drive-auth";
      if (!isYandex && !isGoogle) return;
      window.setTimeout(() => {
        if (wasCloudOAuthHandled(payload)) return;
        const providerLabel = isYandex ? "Яндекс.Диск" : "Google Drive";
        const invalidateKeys = isYandex
          ? [queryKeys.yandexCloudStatus, queryKeys.cloudAutoBackup, queryKeys.formaSyncStatus]
          : [queryKeys.googleCloudStatus, queryKeys.formaSyncStatus];
        void applyCloudOAuthResult(payload, {
          expectedType: payload.type || "",
          providerLabel,
          setSessionFromOAuth,
          refreshSession,
          showToast,
          queryClient: qc,
          invalidateKeys,
          onConnected: () => {
            void fetchOAuthStatus()
              .then((status) => oauthFlowLog("oauth_post_close_status", status))
              .catch((err) => oauthFlowLog("oauth_post_close_status_failed", err));
          },
        });
      }, 250);
    },
    [qc, refreshSession, setSessionFromOAuth, showToast],
  );

  const handlePayload = useCallback(
    (payload: OAuthPopupPayload) => {
      if (!payload || typeof payload !== "object") {
        oauthFlowLog("oauth_ui_error_shown", { step: "bridge_empty_payload" });
        showToast("OAuth: пустой ответ от окна авторизации", "error");
        return;
      }

      oauthFlowLog("renderer_notified", payload);
      window.dispatchEvent(
        new CustomEvent("forma-oauth-popup-result", { detail: payload }),
      );
      applyFallback(payload);

      if (payload.status !== "error") return;

      const handledType =
        payload.type === "yandex-disk-auth" || payload.type === "google-drive-auth";
      if (handledType) {
        return;
      }

      const message =
        payload.error === "callback_payload_timeout"
          ? payload.message ||
            "Сервер не вернул подтверждение вовремя. Закройте окно и нажмите «Подключить» ещё раз."
          : payload.message ||
            payload.error ||
            "Не удалось завершить OAuth. Проверьте %APPDATA%\\Forma\\logs\\oauth-flow.log";
      oauthFlowLog("oauth_ui_error_shown", { step: "bridge_error", message, payload });
      showToast(message, "error");

      void fetchOAuthStatus()
        .then((debug) => oauthFlowLog("oauth_debug_status", debug))
        .catch((err) => oauthFlowLog("oauth_debug_status_failed", err));
    },
    [applyFallback, showToast],
  );

  useElectronOAuthPopup(handlePayload);
  return null;
}
