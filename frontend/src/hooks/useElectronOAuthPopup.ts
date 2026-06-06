import { useEffect, useRef } from "react";
import { oauthFlowLog } from "../utils/oauthFlowLog";

export type OAuthPopupPayload = {
  type?: string;
  status?: string;
  user_id?: number | null;
  email?: string;
  provider?: string | null;
  linked_only?: boolean;
  message?: string;
  error?: string;
};

export function useElectronOAuthPopup(onResult: (payload: OAuthPopupPayload) => void) {
  const handlerRef = useRef(onResult);
  handlerRef.current = onResult;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onOAuthPopupResult) return undefined;
    return api.onOAuthPopupResult((payload) => {
      if (!payload || typeof payload !== "object") {
        oauthFlowLog("oauth_ui_error_shown", { step: "ipc_empty_payload" });
        return;
      }
      oauthFlowLog("renderer_payload_received", payload);
      oauthFlowLog("renderer_notified", payload);
      handlerRef.current(payload as OAuthPopupPayload);
    });
  }, []);
}
