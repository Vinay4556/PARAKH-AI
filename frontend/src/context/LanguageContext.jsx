import React, { createContext, useContext, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { loadLocale } from '../i18n/i18n.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const { t: i18nT, i18n: i18nInstance } = useTranslation()
  const [lang, setLang] = useState(() => localStorage.getItem('parakh_lang') || 'en')

  // Sync i18next when language changes
  useEffect(() => {
    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang)
    }
  }, [lang, i18nInstance])

  const switchLanguage = async (newLang) => {
    if (!['en', 'hi', 'kn'].includes(newLang)) return
    // Ensure the locale bundle is loaded before switching —
    // loadLocale is a no-op for 'en' and for already-loaded bundles.
    await loadLocale(newLang)
    setLang(newLang)
    localStorage.setItem('parakh_lang', newLang)
    i18nInstance.changeLanguage(newLang)
    document.documentElement.setAttribute('lang', newLang)
  }

  // Backward-compatible flat t() API — preserves all existing t('key') calls
  const t = (key) => i18nT(key) || key

  return (
    <LanguageContext.Provider value={{ lang, switchLanguage, t, languages: ['en', 'hi', 'kn'] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export const LANG_LABELS = {
  en: { label: 'English', native: 'English',  flag: '🇬🇧' },
  hi: { label: 'Hindi',   native: 'हिंदी',   flag: '🇮🇳' },
  kn: { label: 'Kannada', native: 'ಕನ್ನಡ', flag: '🇮🇳' },
}
