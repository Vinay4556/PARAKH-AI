import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Package, Upload,
  MessageSquare, Shield, LogOut, CheckSquare, UserPlus
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function BidderSidebar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const navGroups = [
    {
      heading: t('nav_bidder_menu'),
      items: [
        { to: '/bidder/dashboard',      label: t('dashboard'),       icon: LayoutDashboard },
        { to: '/bidder/tenders',        label: t('browse_tenders'),  icon: FileText },
        { to: '/bidder/bids',           label: t('my_bids'),         icon: Package },
        { to: '/bidder/readiness',      label: t('bid_readiness'),   icon: CheckSquare },
        { to: '/bidder/documents',      label: t('documents'),       icon: Upload },
        { to: '/bidder/clarifications', label: t('clarifications'),  icon: MessageSquare },
        { to: '/bidder/grievances',     label: t('grievances'),      icon: MessageSquare },
      ],
    },
    {
      heading: t('nav_registration'),
      items: [
        { to: '/bidder/register', label: t('register_bidder'), icon: UserPlus },
      ],
    },
  ]

  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <aside
      className="w-56 flex flex-col min-h-screen flex-shrink-0 overflow-y-auto"
      style={{ background: '#006633', color: 'rgba(255,255,255,0.88)' }}
    >
      {/* Portal identity */}
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', background: '#004d26' }}
      >
        <div
          className="w-7 h-7 flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--goi-saffron)', borderRadius: '2px' }}
        >
          <Shield size={14} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-white text-sm leading-tight" style={{ fontFamily: 'Noto Serif, Georgia, serif' }}>
            Veritas AI
          </div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {t('bidder_portal')}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {navGroups.map((group) => (
          <div key={group.heading} className="mb-1">
            <div
              className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              {group.heading}
            </div>
            {group.items.map(({ to, label, icon: Icon }) => (
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
          </div>
        ))}

        <div className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          {t('nav_account')}
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
            {user?.name?.[0]?.toUpperCase() || 'B'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user?.name || 'Bidder'}</div>
            <div className="text-[9px] truncate uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {user?.organization_name || t('bidder_portal')}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
