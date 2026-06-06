import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useState,

  type ReactNode,

} from "react";



export type ThemeMode = "light" | "dark" | "system";



const STORAGE_KEY = "app-theme";



interface ThemeContextValue {

  theme: ThemeMode;

  resolvedTheme: "light" | "dark";

  setTheme: (mode: ThemeMode) => void;

}



const ThemeContext = createContext<ThemeContextValue | null>(null);



function readStoredTheme(): ThemeMode {

  try {

    const v = localStorage.getItem(STORAGE_KEY);

    if (v === "dark" || v === "light" || v === "system") return v;

  } catch {

    /* ignore */

  }

  return "light";

}



function systemPrefersDark(): boolean {

  if (typeof window === "undefined") return false;

  return window.matchMedia("(prefers-color-scheme: dark)").matches;

}



function resolveTheme(mode: ThemeMode): "light" | "dark" {

  if (mode === "system") return systemPrefersDark() ? "dark" : "light";

  return mode;

}



function applyThemeClass(resolved: "light" | "dark") {

  const root = document.documentElement;

  if (resolved === "dark") {

    root.classList.add("dark");

  } else {

    root.classList.remove("dark");

  }

}



export function initThemeFromStorage() {

  applyThemeClass(resolveTheme(readStoredTheme()));

}



export function ThemeProvider({ children }: { children: ReactNode }) {

  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme());

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>

    resolveTheme(readStoredTheme()),

  );



  useEffect(() => {

    const resolved = resolveTheme(theme);

    setResolvedTheme(resolved);

    applyThemeClass(resolved);

    try {

      localStorage.setItem(STORAGE_KEY, theme);

    } catch {

      /* ignore */

    }

  }, [theme]);



  useEffect(() => {

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {

      const resolved = resolveTheme("system");

      setResolvedTheme(resolved);

      applyThemeClass(resolved);

    };

    mq.addEventListener("change", onChange);

    return () => mq.removeEventListener("change", onChange);

  }, [theme]);



  const setTheme = useCallback((mode: ThemeMode) => {

    setThemeState(mode);

  }, []);



  const value = useMemo(

    () => ({ theme, resolvedTheme, setTheme }),

    [theme, resolvedTheme, setTheme],

  );



  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;

}



export function useTheme() {

  const ctx = useContext(ThemeContext);

  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");

  return ctx;

}

