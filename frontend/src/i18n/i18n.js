import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import hi from './locales/hi.json'
import kn from './locales/kn.json'

const activeLang = localStorage.getItem('veritas_lang') || 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      kn: { translation: kn },
    },
    lng: activeLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

// loadLocale is a no-op for the three prebuilt languages —
// kept so LanguageContext doesn't need changing.
async function loadLocale(lang) {
  const bundles = { en, hi, kn }
  const bundle = bundles[lang]
  if (bundle) {
    i18n.addResourceBundle(lang, 'translation', bundle, true, true)
    return bundle
  }
  return null
}

export { loadLocale }
export default i18n
