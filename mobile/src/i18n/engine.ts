import {en, ru} from './locales';

export type Locale = 'ru' | 'en';

type Dict = Record<string, unknown>;

const dictionaries: Record<Locale, Dict> = {ru, en};

function getNested(obj: Dict, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Dict)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template,
  );
}

export function createI18n(defaultLocale: Locale = 'ru') {
  let locale: Locale = defaultLocale;

  const translate = (key: string, params?: Record<string, string | number>): string => {
    const primary = getNested(dictionaries[locale], key);
    const fallback = getNested(dictionaries.en, key);
    const raw = primary ?? fallback ?? key;
    return interpolate(raw, params);
  };

  return {
    getLocale: (): Locale => locale,
    setLocale: (next: Locale): void => {
      locale = next;
    },
    t: translate,
  };
}

export const i18n = createI18n('ru');

export const t = i18n.t.bind(i18n);
