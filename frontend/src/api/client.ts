import axios from "axios";
import { getUserIdHeader } from "../auth/session";
import { clientModeHeaderValue } from "../config/clientCapabilities";
import { resolveApiBaseUrl } from "./runtimeBaseUrl";

/** В dev: /api через Vite proxy, в Electron production: абсолютный URL из preload. */
const baseURL = resolveApiBaseUrl();

export const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

apiClient.interceptors.request.use((config) => {
  const userId = getUserIdHeader();
  if (userId) {
    config.headers.set("X-User-ID", userId);
  }
  config.headers.set("X-Forma-Client", clientModeHeaderValue());
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => Promise.reject(error),
);
