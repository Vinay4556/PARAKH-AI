import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { loadLocale } from '../i18n/i18n.js'

const LanguageContext = createContext(null)

const SUPPORTED_LANGS = ['en', 'hi', 'kn']

export function LanguageProvider({ children }) {
  const { t: i18nT, i18n: i18nInstance } = useTranslation()
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('veritas_lang')
    return SUPPORTED_LANGS.includes(saved) ? saved : 'en'
  })
  const [isTranslating, setIsTranslating] = useState(false)

  useEffect(() => {
    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang)
    }
    document.documentElement.setAttribute('lang', lang)
  }, [lang, i18nInstance])

  const switchLanguage = useCallback(async (newLang) => {
    if (!newLang || !SUPPORTED_LANGS.includes(newLang)) return
    if (newLang === lang) return

    setIsTranslating(true)
    try {
      const bundle = await loadLocale(newLang)
      if (bundle) {
        setLang(newLang)
        localStorage.setItem('veritas_lang', newLang)
        i18nInstance.changeLanguage(newLang)
        document.documentElement.setAttribute('lang', newLang)
      }
    } finally {
      setIsTranslating(false)
    }
  }, [i18nInstance, lang])

  const t = useCallback((key) => i18nT(key) || key, [i18nT])

  return (
    <LanguageContext.Provider value={{ lang, switchLanguage, t, isTranslating, languages: SUPPORTED_LANGS }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export const LANG_LABELS = {
  en: { label: 'English', native: 'English', flag: '🇬🇧' },
  hi: { label: 'Hindi',   native: 'हिंदी',  flag: '🇮🇳' },
  kn: { label: 'Kannada', native: 'ಕನ್ನಡ',  flag: '🇮🇳' },
}
