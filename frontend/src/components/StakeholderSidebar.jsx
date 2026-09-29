import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, MessageSquare, Shield, LogOut, Clock, BookOpen } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function StakeholderSidebar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const navItems = [
    { to: '/public/dashboard',                          label: t('dashboard'),            icon: LayoutDashboard },
    { to: '/public/tenders',                            label: t('browse_tenders'),       icon: FileText },
    { to: '/public/tenders/GEM-DEMO-2026-001/timeline', label: t('procurement_timeline'), icon: Clock },
    { to: '/public/feedback',                           label: t('submit_feedback'),      icon: MessageSquare },
    { to: '/public/trust-centre',                       label: t('trust_centre'),         icon: Shield },
    { to: '/public/glossary',                           label: t('procurement_glossary'), icon: BookOpen },
  ]

  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <aside
      className="w-56 flex flex-col min-h-screen flex-shrink-0 overflow-y-auto"
      style={{ background: '#4a0080', color: 'rgba(255,255,255,0.88)' }}
    >
      {/* Portal identity */}
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', background: '#350060' }}
      >
        <div
          className="w-7 h-7 flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--goi-saffron)', borderRadius: '2px' }}
        >
          <Shield size={14} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-white text-sm leading-tight" style={{ fontFamily: 'Noto Serif, Georgia, serif' }}>
            PARAKH AI
          </div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {t('public_portal')}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        <div className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          Public Menu
        </div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
            }
          >
            <Icon size={14} className="flex-shrink-0 opacity-80" />
            <span className="flex-1 text-sm">{label}</span>
          </NavLink>
        ))}

        <div className="px-3 pt-4 pb-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          Account
        </div>
        <button onClick={handleLogout} className="sidebar-link sidebar-link-inactive w-full text-left">
          <LogOut size={14} className="flex-shrink-0 opacity-80" />
          <span className="flex-1 text-sm">{t('logout')}</span>
        </button>
      </nav>

      {/* User strip */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'var(--goi-saffron)', borderRadius: '2px' }}
          >
            {user?.name?.[0]?.toUpperCase() || 'S'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user?.name || 'Citizen'}</div>
            <div className="text-[9px] truncate uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Public Stakeholder
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
