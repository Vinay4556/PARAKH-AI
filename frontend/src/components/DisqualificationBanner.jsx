/**
 * DisqualificationBanner
 *
 * Shows a prominent read-only rejection record whenever a bidder has been
 * formally disqualified. Displayed on BidderDetail and CompliancePage.
 *
 * Props:
 *   bidder – bidder object from GET /api/bidders/:id
 *            Expected fields: officer_decision, rejection_stage,
 *            rejection_category, rejection_reason, officer_remarks,
 *            decision_officer, decision_timestamp
 */
import React, { useState } from 'react'
import { XCircle, Shield, ChevronDown, ChevronUp, User, Calendar, Tag, Layers, FileText } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function DisqualificationBanner({ bidder }) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  if (!bidder || bidder.officer_decision !== 'DISQUALIFY') return null

  const ts = bidder.decision_timestamp
    ? new Date(bidder.decision_timestamp).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

  return (
    <div
      className="border-2 border-red-500 bg-red-50"
      style={{ borderRadius: '2px' }}
      role="alert"
      aria-label={t('disqualification_record')}
    >
      {/* Header row — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-red-600 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-8 h-8 bg-white/20 flex items-center justify-center flex-shrink-0" style={{ borderRadius: '2px' }}>
          <XCircle size={16} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-white uppercase tracking-wide">
            {t('bidder_disqualified')}
          </p>
          <p className="text-[10px] text-red-100 mt-0.5">
            {bidder.rejection_category || t('reason_recorded')} · {ts}
          </p>
        </div>
        <div className="flex items-center gap-2 text-red-100 text-[10px]">
          <Shield size={11} />
          <span className="hidden sm:inline">{t('audit_recorded')}</span>
          {expanded
            ? <ChevronUp size={14} className="text-white" />
            : <ChevronDown size={14} className="text-white" />}
        </div>
      </div>

      {/* Expandable detail body */}
      {expanded && (
        <div className="px-4 py-4 space-y-3">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { icon: Layers,   label: t('rejection_stage_label'),  value: bidder.rejection_stage },
              { icon: Tag,      label: t('reason_category'),         value: bidder.rejection_category },
              { icon: User,     label: t('decision_officer'),        value: bidder.decision_officer },
              { icon: Calendar, label: t('decision_date_time'),      value: ts },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2 p-2 bg-red-100/50 border border-red-200" style={{ borderRadius: '2px' }}>
                <Icon size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] uppercase font-semibold text-red-500 tracking-wide">{label}</p>
                  <p className="text-red-900 font-semibold mt-0.5 leading-snug break-words">{value || '—'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed justification */}
          {bidder.rejection_reason && (
            <div>
              <p className="text-[10px] uppercase font-bold text-red-600 tracking-wide mb-1.5 flex items-center gap-1">
                <FileText size={10} /> {t('detailed_justification')}
              </p>
              <div className="bg-white border border-red-300 px-3 py-2.5" style={{ borderRadius: '2px' }}>
                <p className="text-xs text-red-900 leading-relaxed">"{bidder.rejection_reason}"</p>
              </div>
            </div>
          )}

          {/* Optional remarks */}
          {bidder.officer_remarks && (
            <div>
              <p className="text-[10px] uppercase font-bold text-red-500 tracking-wide mb-1 flex items-center gap-1">
                <User size={10} /> {t('officer_remarks')}
              </p>
              <p className="text-xs text-red-800 leading-relaxed px-1">{bidder.officer_remarks}</p>
            </div>
          )}

          {/* Immutability note */}
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 text-[10px] text-amber-800" style={{ borderRadius: '2px' }}>
            <Shield size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <span>{t('rejection_immutable_note')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
