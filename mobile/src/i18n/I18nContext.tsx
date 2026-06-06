import React, {createContext, useContext, useMemo, type ReactNode} from 'react';

import {i18n, type Locale} from './engine';

type I18nContextValue = {
  t: typeof i18n.t;
  locale: Locale;
};

const I18nContext = createContext<I18nContextValue>({
  t: i18n.t.bind(i18n),
  locale: 'ru',
});

export function I18nProvider({children}: {children: ReactNode}) {
  const value = useMemo(
    () => ({
      t: i18n.t.bind(i18n),
      locale: i18n.getLocale(),
    }),
    [],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue['t'] {
  return useContext(I18nContext).t;
}
