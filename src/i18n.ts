import { i18n } from "@lingui/core";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "ltb-sammlung.locale";

export function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored !== null && isLocale(stored)) {
      return stored;
    }
  } catch {
    // localStorage kann blockiert sein; dann entscheidet die Browsersprache.
  }

  const browserLocale = window.navigator.language.slice(0, 2).toLowerCase();

  return isLocale(browserLocale) ? browserLocale : "de";
}

export async function loadCatalog(locale: Locale): Promise<void> {
  const { messages } = await import(`./locales/${locale}/messages.po`);

  i18n.load(locale, messages);
  i18n.activate(locale);

  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Kein Speichern möglich; die Sprachwahl gilt dann nur für diese Sitzung.
  }
}

export { i18n };
