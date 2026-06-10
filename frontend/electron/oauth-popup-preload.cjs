const { ipcRenderer } = require("electron");

let sent = false;

const OAUTH_CALLBACK_PATHS = [
  "/api/cloud/callback/yandex",
  "/api/cloud/callback/google",
  "/api/polar/callback",
];

/** Макс. ожидание payload на странице callback (~90 с). */
const CALLBACK_PAYLOAD_MAX_ATTEMPTS = 450;
const CALLBACK_PAYLOAD_POLL_MS = 200;

function oauthLog(event, detail) {
  try {
    ipcRenderer.send("oauth-flow-log", { event, detail });
  } catch {
    // ignore logging failures in the popup preload
  }
}

function isOAuthCallbackUrl(href) {
  try {
    const path = new URL(href).pathname;
    return OAUTH_CALLBACK_PATHS.some((segment) => path.includes(segment));
  } catch {
    return false;
  }
}

function messageTypeFromLocation() {
  try {
    const path = new URL(location.href).pathname;
    if (path.includes("/callback/yandex")) return "yandex-disk-auth";
    if (path.includes("/callback/google")) return "google-drive-auth";
    if (path.includes("/polar/callback")) return "polar-auth";
  } catch {
    // noop
  }
  return "oauth-callback";
}

function readPayload() {
  const el = document.getElementById("forma-oauth-data");
  oauthLog("callback_payload_element_found", {
    found: Boolean(el),
    text_length: el?.textContent?.length ?? 0,
  });
  if (!el || !el.textContent) return null;
  oauthLog("callback_payload_text", el.textContent.slice(0, 1000));
  try {
    const payload = JSON.parse(el.textContent);
    oauthLog("preload_payload_read_success", {
      type: payload?.type,
      status: payload?.status,
      user_id: payload?.user_id,
      linked_only: payload?.linked_only,
    });
    return payload;
  } catch (err) {
    oauthLog("preload_payload_read_failed", String(err));
    return null;
  }
}

function sendPayload(reason) {
  if (sent) return true;
  const payload = readPayload();
  if (!payload || typeof payload !== "object") return false;
  sent = true;
  ipcRenderer.send("oauth-popup-complete", { reason, payload, url: location.href });
  oauthLog("ipc_payload_sent", {
    reason,
    type: payload.type,
    status: payload.status,
  });
  return true;
}

function trySend(reason) {
  if (!isOAuthCallbackUrl(location.href)) {
    oauthLog("preload_skip_non_callback", { reason, url: location.href });
    return;
  }

  oauthLog("preload_dom_ready", { reason, url: location.href });
  if (sendPayload(reason)) return;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (sendPayload(`${reason}:poll`)) {
      clearInterval(timer);
      return;
    }
    if (attempts >= CALLBACK_PAYLOAD_MAX_ATTEMPTS) {
      clearInterval(timer);
      if (sent) return;
      sent = true;
      oauthLog("preload_payload_read_failed", {
        reason,
        step: "timeout",
        url: location.href,
      });
      ipcRenderer.send("oauth-popup-complete", {
        reason: `${reason}:timeout`,
        url: location.href,
        payload: {
          type: messageTypeFromLocation(),
          status: "error",
          message:
            "Сервер не вернул подтверждение вовремя. Закройте окно и нажмите «Подключить» ещё раз.",
          error: "callback_payload_timeout",
        },
      });
    }
  }, CALLBACK_PAYLOAD_POLL_MS);
}

oauthLog("callback_page_loaded", { phase: "preload-start", url: location.href });
window.addEventListener("DOMContentLoaded", () => trySend("domcontentloaded"));
window.addEventListener("load", () => trySend("load"));
