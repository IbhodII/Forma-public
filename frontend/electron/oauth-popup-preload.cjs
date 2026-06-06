const { ipcRenderer } = require("electron");

let sent = false;

function oauthLog(event, detail) {
  try {
    ipcRenderer.send("oauth-flow-log", { event, detail });
  } catch {
    // ignore logging failures in the popup preload
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
  oauthLog("preload_dom_ready", { reason, url: location.href });
  if (sendPayload(reason)) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (sendPayload(`${reason}:poll`)) {
      clearInterval(timer);
      return;
    }
    if (attempts >= 100) {
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
          message: "callback_payload_timeout",
          error: "callback_payload_timeout",
        },
      });
    }
  }, 100);
}

oauthLog("callback_page_loaded", { phase: "preload-start", url: location.href });
window.addEventListener("DOMContentLoaded", () => trySend("domcontentloaded"));
window.addEventListener("load", () => trySend("load"));
