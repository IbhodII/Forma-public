const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require("electron");

const isDev = !app.isPackaged;
let backendProcess = null;
let backendPort = null;
let backendHost = "127.0.0.1";
let mobileApiLanEnabled = false;
let backendExitedExpectedly = false;
let backendStdErr = "";
let usingExternalBackend = false;
let mainWindow = null;
const EXTERNAL_FRONTEND_PORT = 5173;
const EXTERNAL_API_PORT_FALLBACK = 8000;
/** Packaged Forma API: keep OAuth callback ports registered in Yandex app settings. */
const PACKAGED_API_PORT_CANDIDATES = [8000, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010, 8011, 8012];
const PACKAGED_API_PORT_DEFAULT = PACKAGED_API_PORT_CANDIDATES[0];

function getDesktopApiConfigPath() {
  return path.join(app.getPath("userData"), "forma-desktop-api.json");
}

function readPackagedApiPortConfig() {
  try {
    const raw = fs.readFileSync(getDesktopApiConfigPath(), "utf8");
    const data = JSON.parse(raw);
    const value = Number(data?.port);
    if (PACKAGED_API_PORT_CANDIDATES.includes(value)) {
      return value;
    }
  } catch {
    // first run
  }
  return PACKAGED_API_PORT_DEFAULT;
}

function writePackagedApiPortConfig(port) {
  const configPath = getDesktopApiConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ port }, null, 2), "utf8");
}

const OAUTH_CALLBACK_PATHS = [
  "/api/cloud/callback/yandex",
  "/api/cloud/callback/google",
  "/api/polar/callback",
];

function isOAuthCallbackUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return OAUTH_CALLBACK_PATHS.some((segment) => parsed.pathname.includes(segment));
  } catch {
    return false;
  }
}

function oauthMessageTypeFromUrl(urlString) {
  try {
    const path = new URL(urlString).pathname;
    if (path.includes("/callback/yandex")) return "yandex-disk-auth";
    if (path.includes("/callback/google")) return "google-drive-auth";
  } catch {
    // noop
  }
  return "oauth-callback";
}

function safeObjectFromSearchParams(params) {
  const out = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

function hashSearchParams(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return new URLSearchParams();
  const queryStart = raw.indexOf("?");
  const body = queryStart >= 0 ? raw.slice(queryStart + 1) : raw.replace(/^\?/, "");
  return new URLSearchParams(body);
}

function parseOAuthCallbackUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const queryParams = parsed.searchParams;
    const hashParams = hashSearchParams(parsed.hash);
    const code = queryParams.get("code") || hashParams.get("code") || "";
    const state = queryParams.get("state") || hashParams.get("state") || "";
    const error = queryParams.get("error") || hashParams.get("error") || "";
    return {
      ok: true,
      rawUrl: urlString,
      pathname: parsed.pathname,
      query: safeObjectFromSearchParams(queryParams),
      hash: safeObjectFromSearchParams(hashParams),
      code,
      state,
      error,
      hasPayload: Boolean(code || state || error),
    };
  } catch (err) {
    return {
      ok: false,
      rawUrl: urlString,
      query: {},
      hash: {},
      code: "",
      state: "",
      error: "",
      hasPayload: false,
      parseError: String(err),
    };
  }
}

function logOAuthCallbackUrl(urlString, sourceEvent) {
  const parsed = parseOAuthCallbackUrl(urlString);
  oauthMainLog("callback_source_event", sourceEvent);
  oauthMainLog("raw_callback_url", parsed.rawUrl);
  oauthMainLog("parsed_callback_query", parsed.query);
  oauthMainLog("parsed_callback_hash", parsed.hash);
  oauthMainLog("extracted_code", parsed.code ? "<present>" : "");
  oauthMainLog("extracted_state", parsed.state ? "<present>" : "");
  if (!parsed.hasPayload) {
    oauthMainLog("ignored_empty_callback", {
      source_event: sourceEvent,
      pathname: parsed.pathname,
      parse_error: parsed.parseError,
    });
    oauthMainLog("oauth_callback_rejected_reason", {
      source_event: sourceEvent,
      reason: "missing_code_state_error",
      pathname: parsed.pathname,
      parse_error: parsed.parseError,
    });
  }
  return parsed;
}

function normalizedOAuthCallbackUrlForBackend(urlString) {
  try {
    const parsed = new URL(urlString);
    const hashParams = hashSearchParams(parsed.hash);
    const hasQueryPayload =
      parsed.searchParams.has("code") ||
      parsed.searchParams.has("state") ||
      parsed.searchParams.has("error");
    const hashCode = hashParams.get("code");
    const hashState = hashParams.get("state");
    const hashError = hashParams.get("error");
    if (hasQueryPayload || (!hashCode && !hashState && !hashError)) return null;
    if (hashCode) parsed.searchParams.set("code", hashCode);
    if (hashState) parsed.searchParams.set("state", hashState);
    if (hashError) parsed.searchParams.set("error", hashError);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

const INTERNAL_APP_ROUTE_PREFIXES = [
  "/home",
  "/workouts",
  "/stretching",
  "/body",
  "/cut-bulk",
  "/food",
  "/analytics",
  "/cycle",
  "/settings",
  "/my-bike",
  "/health-connect",
  "/settings/health-connect",
];

function internalAppRouteFromUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:", "file:"].includes(parsed.protocol)) return null;
    const pathname = parsed.pathname.replace(/\\/g, "/");
    if (pathname.startsWith("/api/")) return null;
    const isInternalRoute = INTERNAL_APP_ROUTE_PREFIXES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
    if (!isInternalRoute) return null;
    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function navigateMainWindowToAppRoute(win, urlString) {
  const route = internalAppRouteFromUrl(urlString);
  if (!route || !win || win.isDestroyed()) return false;
  const script = `
    (() => {
      const target = ${JSON.stringify(route)};
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (current !== target) {
        window.history.pushState(null, "", target);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    })()
  `;
  win.webContents.executeJavaScript(script, true).catch(() => undefined);
  win.focus();
  return true;
}

function readEnvFileLines(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return [];
  return fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
}

function writeEnvFileLines(envPath, lines) {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  fs.writeFileSync(envPath, body, "utf8");
}

function upsertEnvKey(lines, key, value) {
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (!line.startsWith(prefix)) return line;
    found = true;
    return `${prefix}${value}`;
  });
  if (!found) next.push(`${prefix}${value}`);
  return next;
}

function envRedirectPortMismatch(lines, key, port) {
  const prefix = `${key}=`;
  const line = lines.find((entry) => entry.startsWith(prefix));
  if (!line) return false;
  try {
    const uri = new URL(line.slice(prefix.length).trim());
    return String(uri.port || (uri.protocol === "https:" ? "443" : "80")) !== String(port);
  } catch {
    return true;
  }
}

/** Keep packaged OAuth redirect URIs aligned with embedded API port (e.g. 18002). */
function syncPackagedDesktopEnv(port) {
  if (isDev) return;
  const dataDir = app.getPath("userData");
  const dataEnvPath = path.join(dataDir, ".env");
  const resourcesEnvPath = path.join(process.resourcesPath || "", ".env");
  if (!fs.existsSync(dataEnvPath) && fs.existsSync(resourcesEnvPath)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(resourcesEnvPath, dataEnvPath);
  }
  let lines = readEnvFileLines(dataEnvPath);
  const host = "127.0.0.1";
  const publicBase = `http://${host}:${port}`;
  const yandexRedirect = `${publicBase}/api/cloud/callback/yandex`;
  const googleRedirect = `${publicBase}/api/cloud/callback/google`;
  const keys = [
    ["YANDEX_REDIRECT_URI", yandexRedirect],
    ["GOOGLE_REDIRECT_URI", googleRedirect],
    ["PUBLIC_API_BASE_URL", publicBase],
  ];
  let changed = false;
  for (const [key, value] of keys) {
    const missing = !lines.some((line) => line.startsWith(`${key}=`));
    const portMismatch = envRedirectPortMismatch(lines, key, port);
    if (missing || portMismatch) {
      lines = upsertEnvKey(lines, key, value);
      changed = true;
    }
  }
  if (changed) {
    writeEnvFileLines(dataEnvPath, lines);
  }
}

function oauthMainLog(event, detail) {
  const ts = new Date().toISOString();
  const line =
    detail === undefined ? `[${ts}] ${event}` : `[${ts}] ${event} ${JSON.stringify(detail)}`;
  if (detail === undefined) {
    console.info(`[forma-oauth] ${event}`);
  } else {
    console.info(`[forma-oauth] ${event}`, detail);
  }
  try {
    const logPath = path.join(app.getPath("userData"), "logs", "oauth-flow.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
    // ignore log file errors
  }
}

const oauthPopupParentByWindow = new WeakMap();

async function readOAuthPayloadFromPopup(webContents) {
  const script = `(() => {
    const el = document.getElementById("forma-oauth-data");
    if (!el || !el.textContent) {
      return { hasElement: Boolean(el), text: "", payload: null };
    }
    try {
      return { hasElement: true, text: el.textContent, payload: JSON.parse(el.textContent) };
    } catch (err) {
      return { hasElement: true, text: el.textContent, payload: null, error: String(err) };
    }
  })()`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await webContents.executeJavaScript(script, true);
      if (attempt === 0 || attempt === 10 || attempt === 30) {
        oauthMainLog("callback_payload_element_found", {
          attempt,
          found: Boolean(result?.hasElement),
          text_length: result?.text?.length ?? 0,
        });
      }
      if (result?.text) {
        oauthMainLog("callback_payload_text", String(result.text).slice(0, 1000));
      }
      if (result?.payload && typeof result.payload === "object") {
        oauthMainLog("preload_payload_read_success", {
          via: "main_execute_js",
          type: result.payload.type,
          status: result.payload.status,
          user_id: result.payload.user_id,
          linked_only: result.payload.linked_only,
        });
        return result.payload;
      }
      if (result?.error) {
        oauthMainLog("preload_payload_read_failed", {
          via: "main_execute_js",
          error: result.error,
        });
      }
    } catch (err) {
      if (attempt === 7) {
        oauthMainLog("oauth_payload_read_failed", String(err));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function relayOAuthToMainWindow(parentWin, popupWin, payload, meta) {
  if (popupWin && popupWin.__oauthRelayed) return;
  const inferredType = meta.url ? oauthMessageTypeFromUrl(meta.url) : undefined;
  if (!payload || typeof payload !== "object") {
    oauthMainLog("ignored_empty_callback", { step: "empty_payload", ...meta });
    return;
  } else if (!payload.type && inferredType) {
    payload = { ...payload, type: inferredType };
  }

  oauthMainLog("oauth_callback_url", {
    url: meta.url ? String(meta.url).split("?")[0] : undefined,
    reason: meta.reason,
  });

  if (payload.status === "success") {
    oauthMainLog("oauth_code_received", {
      type: payload.type,
      user_id: payload.user_id,
      linked_only: payload.linked_only,
    });
    oauthMainLog("token_exchange_success", { via: "callback_html" });
    oauthMainLog("token_saved_to_backend", {
      user_id: payload.user_id,
      linked_only: payload.linked_only,
    });
  } else if (payload.status === "error") {
    oauthMainLog("token_exchange_failed", payload);
  }

  if (parentWin && !parentWin.isDestroyed()) {
    oauthMainLog("main_window_notified", {
      type: payload.type,
      status: payload.status,
      user_id: payload.user_id,
    });
    parentWin.webContents.send("oauth-popup-result", payload);
  } else {
    oauthMainLog("oauth_ui_error_shown", {
      step: "main_window_missing",
      status: payload.status,
    });
  }

  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.__oauthRelayed = true;
    oauthMainLog("oauth_window_close_requested", {
      reason: meta.reason,
      status: payload.status,
      type: payload.type,
    });
    popupWin.close();
  }
}

async function finishOAuthRelay(popupWin, parentWin, reason, eventUrl) {
  if (!popupWin || popupWin.isDestroyed() || popupWin.__oauthRelayed) return false;
  const url = eventUrl || popupWin.webContents.getURL();
  if (!isOAuthCallbackUrl(url)) return false;
  const parsedCallback = logOAuthCallbackUrl(url, reason);
  if (!parsedCallback.hasPayload) return false;

  oauthMainLog("oauth_redirect_seen", { reason, url: url.split("?")[0] });
  oauthMainLog("oauth_callback_received", { reason, url: url.split("?")[0] });
  if (parsedCallback.code) {
    oauthMainLog("oauth_code_extracted", {
      source_event: reason,
      state_present: Boolean(parsedCallback.state),
    });
    oauthMainLog("token_exchange_started", {
      provider: oauthMessageTypeFromUrl(url),
      via: "desktop_callback_url",
    });
  }

  let payload = await readOAuthPayloadFromPopup(popupWin.webContents);
  if (!payload) {
    oauthMainLog("ignored_empty_callback", {
      step: "payload_read_failed",
      reason,
      url: url.split("?")[0],
      code_present: Boolean(parsedCallback.code),
      state_present: Boolean(parsedCallback.state),
      error_present: Boolean(parsedCallback.error),
    });
    if (parsedCallback.error) {
      payload = {
        status: "error",
        type: oauthMessageTypeFromUrl(url),
        error: parsedCallback.error,
        message: parsedCallback.error,
      };
    } else {
      return false;
    }
  }

  relayOAuthToMainWindow(parentWin, popupWin, payload, { reason, url });
  return true;
}

function attachOAuthPopupWindow(popupWin, parentWin) {
  popupWin.__oauthRelayed = false;
  oauthPopupParentByWindow.set(popupWin, parentWin);

  popupWin.webContents.on("console-message", (_event, _level, message) => {
    if (typeof message === "string" && message.includes("forma-oauth-page")) {
      oauthMainLog("callback_html_detected", message);
    }
  });

  popupWin.on("close", (event) => {
    if (!popupWin.__oauthRelayed) {
      const url = popupWin.webContents.getURL();
      if (!isOAuthCallbackUrl(url)) {
        return;
      }
      const parsedCallback = logOAuthCallbackUrl(url, "close-guard");
      if (!parsedCallback.hasPayload) {
        return;
      }
      event.preventDefault();
      void finishOAuthRelay(popupWin, parentWin, "close-guard", url).then((relayed) => {
        if (relayed && !popupWin.isDestroyed() && !popupWin.__oauthRelayed) {
          popupWin.close();
        }
      });
    }
  });

  popupWin.webContents.on("did-finish-load", () => {
    const url = popupWin.webContents.getURL();
    if (isOAuthCallbackUrl(url)) {
      oauthMainLog("callback_page_loaded", { source_event: "did-finish-load", url: url.split("?")[0] });
      const normalizedUrl = normalizedOAuthCallbackUrlForBackend(url);
      if (normalizedUrl) {
        oauthMainLog("oauth_hash_callback_normalized", {
          source_event: "did-finish-load",
          url: url.split("?")[0],
        });
        popupWin.loadURL(normalizedUrl).catch((err) => {
          oauthMainLog("oauth_hash_callback_normalize_failed", String(err));
        });
        return;
      }
    }
    void finishOAuthRelay(popupWin, parentWin, "did-finish-load", url);
  });
  popupWin.webContents.on("will-navigate", (event, url) => {
    oauthMainLog("oauth_window_navigation_url", { source_event: "will-navigate", url });
    if (!isOAuthCallbackUrl(url)) return;
    oauthMainLog("oauth_callback_candidate", { source_event: "will-navigate", url });
    logOAuthCallbackUrl(url, "will-navigate");
    const normalizedUrl = normalizedOAuthCallbackUrlForBackend(url);
    if (normalizedUrl) {
      event.preventDefault();
      oauthMainLog("oauth_hash_callback_normalized", {
        source_event: "will-navigate",
        url: url.split("?")[0],
      });
      popupWin.loadURL(normalizedUrl).catch((err) => {
        oauthMainLog("oauth_hash_callback_normalize_failed", String(err));
      });
      return;
    }
    oauthMainLog("oauth_redirect_seen", { reason: "will-navigate", url: url.split("?")[0] });
  });
  popupWin.webContents.on("did-navigate", (_event, url) => {
    oauthMainLog("oauth_window_navigation_url", { source_event: "did-navigate", url });
    if (isOAuthCallbackUrl(url)) {
      oauthMainLog("oauth_callback_candidate", { source_event: "did-navigate", url });
      logOAuthCallbackUrl(url, "did-navigate");
      oauthMainLog("oauth_redirect_seen", { reason: "did-navigate", url: url.split("?")[0] });
    }
  });
}

ipcMain.on("oauth-popup-complete", (event, message) => {
  const popupWin = BrowserWindow.fromWebContents(event.sender);
  const parentWin = popupWin ? oauthPopupParentByWindow.get(popupWin) : mainWindow;
  if (popupWin?.__oauthRelayed) return;
  if (!message?.payload || typeof message.payload !== "object") {
    oauthMainLog("ignored_empty_callback", {
      source_event: message?.reason || "preload",
      step: "preload_empty_payload",
      url: message?.url,
    });
    return;
  }
  if (message?.payload?.error === "callback_payload_timeout") {
    oauthMainLog("oauth_callback_timeout_last_url", {
      url: message?.url,
      reason: message?.reason || "preload",
    });
  }
  if (message?.url && isOAuthCallbackUrl(message.url)) {
    logOAuthCallbackUrl(message.url, message?.reason || "preload");
  }
  oauthMainLog("main_payload_received", {
    reason: message?.reason || "preload",
    type: message?.payload?.type,
    status: message?.payload?.status,
    user_id: message?.payload?.user_id,
    linked_only: message?.payload?.linked_only,
  });
  oauthMainLog("oauth_callback_received", {
    reason: message?.reason || "preload",
    via: "oauth-popup-preload",
  });
  relayOAuthToMainWindow(parentWin, popupWin, message?.payload, {
    reason: message?.reason || "preload",
    url: message?.url,
  });
});

ipcMain.on("oauth-flow-log", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;
  oauthMainLog(payload.event || "renderer_log", payload.detail);
});

function resolvePortHint() {
  if (!isDev) {
    return readPackagedApiPortConfig();
  }
  const fromEnv = process.env.VITE_API_PORT?.trim();
  if (fromEnv) return Number(fromEnv);
  const fromPortEnv = process.env.PORT?.trim();
  if (fromPortEnv) return Number(fromPortEnv);
  return 8002;
}

function resolveDevProjectRoot() {
  const candidates = [
    path.join(process.cwd(), ".api-port"),
    path.join(__dirname, "..", "..", ".api-port"),
  ];
  for (const apiPortFile of candidates) {
    const root = path.dirname(apiPortFile);
    if (fs.existsSync(path.join(root, "backend", "main.py"))) {
      return root;
    }
  }
  return path.join(__dirname, "..", "..");
}

/** Read dev .api-port for LAN UI only — packaged runtime must not use this for binding. */
function readDevProjectApiPortHint() {
  try {
    const root = resolveDevProjectRoot();
    const raw = fs.readFileSync(path.join(root, ".api-port"), "utf8").trim();
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : EXTERNAL_API_PORT_FALLBACK;
  } catch {
    return EXTERNAL_API_PORT_FALLBACK;
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      resolve(false);
    });
    // Check wildcard bind because backend starts on 0.0.0.0.
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPortOwnerPid(port) {
  if (process.platform !== "win32") return null;
  try {
    const result = require("node:child_process")
      .execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
        windowsHide: true,
        encoding: "utf8",
      })
      .trim();
    const line = result
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.includes(`:${port}`));
    if (!line) return null;
    const parts = line.split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function getProcessNameByPid(pid) {
  if (process.platform !== "win32" || !pid) return null;
  try {
    const output = require("node:child_process")
      .execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        windowsHide: true,
        encoding: "utf8",
      })
      .trim();
    if (!output || output.startsWith("INFO:")) return null;
    const firstField = output.split(",")[0] || "";
    return firstField.replace(/^"|"$/g, "").trim() || null;
  } catch {
    return null;
  }
}

async function tryKillOrphanBackendOnPort(port) {
  const pid = getPortOwnerPid(port);
  if (!pid) return false;
  const name = getProcessNameByPid(pid);
  if (!name || name.toLowerCase() !== "backend.exe") return false;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    for (let i = 0; i < 20; i += 1) {
      if (await isPortAvailable(port)) return true;
      await sleep(150);
    }
    return false;
  } catch {
    return false;
  }
}

function waitForBackendReady(port, maxAttempts = 120) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts += 1;
      const check = (endpoint, onDone) => {
        const req = http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
          res.resume();
          onDone(res.statusCode === 200);
        });
        req.on("error", () => onDone(false));
        req.setTimeout(1200, () => req.destroy());
      };
      check("/api/health", (apiHealthy) => {
        if (apiHealthy) {
          resolve(true);
          return;
        }
        check("/health", (legacyHealthy) => {
          if (legacyHealthy) {
            resolve(true);
            return;
          }
          if (attempts >= maxAttempts) {
            resolve(false);
            return;
          }
          setTimeout(tryOnce, 350);
        });
      });
    };
    tryOnce();
  });
}

function checkBackendHealth(port) {
  return new Promise((resolve) => {
    const check = (endpoint, onDone) => {
      const req = http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
        res.resume();
        onDone(res.statusCode === 200);
      });
      req.on("error", () => onDone(false));
      req.setTimeout(1200, () => req.destroy());
    };
    check("/api/health", (apiHealthy) => {
      if (apiHealthy) {
        resolve(true);
        return;
      }
      check("/health", (legacyHealthy) => resolve(legacyHealthy));
    });
  });
}

function getMobileApiLanConfigPath() {
  return path.join(app.getPath("userData"), "mobile-api-lan.json");
}

function readMobileApiLanEnabled() {
  try {
    const raw = fs.readFileSync(getMobileApiLanConfigPath(), "utf8");
    const data = JSON.parse(raw);
    return Boolean(data.enabled);
  } catch {
    return false;
  }
}

function writeMobileApiLanEnabled(enabled) {
  const configPath = getMobileApiLanConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ enabled: Boolean(enabled) }), "utf8");
  mobileApiLanEnabled = Boolean(enabled);
}

function resolveOpenFirewallScript() {
  const candidates = [
    path.join(process.cwd(), "scripts", "open_lan_firewall.ps1"),
    path.join(__dirname, "..", "..", "scripts", "open_lan_firewall.ps1"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function tryOpenFirewallForApi(port) {
  if (process.platform !== "win32") return;
  const scriptPath = resolveOpenFirewallScript();
  if (!scriptPath) return;
  try {
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-ApiOnly",
        "-ApiPort",
        String(port),
      ],
      { windowsHide: true, stdio: "ignore" },
    ).unref();
  } catch {
    // user can run firewall script manually as admin
  }
}

async function restartManagedBackend(host) {
  if (usingExternalBackend) {
    throw new Error("API управляется другим процессом. Закройте его и перезапустите Forma.");
  }
  const port = backendPort ?? resolvePortHint();
  stopBackend();
  for (let i = 0; i < 25; i += 1) {
    if (await isPortAvailable(port)) break;
    await sleep(150);
  }
  return startBackend(host);
}

function resolveLanIp() {
  const nets = os.networkInterfaces();
  for (const netName of Object.keys(nets)) {
    const iface = nets[netName] || [];
    for (const item of iface) {
      if (item.family !== "IPv4" || item.internal) continue;
      const addr = item.address || "";
      if (addr.startsWith("192.168.") || addr.startsWith("10.") || addr.startsWith("172.")) {
        return addr;
      }
    }
  }
  return null;
}

function resolveTailscaleIp() {
  const nets = os.networkInterfaces();
  for (const netName of Object.keys(nets)) {
    const iface = nets[netName] || [];
    for (const item of iface) {
      if (item.family !== "IPv4" || item.internal) continue;
      const addr = item.address || "";
      if (addr.startsWith("100.")) return addr;
    }
  }
  return null;
}

function resolveExternalStartScriptPath() {
  const explicitPath = process.env.FORMA_EXTERNAL_START_SCRIPT?.trim();
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }
  const candidates = [
    path.join(process.cwd(), "start.ps1"),
    path.join(__dirname, "..", "..", "start.ps1"),
    path.join(app.getPath("desktop"), "MyHealthDashboard", "start.ps1"),
    path.join(app.getPath("documents"), "MyHealthDashboard", "start.ps1"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function readExternalApiPortHint() {
  if (!isDev) {
    return backendPort ?? readPackagedApiPortConfig();
  }
  return readDevProjectApiPortHint();
}

async function findAvailablePackagedPort(preferred) {
  const ordered = [
    preferred,
    ...PACKAGED_API_PORT_CANDIDATES.filter((port) => port !== preferred),
  ].filter((port) => PACKAGED_API_PORT_CANDIDATES.includes(port));
  for (const port of ordered) {
    if (await isPortAvailable(port)) {
      return port;
    }
    await tryKillOrphanBackendOnPort(port);
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `No free registered OAuth port is available for Forma desktop API: ${PACKAGED_API_PORT_CANDIDATES.join(", ")}.`,
  );
}

function checkHttpListening(port, pathName = "/") {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${pathName}`, (res) => {
      res.resume();
      resolve((res.statusCode || 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnBackendProcess(port, host) {
  const dataDir = app.getPath("userData");
  const resourcesEnvPath = path.join(process.resourcesPath || "", ".env");
  const dataEnvPath = path.join(dataDir, ".env");
  const formaEnvPath = fs.existsSync(dataEnvPath)
    ? dataEnvPath
    : fs.existsSync(resourcesEnvPath)
      ? resourcesEnvPath
      : "";
  if (isDev) {
    const projectRoot = path.join(__dirname, "..", "..");
    const venvPython = path.join(projectRoot, "venv", "Scripts", "python.exe");
    const pythonExe = process.env.FORMA_PYTHON || (fs.existsSync(venvPython) ? venvPython : "python");
    return spawn(
      pythonExe,
      ["-m", "uvicorn", "backend.main:app", "--host", host, "--port", String(port)],
      {
        cwd: projectRoot,
        windowsHide: true,
        stdio: "pipe",
        env: {
          ...process.env,
          PORT: String(port),
          FORMA_HOST: host,
          FORMA_SERVE_STATIC: "1",
          FORMA_STATIC_DIR: path.join(__dirname, "..", "dist"),
          FORMA_DATA_DIR: dataDir,
          FORMA_ENV_PATH: formaEnvPath,
        },
      },
    );
  }

  const backendExe = path.join(process.resourcesPath, "backend.exe");
  if (!fs.existsSync(backendExe)) {
    throw new Error(`backend.exe not found at ${backendExe}`);
  }
  return spawn(backendExe, [], {
    cwd: process.resourcesPath,
    windowsHide: true,
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      FORMA_HOST: host,
      FORMA_SERVE_STATIC: "1",
      FORMA_DATA_DIR: dataDir,
      FORMA_ENV_PATH: formaEnvPath,
    },
  });
}

async function startBackend(host = "127.0.0.1") {
  const launchManagedBackend = async (port, backendHostValue, allowRetry = true) => {
    usingExternalBackend = false;
    backendHost = backendHostValue;
    backendPort = port;
    backendProcess = spawnBackendProcess(backendPort, backendHost);
    backendExitedExpectedly = false;
    backendStdErr = "";

    backendProcess.stdout?.on("data", () => undefined);
    backendProcess.stderr?.on("data", (chunk) => {
      const text = String(chunk || "");
      backendStdErr = `${backendStdErr}${text}`.slice(-8000);
    });

    const ok = await waitForBackendReady(backendPort);
    if (ok) {
      oauthMainLog("backend_callback_listener_status", {
        port: backendPort,
        host: backendHost,
        yandex_callback: `http://127.0.0.1:${backendPort}/api/cloud/callback/yandex`,
        healthy: true,
      });
      backendProcess.on("exit", (code) => {
        if (!backendExitedExpectedly && code !== 0 && BrowserWindow.getAllWindows().length > 0) {
          const details = backendStdErr.trim();
          const suffix = details ? `\n\nBackend stderr:\n${details}` : "";
          dialog.showErrorBox(
            "Backend process stopped",
            `Embedded backend exited with code ${code ?? "unknown"}.${suffix}`,
          );
          app.quit();
        }
      });
      return backendPort;
    }

    const details = backendStdErr.trim();
    const lowerDetails = details.toLowerCase();
    const isPortConflict = lowerDetails.includes("10048") || lowerDetails.includes("address already in use");
    if (allowRetry && isPortConflict) {
      stopBackend();
      await tryKillOrphanBackendOnPort(port);
      for (let i = 0; i < 15; i += 1) {
        if (await isPortAvailable(port)) break;
        await sleep(150);
      }
      return launchManagedBackend(port, backendHostValue, false);
    }

    const suffix = details ? `\n\nBackend stderr:\n${details}` : "";
    throw new Error(`Backend did not become healthy on port ${backendPort}.${suffix}`);
  };

  let preferredPort = resolvePortHint();

  if (!isDev) {
    oauthMainLog("oauth_packaged_mode", {
      preferred_port: preferredPort,
      registered_ports: PACKAGED_API_PORT_CANDIDATES,
    });
    preferredPort = await findAvailablePackagedPort(preferredPort);
    if (preferredPort !== readPackagedApiPortConfig()) {
      writePackagedApiPortConfig(preferredPort);
    }
    return launchManagedBackend(preferredPort, host, true);
  }

  const free = await isPortAvailable(preferredPort);
  if (!free) {
    await tryKillOrphanBackendOnPort(preferredPort);
    const freeAfterKill = await isPortAvailable(preferredPort);
    if (freeAfterKill) {
      return launchManagedBackend(preferredPort, host, true);
    }

    const healthy = await checkBackendHealth(preferredPort);
    if (healthy) {
      usingExternalBackend = true;
      backendHost = "127.0.0.1";
      backendPort = preferredPort;
      return backendPort;
    }
    throw new Error(`Port ${preferredPort} is busy by another process. Close it and retry.`);
  }
  return launchManagedBackend(preferredPort, host, true);
}

function stopBackend() {
  if (usingExternalBackend || !backendProcess) return;
  backendExitedExpectedly = true;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(backendProcess.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      backendProcess.kill("SIGTERM");
    }
  } catch {
    // noop
  }
  backendProcess = null;
}

function resolveWindowIcon() {
  const iconCandidates = [
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "public", "favicon.ico"),
    path.join(__dirname, "..", "public", "favicon.png"),
  ];
  return iconCandidates.find((iconPath) => fs.existsSync(iconPath));
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b1220" : "#f8fafc",
    titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("maximize", () => {
    win.webContents.send("window-state", { isMaximized: true });
  });

  win.on("unmaximize", () => {
    win.webContents.send("window-state", { isMaximized: false });
  });

  win.webContents.on("did-create-window", (childWindow) => {
    attachOAuthPopupWindow(childWindow, win);
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (navigateMainWindowToAppRoute(win, url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (navigateMainWindowToAppRoute(win, url)) {
      return { action: "deny" };
    }
    try {
      const parsed = new URL(url);
      const isLocalOAuth =
        parsed.protocol === "http:" &&
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
        (parsed.pathname.startsWith("/api/cloud/auth/") || parsed.pathname.startsWith("/api/polar/auth"));
      if (isLocalOAuth) {
        oauthMainLog("oauth_window_opened", { url: parsed.pathname });
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            parent: win,
            modal: false,
            width: 640,
            height: 760,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              devTools: true,
              preload: path.join(__dirname, "oauth-popup-preload.cjs"),
            },
          },
        };
      }
    } catch {
      // fallback to external open below
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!backendPort) throw new Error("backendPort is not set");
  if (isDev && usingExternalBackend) {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    win.loadURL(`http://127.0.0.1:${backendPort}`);
  }

  win.webContents.on("did-finish-load", () => {
    win.webContents.send("window-state", { isMaximized: win.isMaximized() });
  });

  return win;
}

ipcMain.on("window-close", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  targetWindow?.close();
});

ipcMain.on("window-minimize", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  targetWindow?.minimize();
});

ipcMain.on("window-maximize", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow) return;
  if (targetWindow.isMaximized()) targetWindow.unmaximize();
  else targetWindow.maximize();
});

function buildLanStatusPayload() {
  const lanIp = resolveLanIp();
  const tailscaleIp = resolveTailscaleIp();
  const externalApiPort = readExternalApiPortHint();
  const apiPort = usingExternalBackend ? externalApiPort : backendPort ?? resolvePortHint();
  const apiLanEnabled = backendHost === "0.0.0.0";
  return {
    lanIp,
    tailscaleIp,
    apiPort,
    apiLanEnabled,
    apiHost: backendHost,
    apiLanUrl: apiLanEnabled && lanIp ? `http://${lanIp}:${apiPort}` : null,
    apiTailscaleUrl: apiLanEnabled && tailscaleIp ? `http://${tailscaleIp}:${apiPort}` : null,
    apiHealthUrl:
      apiLanEnabled && lanIp ? `http://${lanIp}:${apiPort}/api/health` : null,
    externalApiPort,
  };
}

const databaseImportRestarted = new Set();

function getImportJobsRoot() {
  return path.join(app.getPath("userData"), "import-jobs");
}

function findDbFilesRecursive(rootDir, fileName) {
  const matches = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.name.toLowerCase() === fileName.toLowerCase()) {
        matches.push(full);
      }
    }
  }
  walk(rootDir);
  return matches;
}

function extractZipArchive(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const escapedZip = zipPath.replace(/'/g, "''");
  const escapedDest = destDir.replace(/'/g, "''");
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
    ],
    { windowsHide: true },
  );
}

function emitDatabaseImportStageProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("database-import-stage-progress", payload);
  }
}

function copyFileToStaging(srcPath, destPath, label) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const total = fs.statSync(srcPath).size || 1;
  const rs = fs.createReadStream(srcPath);
  const ws = fs.createWriteStream(destPath);
  let copied = 0;
  rs.on("data", (chunk) => {
    copied += chunk.length;
    const percent = Math.min(99, Math.round((copied / total) * 100));
    emitDatabaseImportStageProgress({
      percent,
      message: label ? `Копирование: ${label}` : "Копирование…",
    });
  });
  return new Promise((resolve, reject) => {
    rs.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", () => {
      emitDatabaseImportStageProgress({ percent: 100, message: label || "Готово" });
      resolve();
    });
    rs.pipe(ws);
  });
}

async function stageDatabaseImportSource(source) {
  const { randomUUID } = require("node:crypto");
  const jobId = randomUUID();
  const jobDir = path.join(getImportJobsRoot(), jobId);
  const stagingDir = path.join(jobDir, "staging");
  fs.mkdirSync(stagingDir, { recursive: true });

  let workoutsSrc;
  let sharedSrc;
  if (source.kind === "zip") {
    emitDatabaseImportStageProgress({ percent: 5, message: "Распаковка ZIP…" });
    const extractDir = path.join(jobDir, "extracted");
    extractZipArchive(source.path, extractDir);
    const workoutsMatches = findDbFilesRecursive(extractDir, "workouts.db");
    const sharedMatches = findDbFilesRecursive(extractDir, "shared.db");
    if (!workoutsMatches.length || !sharedMatches.length) {
      throw new Error("В архиве должны быть workouts.db и shared.db");
    }
    workoutsSrc = workoutsMatches[0];
    sharedSrc = sharedMatches[0];
  } else {
    workoutsSrc = source.workoutsPath;
    sharedSrc = source.sharedPath;
    if (!fs.existsSync(workoutsSrc) || !fs.existsSync(sharedSrc)) {
      throw new Error("Оба файла базы должны существовать");
    }
  }

  const workoutsStaging = path.join(stagingDir, "workouts.db");
  const sharedStaging = path.join(stagingDir, "shared.db");
  await copyFileToStaging(workoutsSrc, workoutsStaging, "workouts.db");
  await copyFileToStaging(sharedSrc, sharedStaging, "shared.db");

  const manifest = {
    jobId,
    mode: source.mode || "replace",
    workoutsPath: "staging/workouts.db",
    sharedPath: "staging/shared.db",
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(jobDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return { jobId, jobDir, mode: manifest.mode };
}

const DATABASE_IMPORT_STATUS_TIMEOUT_MS = 300_000;

function backendApiRequest(method, apiPath, body, userId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const port = backendPort ?? resolvePortHint();
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/api${apiPath}`,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": String(userId || 1),
          "X-Forma-Client": "desktop_app",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed = {};
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = { detail: raw };
            }
          }
          if (res.statusCode >= 400) {
            const detail =
              typeof parsed.detail === "string"
                ? parsed.detail
                : parsed.detail?.message || raw || `HTTP ${res.statusCode}`;
            reject(new Error(detail));
            return;
          }
          resolve(parsed);
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Backend request timeout (${timeoutMs}ms): ${method} ${apiPath}`));
    });
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const WARMUP_API_TIMEOUT_MS = 15000;
const EXPORT_API_TIMEOUT_MS = 300_000;
const EXPORT_POLL_MS = 800;

function backendApiDownloadToFile(apiPath, destPath, userId, timeoutMs = EXPORT_API_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const port = backendPort ?? resolvePortHint();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/api${apiPath}`,
        method: "GET",
        headers: {
          "X-User-ID": String(userId || 1),
          "X-Forma-Client": "desktop_app",
        },
      },
      (res) => {
        if (res.statusCode >= 400) {
          let raw = "";
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            let detail = raw || `HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed.detail === "string") {
                detail = parsed.detail;
              }
            } catch {
              /* raw text */
            }
            reject(new Error(detail));
          });
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on("finish", () => resolve(destPath));
        out.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Download timeout: ${apiPath}`));
    });
    req.end();
  });
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDatabaseExportUntilReady(taskId, userId) {
  for (;;) {
    const status = await backendApiRequest(
      "GET",
      `/database/export/status/${encodeURIComponent(taskId)}`,
      null,
      userId,
      EXPORT_API_TIMEOUT_MS,
    );
    if (status.status === "completed") {
      return status;
    }
    if (status.status === "failed") {
      throw new Error(status.error || status.message || "Ошибка экспорта базы");
    }
    await sleepMs(EXPORT_POLL_MS);
  }
}

async function discardDatabaseExportResult(taskId, userId) {
  const discardPath = path.join(app.getPath("temp"), `forma-export-discard-${taskId}.zip`);
  try {
    await backendApiDownloadToFile(
      `/database/export/result/${encodeURIComponent(taskId)}`,
      discardPath,
      userId,
    );
  } catch {
    /* already consumed or failed */
  }
  try {
    if (fs.existsSync(discardPath)) {
      fs.unlinkSync(discardPath);
    }
  } catch {
    /* ignore */
  }
}

ipcMain.handle("database-export-zip", async (_event, payload) => {
  const userId = Number(payload?.userId) || 1;
  let started;
  try {
    started = await backendApiRequest(
      "POST",
      "/database/export/start",
      null,
      userId,
      EXPORT_API_TIMEOUT_MS,
    );
  } catch (err) {
    const msg = String(err?.message || err);
    const conflictMatch = msg.includes("task_id");
    if (!conflictMatch) {
      throw err;
    }
    throw err;
  }
  const taskId = started.task_id;
  const status = await pollDatabaseExportUntilReady(taskId, userId);
  const defaultName = status.download_filename || "forma_db_export.zip";
  const save = await dialog.showSaveDialog({
    title: "Сохранить полную базу (ZIP)",
    defaultPath: defaultName,
    filters: [{ name: "ZIP archive", extensions: ["zip"] }],
  });
  if (save.canceled || !save.filePath) {
    await discardDatabaseExportResult(taskId, userId);
    return null;
  }
  await backendApiDownloadToFile(
    `/database/export/result/${encodeURIComponent(taskId)}`,
    save.filePath,
    userId,
  );
  return save.filePath;
});

ipcMain.handle("database-import-pick", async (_event, kind) => {
  if (kind === "zip") {
    const result = await dialog.showOpenDialog({
      title: "Выберите ZIP с workouts.db и shared.db",
      properties: ["openFile"],
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    const zipPath = result.filePaths[0];
    const sizeBytes = fs.statSync(zipPath).size;
    return { kind: "zip", path: zipPath, sizeBytes };
  }

  const result = await dialog.showOpenDialog({
    title: "Выберите workouts.db и shared.db",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "SQLite", extensions: ["db", "sqlite"] }],
  });
  if (result.canceled || !result.filePaths?.length) {
    return null;
  }
  const workoutsPath = result.filePaths.find(
    (p) => path.basename(p).toLowerCase() === "workouts.db",
  );
  const sharedPath = result.filePaths.find(
    (p) => path.basename(p).toLowerCase() === "shared.db",
  );
  if (!workoutsPath || !sharedPath) {
    throw new Error("Нужно выбрать оба файла: workouts.db и shared.db");
  }
  const sizeBytes =
    fs.statSync(workoutsPath).size + fs.statSync(sharedPath).size;
  return { kind: "files", workoutsPath, sharedPath, sizeBytes };
});

ipcMain.handle("database-import-start", async (_event, payload) => {
  const userId = Number(payload?.userId) || 1;
  const mode = payload?.mode === "merge" ? "merge" : "replace";
  const source = payload?.source;
  if (!source || !source.kind) {
    throw new Error("Не указан источник импорта");
  }
  const staged = await stageDatabaseImportSource({ ...source, mode });
  await backendApiRequest(
    "POST",
    "/database/import/start",
    { job_id: staged.jobId, mode: staged.mode },
    userId,
  );
  return { jobId: staged.jobId };
});

ipcMain.handle("database-import-status", async (_event, payload) => {
  const jobId = payload?.jobId;
  const userId = Number(payload?.userId) || 1;
  if (!jobId) {
    throw new Error("jobId обязателен");
  }
  const status = await backendApiRequest(
    "GET",
    `/database/import/status/${encodeURIComponent(jobId)}`,
    null,
    userId,
    DATABASE_IMPORT_STATUS_TIMEOUT_MS,
  );
  if (status.status === "completed" && !databaseImportRestarted.has(jobId)) {
    databaseImportRestarted.add(jobId);
    try {
      await restartManagedBackend(backendHost);
    } catch (err) {
      status.backendRestartError = String(err?.message || err);
    }
  }
  return status;
});

ipcMain.handle("database-warmup-start", async (_event, payload) => {
  const userId = Number(payload?.userId) || 1;
  const mode = payload?.mode === "light" ? "light" : "full";
  const includeVacuum = Boolean(payload?.includeVacuum);
  const resume = payload?.resume !== false;
  const qs = new URLSearchParams({
    mode,
    include_vacuum: includeVacuum ? "true" : "false",
    resume: resume ? "true" : "false",
  });
  const started = await backendApiRequest(
    "POST",
    `/account/warmup/start?${qs.toString()}`,
    null,
    userId,
    WARMUP_API_TIMEOUT_MS,
  );
  const jobId = started.job_id || started.task_id;
  return { jobId };
});

ipcMain.handle("database-warmup-status", async (_event, payload) => {
  const jobId = payload?.jobId;
  const userId = Number(payload?.userId) || 1;
  if (!jobId) {
    throw new Error("jobId обязателен");
  }
  return backendApiRequest(
    "GET",
    `/account/warmup/status/${encodeURIComponent(jobId)}`,
    null,
    userId,
    WARMUP_API_TIMEOUT_MS,
  );
});

ipcMain.handle("database-warmup-cancel", async (_event, payload) => {
  const userId = Number(payload?.userId) || 1;
  return backendApiRequest(
    "POST",
    "/account/warmup/cancel",
    null,
    userId,
    WARMUP_API_TIMEOUT_MS,
  );
});

ipcMain.handle("lan-server-status", async () => {
  const base = buildLanStatusPayload();
  const externalUp = await checkHttpListening(EXTERNAL_FRONTEND_PORT, "/");
  const enabled = externalUp;
  return {
    enabled,
    managed: !usingExternalBackend,
    port: enabled ? EXTERNAL_FRONTEND_PORT : base.apiPort,
    lanIp: base.lanIp,
    url: enabled && base.lanIp ? `http://${base.lanIp}:${EXTERNAL_FRONTEND_PORT}` : null,
    tailscaleIp: base.tailscaleIp,
    tailscaleUrl:
      enabled && base.tailscaleIp ? `http://${base.tailscaleIp}:${EXTERNAL_FRONTEND_PORT}` : null,
    apiPort: base.apiPort,
    apiLanEnabled: base.apiLanEnabled,
    apiHost: base.apiHost,
    apiLanUrl: base.apiLanUrl,
    apiTailscaleUrl: base.apiTailscaleUrl,
    apiHealthUrl: base.apiHealthUrl,
    mobileApiLanEnabled: mobileApiLanEnabled || base.apiLanEnabled,
  };
});

ipcMain.handle("mobile-api-lan-set", async (_event, enabled) => {
  const wantEnabled = Boolean(enabled);
  writeMobileApiLanEnabled(wantEnabled);
  const host = wantEnabled ? "0.0.0.0" : "127.0.0.1";
  try {
    const port = await restartManagedBackend(host);
    if (wantEnabled) {
      tryOpenFirewallForApi(port);
    }
    const base = buildLanStatusPayload();
    return {
      ok: true,
      message: wantEnabled
        ? "API для телефона включён (Wi‑Fi). Укажите этот адрес в мобильном приложении."
        : "API снова доступен только на этом ПК.",
      apiLanUrl: base.apiLanUrl,
      apiHealthUrl: base.apiHealthUrl,
      apiPort: port,
    };
  } catch (error) {
    writeMobileApiLanEnabled(!wantEnabled);
    return {
      ok: false,
      message: String(error?.message || error),
    };
  }
});

ipcMain.handle("lan-server-enable", async () => {
  const scriptPath = resolveExternalStartScriptPath();
  if (!scriptPath) {
    return {
      ok: false,
      message:
        "Не найден start.ps1. Укажите путь: set FORMA_EXTERNAL_START_SCRIPT=C:\\Users\\brett\\Desktop\\MyHealthDashboard\\start.ps1",
    };
  }
  const projectRoot = path.dirname(scriptPath);

  try {
    // cmd start opens a visible console on Windows (detached powershell alone often does not).
    spawn(
      "cmd.exe",
      [
        "/c",
        "start",
        "MyHealthDashboard LAN",
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-NoExit",
        "-File",
        scriptPath,
        "-DesktopLan",
        "-SkipApiPortConfig",
      ],
      {
        cwd: projectRoot,
        windowsHide: false,
        detached: true,
        stdio: "ignore",
      },
    ).unref();
  } catch {
    return {
      ok: false,
      message: "Не удалось запустить start.ps1.",
    };
  }

  for (let i = 0; i < 25; i += 1) {
    // up to ~15s warmup
    // eslint-disable-next-line no-await-in-loop
    const ready = await checkHttpListening(EXTERNAL_FRONTEND_PORT, "/");
    if (ready) {
      return {
        ok: true,
        message: "Внешний сервер запущен (без открытия браузера).",
      };
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(600);
  }

  return {
    ok: true,
    message: "Команда запуска отправлена. Если localhost не поднялся, проверьте окно PowerShell со скриптом start.ps1.",
  };
});

app.whenReady().then(async () => {
  if (!isDev && process.platform === "win32") {
    const stalePort = readPackagedApiPortConfig();
    await tryKillOrphanBackendOnPort(stalePort);
  }
  mobileApiLanEnabled = readMobileApiLanEnabled();
  const initialHost = mobileApiLanEnabled ? "0.0.0.0" : "127.0.0.1";
  startBackend(initialHost)
    .then((port) => {
      if (mobileApiLanEnabled) {
        tryOpenFirewallForApi(port);
      }
      syncPackagedDesktopEnv(port);
      process.env.FORMA_API_BASE_URL = `http://127.0.0.1:${port}/api`;
      mainWindow = createMainWindow();
    })
    .catch((error) => {
      dialog.showErrorBox("Failed to start backend", String(error?.message || error));
      app.quit();
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopBackend();
});
