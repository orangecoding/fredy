/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { createContext, useContext, useMemo } from 'react';

// Auto-discover all locale JSON files at build time
const localeModules = import.meta.glob('../../locales/*.json', { eager: true });

/**
 * Build resources object: { en: {...translations}, de: {...translations}, ... }
 * Strips _meta from each locale file.
 * @type {Record<string, Record<string, string>>}
 */
const resources = {};

/**
 * Build availableLanguages array: [{ code, flag, name, locale }, ...]
 * Uses _meta from each locale file with fallbacks.
 * @type {Array<{code: string, flag: string, name: string, locale: string}>}
 */
const availableLanguages = [];

/** Maps language code to BCP 47 locale string (e.g. 'de' → 'de-DE') */
const localeMap = {};

for (const [path, module] of Object.entries(localeModules)) {
  // Extract locale code from path: '../../locales/en.json' -> 'en'
  const match = path.match(/\/(\w+)\.json$/);
  if (!match) continue;

  const code = match[1];
  const localeData = module.default || module;

  // Extract _meta and build resources
  const { _meta, ...translations } = localeData;
  resources[code] = translations;

  // Build availableLanguages entry
  const flag = _meta?.flag || '';
  const name = _meta?.name || code;
  const locale = _meta?.locale || code;
  const semiLocale = _meta?.semiLocale || null;
  localeMap[code] = locale;
  availableLanguages.push({ code, flag, name, locale, semiLocale });
}

if (availableLanguages.length === 0) {
  console.warn('i18n: No locale files found in locales/');
}
if (!resources.en) {
  console.error('i18n: English locale (en.json) is required as the fallback language');
}

/**
 * Translation context
 * @type {React.Context<{t: (key: string, vars?: Record<string, string>) => string, locale: string}>}
 */
const TranslationContext = createContext(null);

/**
 * I18nProvider component
 * Accepts a language prop and provides a t() function via context.
 * Falls back to English, then to key itself if translation missing.
 * Supports {{varName}} interpolation.
 *
 * @param {Object} props
 * @param {string} props.language - Active language code (e.g., 'en', 'de')
 * @param {React.ReactNode} props.children - Child components
 * @returns {React.ReactNode}
 */
export function I18nProvider({ language = 'en', children }) {
  /**
   * Translate a key with optional variable interpolation
   * @param {string} key - Translation key (e.g., 'nav.dashboard')
   * @param {Record<string, string>} [vars] - Variables for {{varName}} interpolation
   * @returns {string}
   */
  const t = (key, vars = {}) => {
    // Try active language
    let translation = resources[language]?.[key];

    // Fallback to English
    if (!translation) {
      translation = resources.en?.[key];
    }

    // Fallback to key itself
    if (!translation) {
      translation = key;
    }

    // Interpolate variables: replace {{varName}} with values
    if (vars && Object.keys(vars).length > 0) {
      translation = translation.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return vars[varName] !== undefined ? String(vars[varName]) : match;
      });
    }

    return translation;
  };

  const locale = localeMap[language] ?? localeMap.en ?? 'en-US';
  const value = useMemo(() => ({ t, locale }), [language]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

/**
 * Hook to access the translation function from context.
 * @returns {(key: string, vars?: Record<string, string>) => string}
 */
export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context.t;
}

/**
 * Hook to access the active BCP 47 locale string (e.g. 'de-DE', 'en-US').
 * Use this with Intl APIs for locale-aware date/number formatting.
 * @returns {string}
 */
export function useLocale() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useLocale must be used within an I18nProvider');
  }
  return context.locale;
}

// Export resources and availableLanguages for other uses
export { resources, availableLanguages };
