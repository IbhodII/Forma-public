const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  isDesktop: true,
  clientMode: "desktop_app",
  apiBaseUrl: process.env.FORMA_API_BASE_URL || "",
});

contextBridge.exposeInMainWorld("electronAPI", {
  closeWindow: () => ipcRenderer.send("window-close"),
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  maximizeWindow: () => ipcRenderer.send("window-maximize"),
  // Backward compatibility with previous renderer calls.
  close: () => ipcRenderer.send("window-close"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  onWindowState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("window-state", handler);
    return () => ipcRenderer.removeListener("window-state", handler);
  },
  getLanServerStatus: () => ipcRenderer.invoke("lan-server-status"),
  enableLanServer: () => ipcRenderer.invoke("lan-server-enable"),
  setMobileApiLan: (enabled) => ipcRenderer.invoke("mobile-api-lan-set", enabled),
  pickDatabaseImportFiles: (kind) => ipcRenderer.invoke("database-import-pick", kind),
  startDatabaseImport: (payload) => ipcRenderer.invoke("database-import-start", payload),
  getDatabaseImportStatus: (payload) => ipcRenderer.invoke("database-import-status", payload),
  onDatabaseImportStageProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("database-import-stage-progress", handler);
    return () => ipcRenderer.removeListener("database-import-stage-progress", handler);
  },
  startDatabaseWarmup: (payload) => ipcRenderer.invoke("database-warmup-start", payload),
  getDatabaseWarmupStatus: (payload) => ipcRenderer.invoke("database-warmup-status", payload),
  cancelDatabaseWarmup: (payload) => ipcRenderer.invoke("database-warmup-cancel", payload),
  exportDatabaseZip: (payload) => ipcRenderer.invoke("database-export-zip", payload),
  onOAuthPopupResult: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("oauth-popup-result", handler);
    return () => ipcRenderer.removeListener("oauth-popup-result", handler);
  },
  logOAuthFlow: (event, detail) => {
    ipcRenderer.send("oauth-flow-log", { event, detail });
  },
});
