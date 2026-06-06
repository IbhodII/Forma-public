import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {useColorScheme} from 'react-native';

type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'ui_theme_mode';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedTheme: 'light',
  setMode: async () => undefined,
});

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setModeState(v);
      }
    });
  }, []);

  const resolvedTheme: ResolvedTheme =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const setMode = async (next: ThemeMode) => {
    setModeState(next);
    await AsyncStorage.setItem(KEY, next);
  };

  const value = useMemo(
    () => ({mode, resolvedTheme, setMode}),
    [mode, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}

