import { createContext, useState, useEffect, useCallback } from "react";
import { de, en } from "../i18n/locales.js";

export const I18nContext = createContext();

const resources = { de: { translation: de }, en: { translation: en } };

function initTranslation(locale) {
  localStorage.setItem("mes-lang", locale);
  return locale === "de" ? de : en;
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem("mes-lang");
    return saved && (saved === "de" || saved === "en") ? saved : navigator.language.startsWith("de") ? "de" : "en";
  });

  const t = useCallback((key) => {
    const dict = resources[locale].translation;
    return key.split(".").reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : k), dict);
  }, [locale]);

  function changeLocale(loc) {
    setLocale(loc);
    localStorage.setItem("mes-lang", loc);
  }

  return (
    <I18nContext.Provider value={{ locale, t, changeLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
