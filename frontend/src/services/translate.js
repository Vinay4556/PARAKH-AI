import api from './api'

// Translations are served by our own backend, which proxies to a self-hosted
// LibreTranslate instance and keeps a permanent on-disk cache. Nothing is sent
// to a third-party service and nothing expires.
//
// There is also a small in-memory cache here purely so that re-rendering a
// component does not re-issue a request for strings that are already known.
const translationCache = new Map()
const MAX_MEMORY_ENTRIES = 500

// Keys are strings the app reuses constantly (nav labels, statuses, buttons).
// Sending them one at a time would mean dozens of round-trips per language
// switch, so a page-level batch endpoint is used instead.
const BATCH_THRESHOLD = 10

function remember(cacheKey, translated) {
  if (translationCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = translationCache.keys().next().value
    translationCache.delete(oldest)
  }
  translationCache.set(cacheKey, translated)
}

export async function translateText(text, targetLang, sourceLang = 'en') {
  if (!text || !text.trim()) return text
  if (targetLang === sourceLang) return text

  const cacheKey = `${sourceLang}:${targetLang}:${text}`
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)
  }

  try {
    const { data } = await api.post('/translate', {
      q: text,
      source: sourceLang,
      target: targetLang,
    })
    const translated = data.translatedText || text
    remember(cacheKey, translated)
    return translated
  } catch {
    // Never let a translation failure break a page — fall back to the source text.
    return text
  }
}

export async function translatePage(contentMap, targetLang, sourceLang = 'en') {
  const entries = Object.entries(contentMap)

  if (targetLang === sourceLang) return Object.fromEntries(entries)

  // Serve whatever is already cached without hitting the network.
  const pending = []
  const results = {}

  for (const [key, text] of entries) {
    const cacheKey = `${sourceLang}:${targetLang}:${text}`
    if (translationCache.has(cacheKey)) {
      results[key] = translationCache.get(cacheKey)
    } else {
      pending.push([key, text, cacheKey])
    }
  }

  if (pending.length === 0) return results

  // One batched request when it is worth it, individual requests otherwise.
  if (pending.length >= BATCH_THRESHOLD) {
    try {
      const { data } = await api.post('/translate/batch', {
        q: pending.map(([, text]) => text),
        source: sourceLang,
        target: targetLang,
      })
      const list = data.translatedTexts || []
      pending.forEach(([key, text, cacheKey], i) => {
        const translated = list[i] || text
        results[key] = translated
        remember(cacheKey, translated)
      })
      return results
    } catch {
      // Fall through to the per-string path below.
    }
  }

  const settled = await Promise.all(
    pending.map(async ([key, text, cacheKey]) => {
      const translated = await translateText(text, targetLang, sourceLang)
      remember(cacheKey, translated)
      return [key, translated]
    })
  )

  for (const [key, translated] of settled) {
    results[key] = translated
  }

  return results
}

export function clearTranslationCache() {
  translationCache.clear()
}
