/**
 * i18n.js — initialise i18next for PARAKH AI
 *
 * Performance: only the active locale is imported at startup.
 * The other two locales are loaded on demand when the user switches language.
 * This saves ~70 KB from the main bundle (hi + kn JSONs are never downloaded
 * unless the user explicitly selects those languages).
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Always bundle English as the fallback so the app works even if a
// dynamic import fails (offline / slow network).
import en from './locales/en.json'

// Determine the active language before React boots so we can import
// only what is needed.  Never trust the navigator language alone —
// the user's explicit choice stored in localStorage takes priority.
const activeLang = localStorage.getItem('parakh_lang') || 'en'

// Lazy-load Hindi or Kannada only when they are actually needed.
// `i18n.addResourceBundle` is called after the dynamic import resolves.
async function loadLocale(lang) {
  if (lang === 'en') return   // English is already bundled
  try {
    let module
    if (lang === 'hi') module = await import('./locales/hi.json')
    else if (lang === 'kn') module = await import('./locales/kn.json')
    if (module) {
      i18n.addResourceBundle(lang, 'translation', module.default, true, true)
    }
  } catch {
    // Silently fall back to English on import failure
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      // Only English is in the synchronous bundle
      en: { translation: en },
    },
    lng: activeLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,   // React already escapes output
    },
    // Disable the language detector — we manage language explicitly via
    // LanguageContext + localStorage to avoid any async detection overhead.
    react: {
      useSuspense: false,   // prevent i18next Suspense from blocking render
    },
  })

// Load the active non-English locale in the background after init
if (activeLang !== 'en') {
  loadLocale(activeLang)
}

// Expose the loader so LanguageContext can call it when the user switches language
export { loadLocale }

export default i18n
