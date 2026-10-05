/**
 * NotificationBell.jsx — In-app notification center
 * Shown in TopBar. Fetches unread count, shows dropdown panel.
 *
 * Performance notes:
 *  - Polling pauses when the browser tab is hidden (visibilitychange).
 *  - On fetch error the interval backs off exponentially: 30s → 60s → 120s → 240s cap.
 *  - On recovery the interval resets to BASE_INTERVAL.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Bell, AlertTriangle, Info, X } from 'lucide-react'
import { getNotifications, markNotificationsRead } from '../services/api.js'

const BASE_INTERVAL = 30_000    // 30 s normal poll
const MAX_INTERVAL  = 240_000   // 4 min back-off cap

const PRIORITY_ICON = {
  HIGH:   <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />,
  MEDIUM: <Info size={13} className="text-amber-500 flex-shrink-0" />,
  NORMAL: <Info size={13} className="text-blue-500 flex-shrink-0" />,
  LOW:    <Info size={13} className="text-gray-400 flex-shrink-0" />,
}

export default function NotificationBell() {
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [open,   setOpen]   = useState(false)
  const panelRef    = useRef(null)
  const intervalRef = useRef(null)
  const backoffRef  = useRef(BASE_INTERVAL)

  const reschedule = useCallback((interval) => {
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => load(), interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    // Do not fire when the tab is hidden — saves network on background tabs
    if (document.visibilityState === 'hidden') return

    getNotifications()
      .then((res) => {
        setNotifs(res.data?.notifications || [])
        setUnread(res.data?.unread_count  || 0)
        // Successful — reset back-off to normal interval
        backoffRef.current = BASE_INTERVAL
      })
      .catch(() => {
        // Failed — double the interval up to the cap, then reschedule
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_INTERVAL)
        reschedule(backoffRef.current)
      })
  }, [reschedule])

  useEffect(() => {
    // Initial fetch only if tab is currently visible
    if (document.visibilityState !== 'hidden') load()

    // Normal polling interval
    intervalRef.current = setInterval(load, BASE_INTERVAL)

    // Pause/resume based on tab visibility
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Tab came back into view — fetch right away, reset normal interval
        backoffRef.current = BASE_INTERVAL
        load()
        reschedule(BASE_INTERVAL)
      } else {
        // Tab hidden — stop polling entirely
        clearInterval(intervalRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load, reschedule])

  // Close panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (open && panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMarkAllRead = () => {
    markNotificationsRead([]).then(() => load()).catch(() => {})
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 transition-colors hover:bg-white/10"
        style={{ borderRadius: '2px' }}
        aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={16} className="text-white" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center"
            style={{ borderRadius: '50%' }}
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 top-10 w-80 shadow-2xl z-[100] overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '2px' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--border-card)', background: 'var(--goi-navy, #003380)' }}
          >
            <p className="text-sm font-semibold text-white">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button className="text-[10px] text-blue-200 hover:underline" onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close notifications">
                <X size={14} className="text-white/70 hover:text-white" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto" role="list" aria-label="Notification items">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                <Bell size={20} className="mx-auto mb-2 opacity-30" aria-hidden="true" />
                No notifications
              </div>
            ) : (
              notifs.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  role="listitem"
                  className={`flex items-start gap-3 px-4 py-3 border-b transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                  style={{ borderColor: 'var(--border-card)' }}
                >
                  {PRIORITY_ICON[n.priority] || PRIORITY_ICON.NORMAL}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      {n.created_at
                        ? new Date(n.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                        : ''}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 bg-blue-600 flex-shrink-0 mt-1" style={{ borderRadius: '50%' }} aria-label="Unread" />
                  )}
                </div>
              ))
            )}
          </div>

          {notifs.length > 10 && (
            <div className="px-4 py-2 text-center text-[10px] text-gray-400 border-t" style={{ borderColor: 'var(--border-card)' }}>
              {notifs.length - 10} more notifications
            </div>
          )}
        </div>
      )}
    </div>
  )
}
