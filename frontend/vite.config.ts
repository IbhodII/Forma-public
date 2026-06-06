import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
/** Repo root (parent of frontend/). */
const repoRoot = path.resolve(frontendDir, "..");

function resolveApiPort(): string {
  const fromEnv = process.env.VITE_API_PORT?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = fs.readFileSync(path.join(repoRoot, ".api-port"), "utf8").trim();
    if (fromFile) return fromFile;
  } catch {
    // .api-port created by start.ps1
  }
  return "8000";
}

const apiPort = resolveApiPort();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@forma/i18n": path.resolve(repoRoot, "shared/i18n"),
    },
  },
  define: {
    "import.meta.env.VITE_API_PORT": JSON.stringify(apiPort),
  },
  // Plotly не в include — подгружается отдельным чанком при первом PlotChart (см. plotlyLoader.ts).
  optimizeDeps: {
    include: ["react-plotly.js"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("plotly.js-dist-min") || id.includes("plotly.js")) {
            return "plotly";
          }
        },
      },
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // HMR с другого устройства в LAN: websocket на тот же host, что в адресной строке
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        timeout: 300_000,
      },
      "/uploads": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
