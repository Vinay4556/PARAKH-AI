import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import api from '../services/api.js'

const AuthContext = createContext(null)

const TOKEN_KEY = 'auth_token'
const USER_CACHE_KEY = 'veritas_user_cache'  // optimistic cache — not authoritative

// Read the cached user without trusting it for auth decisions
function readUserCache() {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeUserCache(user) {
  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
  } catch {}
}

function clearUserCache() {
  try {
    sessionStorage.removeItem(USER_CACHE_KEY)
  } catch {}
}

export function AuthProvider({ children }) {
  const cachedUser = readUserCache()

  // Initialise user from the session-storage cache so the UI renders
  // immediately (no blank-screen wait), then verify in the background.
  const [user,    setUser]    = useState(cachedUser)
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY))
  // loading is false if we already have a cached user — the verify happens silently
  const [loading, setLoading] = useState(!cachedUser)
  // track whether the background verify has completed
  const verified = useRef(false)

  useEffect(() => {
    if (!token) {
      // No token at all — clear any stale cache and stop
      clearUserCache()
      setUser(null)
      setLoading(false)
      return
    }

    // Ensure the header is set immediately (token was restored from localStorage)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`

    if (verified.current) return   // already verified this session

    // Verify the token against the server in the background
    api.get('/auth/me')
      .then((res) => {
        verified.current = true
        setUser(res.data)
        writeUserCache(res.data)
      })
      .catch(() => {
        // Token is invalid/expired — clear everything
        localStorage.removeItem(TOKEN_KEY)
        delete api.defaults.headers.common['Authorization']
        clearUserCache()
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { token: t, user: u } = res.data
    localStorage.setItem(TOKEN_KEY, t)
    api.defaults.headers.common['Authorization'] = `Bearer ${t}`
    setToken(t)
    setUser(u)
    writeUserCache(u)
    verified.current = true
    return u
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem(TOKEN_KEY)
    delete api.defaults.headers.common['Authorization']
    clearUserCache()
    verified.current = false
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
