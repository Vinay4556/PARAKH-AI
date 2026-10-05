import React, { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Search, X, ChevronDown, Globe, RefreshCw } from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { useLanguage, LANG_LABELS } from '../context/LanguageContext.jsx'
import NotificationBell from './NotificationBell.jsx'
import { globalSearch } from '../services/api.js'
import { useNavigate } from 'react-router-dom'

/**
 * Official Government of India style header.
 * Structure:
 *   [tricolour stripe]
 *   [GoI emblem]  [Veritas AI title + ministry]  [lang + theme controls]
 */
export default function TopBar() {
  const { isDark, toggleTheme } = useTheme()
  const { lang, switchLanguage, languages, isTranslating } = useLanguage()
  const navigate = useNavigate()
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const [pendingLang, setPendingLang] = useState(null)
  const searchRef = useRef(null)
  const langDropdownRef = useRef(null)
  const debounceRef = useRef(null)

  // Languages outside en/hi/kn are generated on first use, which takes a few
  // seconds. Close the list immediately but keep the trigger showing progress so
  // the switch never looks like it silently did nothing.
  const handleSelectLanguage = async (code) => {
    setShowLangDropdown(false)
    if (code === lang) return
    setPendingLang(code)
    try {
      await switchLanguage(code)
    } finally {
      setPendingLang(null)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setShowLangDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!searchQ.trim() || searchQ.length < 2) { setSearchResults([]); setShowResults(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      globalSearch(searchQ)
        .then(res => { setSearchResults(res.data?.results || []); setShowResults(true) })
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchQ])

  const handleResultClick = (url) => { navigate(url); setSearchQ(''); setShowResults(false) }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col" style={{ background: 'var(--bg-header)' }}>
      {/* Tricolour stripe */}
      <div className="goi-header-stripe" />

      {/* Main header row */}
      <div
        className="flex items-center px-4 py-2 gap-4"
        style={{ borderBottom: '2px solid var(--goi-saffron)', minHeight: '52px' }}
      >
        {/* GoI Emblem — Ashoka Chakra SVG */}
        <div className="flex-shrink-0">
          <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Government of India Emblem">
            <circle cx="50" cy="50" r="48" fill="#003380" stroke="#FF6600" strokeWidth="3"/>
            {/* Outer ring */}
            <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
            {/* Ashoka Chakra spokes (24 spokes) */}
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 15 * Math.PI) / 180
              const x1 = 50 + 8 * Math.cos(angle)
              const y1 = 50 + 8 * Math.sin(angle)
              const x2 = 50 + 34 * Math.cos(angle)
              const y2 = 50 + 34 * Math.sin(angle)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FF6600" strokeWidth="1.5"/>
            })}
            {/* Hub */}
            <circle cx="50" cy="50" r="7" fill="#FF6600"/>
            <circle cx="50" cy="50" r="4" fill="#003380"/>
            {/* Rim */}
            <circle cx="50" cy="50" r="34" fill="none" stroke="#FF6600" strokeWidth="2.5"/>
          </svg>
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-bold text-white leading-tight" style={{ fontFamily: 'Noto Serif, Georgia, serif', fontSize: '1.1rem' }}>
              Veritas AI
            </span>
            <span className="hidden sm:inline text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>
              Bid Compliance Intelligence Platform
            </span>
          </div>
          <div className="text-xs mt-0.5 hidden sm:block" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>
            Government e-Marketplace · Ministry of Commerce &amp; Industry · SIH 2026
          </div>
        </div>

        {/* Global Search */}
        <div className="relative flex-shrink-0 hidden md:block" ref={searchRef}>
          <div className="flex items-center gap-1 px-3 py-1.5 border border-white/20" style={{ borderRadius: '2px', background: 'rgba(255,255,255,0.08)' }}>
            <Search size={13} className="text-white/60" />
            <input
              type="text"
              placeholder="Search tenders, bidders, contracts…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-52 bg-transparent text-white text-xs placeholder-white/40 focus:outline-none"
            />
            {searchQ && (
              <button onClick={() => { setSearchQ(''); setShowResults(false) }}>
                <X size={12} className="text-white/50 hover:text-white" />
              </button>
            )}
          </div>
          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-1 shadow-2xl z-[200] max-h-80 overflow-y-auto"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '2px' }}>
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400">{searching ? 'Searching…' : 'No results found.'}</div>
              ) : searchResults.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                  onClick={() => handleResultClick(r.url)}>
                  <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase mt-0.5 flex-shrink-0 ${
                    r.type === 'tender' ? 'bg-blue-100 text-blue-700' :
                    r.type === 'bidder' ? 'bg-purple-100 text-purple-700' :
                    r.type === 'bid' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'}`} style={{ borderRadius: '2px' }}>{r.type}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{r.title}</p>
                    <p className="text-[10px] text-gray-400">{r.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Controls: Language + Notifications + Theme */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Language switcher dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              onClick={() => !isTranslating && setShowLangDropdown(!showLangDropdown)}
              disabled={isTranslating}
              title={isTranslating ? 'Preparing language…' : 'Change language'}
              aria-busy={isTranslating}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold transition-colors border border-white/20 rounded-sm disabled:cursor-wait disabled:opacity-80"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {isTranslating ? <RefreshCw size={13} className="animate-spin" /> : <Globe size={13} />}
              <span>
                {isTranslating && pendingLang
                  ? `Loading ${LANG_LABELS[pendingLang]?.label || pendingLang}…`
                  : (LANG_LABELS[lang]?.native || lang)}
              </span>
              {!isTranslating && <ChevronDown size={12} />}
            </button>
            {showLangDropdown && (
              <div
                className="absolute right-0 top-full mt-1 shadow-2xl z-[300] max-h-80 overflow-y-auto min-w-[180px]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '4px' }}
              >
                {languages.map((l) => {
                  const info = LANG_LABELS[l]
                  if (!info) return null
                  return (
                    <button
                      key={l}
                      onClick={() => handleSelectLanguage(l)}
                      disabled={isTranslating}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50"
                      style={{
                        background: lang === l ? 'var(--goi-saffron)' : 'transparent',
                        color: lang === l ? '#ffffff' : 'inherit',
                      }}
                    >
                      <span>{info.flag}</span>
                      <span>{info.native}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-white/20" />

          {/* Notification bell */}
          <NotificationBell />

          {/* Divider */}
          <div className="w-px h-5 bg-white/20" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors rounded-sm border border-white/20"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            {isDark
              ? <Sun size={13} className="text-amber-300" />
              : <Moon size={13} className="text-blue-200" />
            }
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
