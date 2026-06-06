import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initClientCapabilities } from "./config/clientCapabilities";
import { I18nProvider } from "./i18n";
import { initThemeFromStorage, ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";
import "./styles/page-shell.css";
import "./styles/desktop-layout.css";

initThemeFromStorage();
initClientCapabilities();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
