import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Upload, BarChart3,
  ClipboardList, Settings, Shield, Bell, LogOut, ClipboardCheck,
  MessageSquare, Package, Plus, Globe, Scale, ChevronRight, FileBarChart, XCircle
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import api from '../services/api.js'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [alertCount, setAlertCount] = useState(0)

  // Pull real alert count from API on mount
  useEffect(() => {
    api.get('/officer/bids?tender_id=GEM-DEMO-2026-001')
      .then(res => {
        const bids = res.data || []
        const count = bids.filter(b =>
          b.risk_level === 'HIGH' ||
          b.compliance_score < 60 ||
          b.tampering_detected
        ).length
        setAlertCount(count)
      })
      .catch(() => {})
  }, [])

  const navGroups = [
    {
      heading: t('nav_main'),
      items: [
        { to: '/',               label: t('dashboard'),      icon: LayoutDashboard, exact: true },
        { to: '/tenders',        label: t('tenders'),         icon: FileText },
        { to: '/bidders',        label: t('bidders'),         icon: Users },
        { to: '/documents',      label: t('documents'),       icon: Upload },
      ],
    },
    {
      heading: t('nav_procurement'),
      items: [
        { to: '/tasks',          label: t('eval_tasks'),      icon: ClipboardCheck },
        { to: '/contracts',      label: t('contracts'),       icon: Package },
        { to: '/gov-verification', label: t('gov_verify'),   icon: Globe },
        { to: '/bid-comparison', label: t('bid_comparison'),  icon: Scale },
        { to: '/grievances',     label: t('grievances'),      icon: MessageSquare },
      ],
    },
    {
      heading: t('nav_reports'),
      items: [
        { to: '/officer-summary',    label: t('officer_summary'),          icon: FileBarChart },
        { to: '/rejection-feedback', label: t('rejection_feedback_title'), icon: XCircle, badge: null },
        { to: '/reports',            label: t('reports'),                  icon: BarChart3 },
        { to: '/alerts',             label: t('alerts'),                   icon: Bell, badge: alertCount || null },
        { to: '/feedback',           label: t('feedback'),                 icon: MessageSquare },
        { to: '/audit',              label: t('audit_trail'),              icon: ClipboardList },
      ],
    },
  ]

  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <aside
      className="w-56 flex flex-col min-h-screen flex-shrink-0 overflow-y-auto"
      style={{ background: 'var(--bg-sidebar)', color: 'var(--text-sidebar)' }}
    >
      {/* Portal identity strip */}
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'var(--goi-navy-dark, #00205c)' }}
      >
        <div
          className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--goi-saffron)' }}
        >
          <Shield size={15} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-white text-sm leading-tight" style={{ fontFamily: 'Noto Serif, Georgia, serif' }}>
            Veritas AI
          </div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {t('officer_portal')}
          </div>
        </div>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 py-2">
        {navGroups.map((group) => (
          <div key={group.heading} className="mb-1">
            {/* Group heading */}
            <div
              className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}
            >
              {group.heading}
            </div>

            {group.items.map(({ to, label, icon: Icon, exact, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                }
              >
                <Icon size={15} className="flex-shrink-0 opacity-80" />
                <span className="flex-1 text-sm">{label}</span>
                {badge && (
                  <span
                    className="w-4 h-4 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: '#dc2626', borderRadius: '2px' }}
                  >
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        {/* Quick action */}
        <div className="px-3 mx-2 mt-3">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white transition-colors"
            style={{ background: 'var(--goi-saffron)', borderRadius: '2px' }}
            onClick={() => navigate('/tenders/new')}
          >
            <Plus size={13} />
            {t('create_tender')}
          </button>
        </div>

        {/* System links */}
        <div
          className="px-3 pt-3 pb-1 mt-2 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}
        >
          {t('nav_system')}
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
        >
          <Settings size={15} className="flex-shrink-0 opacity-80" />
          <span className="flex-1 text-sm">{t('settings')}</span>
        </NavLink>
        <button onClick={handleLogout} className="sidebar-link sidebar-link-inactive w-full text-left">
          <LogOut size={15} className="flex-shrink-0 opacity-80" />
          <span className="flex-1 text-sm">{t('logout')}</span>
        </button>
      </nav>

      {/* User identity strip */}
      <div
        className="px-3 py-3 flex items-center gap-2.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div
          className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: 'var(--goi-saffron)', borderRadius: '2px' }}
        >
          {user?.name?.[0]?.toUpperCase() || 'O'}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">{user?.name || 'Officer'}</div>
          <div className="text-[9px] truncate uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {t('procurement_officer')}
          </div>
        </div>
      </div>
    </aside>
  )
}
