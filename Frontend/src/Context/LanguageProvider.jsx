import { createContext, useEffect, useState, useCallback } from 'react';
import en from '../i18n/en.json';
import ar from '../i18n/ar.json';
import hi from '../i18n/hi.json';
import ur from '../i18n/ur.json';

const translations = { en, ar, hi, ur };
const RTL_LANGS = new Set(['ar', 'ur']);
const VALID_LANGS = new Set(['en', 'ar', 'hi', 'ur']);

export const LanguageContext = createContext();

function initLangPair() {
  // Try reading the new langPair key
  const stored = localStorage.getItem('langPair');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (VALID_LANGS.has(parsed.primary) && VALID_LANGS.has(parsed.secondary)) {
        return parsed;
      }
    } catch { /* corrupted — fall through */ }
  }
  // Migrate from old 'lang' key
  const oldLang = localStorage.getItem('lang') || 'en';
  localStorage.removeItem('lang'); // clean up old key
  const pair = {
    primary: VALID_LANGS.has(oldLang) ? oldLang : 'en',
    secondary: oldLang === 'en' ? 'ar' : 'en',
    active: VALID_LANGS.has(oldLang) ? oldLang : 'en',
  };
  localStorage.setItem('langPair', JSON.stringify(pair));
  return pair;
}

export const LanguageProvider = ({ children }) => {
  const [langPair, setLangPair] = useState(initLangPair);
  const [lang, setLangState] = useState(langPair.active || langPair.primary);

  // Apply dir and lang attribute whenever lang changes
  useEffect(() => {
    document.documentElement.setAttribute('dir', RTL_LANGS.has(lang) ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.en?.[key] ?? key,
    [lang]
  );

  const isRTL = RTL_LANGS.has(lang);

  // Toggle between primary and secondary (Navbar uses this)
  const toggleLang = useCallback(() => {
    const next = lang === langPair.primary ? langPair.secondary : langPair.primary;
    const updated = { ...langPair, active: next };
    setLangPair(updated);
    setLangState(next);
    localStorage.setItem('langPair', JSON.stringify(updated));
  }, [lang, langPair]);

  // Update the language pair (Settings uses this)
  const updateLangPair = useCallback((primary, secondary) => {
    if (primary === secondary) return;
    if (!VALID_LANGS.has(primary) || !VALID_LANGS.has(secondary)) return;
    const pair = { primary, secondary, active: primary };
    setLangPair(pair);
    setLangState(primary);
    localStorage.setItem('langPair', JSON.stringify(pair));
  }, []);

  // Direct language set (for backward compat if needed)
  const setLang = useCallback((newLang) => {
    if (!VALID_LANGS.has(newLang)) return;
    setLangState(newLang);
    const updated = { ...langPair, active: newLang };
    setLangPair(updated);
    localStorage.setItem('langPair', JSON.stringify(updated));
  }, [langPair]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, langPair, updateLangPair, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};
