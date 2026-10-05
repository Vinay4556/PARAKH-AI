/**
 * RejectionReasonModal
 *
 * Shown whenever a Procurement Officer selects "Disqualify Bidder".
 * The officer MUST fill in:
 *   • Rejection / Disqualification Stage   (required)
 *   • Reason Category                      (required, 8 options)
 *   • Detailed Justification               (required, min 20 chars)
 *   • Additional Remarks                   (optional)
 *
 * The modal collects the data, validates it client-side, then calls
 * onConfirm(payload) so the parent can POST to /api/bidders/:id/decision.
 * It never talks to the API directly — keeping network concerns in the parent.
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  XCircle, AlertTriangle, Shield, CheckCircle,
  ChevronDown, FileText, User, Calendar, Tag, Layers, X,
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

export const REJECTION_CATEGORIES = [
  'Eligibility Criteria Not Met',
  'Required Documents Missing',
  'Technical Requirements Not Met',
  'Financial Evaluation',
  'Non-Compliance with Tender Conditions',
  'Late Submission',
  'Invalid/Incomplete Information',
  'Other',
]

export const REJECTION_STAGES = [
  'Initial Scrutiny',
  'Technical Evaluation',
  'Financial Evaluation',
  'Document Verification',
  'Pre-Bid Stage',
  'Post-Bid Review',
  'Final Evaluation',
]

const MIN_REASON_LENGTH = 20

// ── Helper: character counter colour ─────────────────────────────────────────
function charCountClass(len, min) {
  if (len === 0) return 'text-gray-400'
  if (len < min) return 'text-red-500'
  if (len < min + 30) return 'text-amber-500'
  return 'text-green-600'
}

// ── Example statement (shown collapsed by default) ───────────────────────────
const EXAMPLE_STATEMENT =
  'The bidder has been disqualified because the submitted technical proposal does not meet the minimum technical specifications specified in the tender document. The required equipment specification was not provided, and therefore the bidder did not satisfy the mandatory technical eligibility criteria.'

// ── Main Component ────────────────────────────────────────────────────────────
export default function RejectionReasonModal({
  bidder,          // { id, name, tender_id }
  tenderId,
  officer,         // officer display name
  officerId,
  onConfirm,       // (payload) => void  — called when form is valid & submitted
  onCancel,        // () => void
}) {
  const { t } = useLanguage()
  const modalRef = useRef(null)

  const [stage, setStage]       = useState('')
  const [category, setCategory] = useState('')
  const [reason, setReason]     = useState('')
  const [remarks, setRemarks]   = useState('')
  const [showExample, setShowExample] = useState(false)
  const [errors, setErrors]     = useState({})
  const [showConfirm, setShowConfirm] = useState(false)

  // Trap focus inside the modal
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length) focusable[0].focus()

    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  // ── Validation ───────────────────────────────────────────────────────────
  function validate() {
    const errs = {}
    if (!stage)    errs.stage    = t('rejection_stage_required')
    if (!category) errs.category = t('rejection_category_required')
    if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
      errs.reason = t('rejection_reason_min', { min: MIN_REASON_LENGTH })
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmitClick() {
    if (!validate()) return
    setShowConfirm(true)
  }

  function handleFinalConfirm() {
    setShowConfirm(false)
    onConfirm({
      decision:           'DISQUALIFY',
      rejection_stage:    stage,
      rejection_category: category,
      rejection_reason:   reason.trim(),
      remarks:            remarks.trim(),
      officer,
      officer_id:         officerId,
    })
  }

  const isValid = stage && category && reason.trim().length >= MIN_REASON_LENGTH

  // ── Inner confirm dialog ─────────────────────────────────────────────────
  if (showConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div
          className="bg-white w-full max-w-lg shadow-2xl overflow-hidden"
          style={{ borderRadius: '4px' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-rejection-title"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-red-600">
            <div className="w-9 h-9 bg-white/20 flex items-center justify-center flex-shrink-0" style={{ borderRadius: '2px' }}>
              <XCircle size={18} className="text-white" />
            </div>
            <div>
              <h2 id="confirm-rejection-title" className="text-sm font-bold text-white uppercase tracking-wide">
                {t('confirm_disqualification')}
              </h2>
              <p className="text-xs text-red-100">{t('action_permanent_audit')}</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3">
            {/* Summary table */}
            <div className="border border-gray-200 divide-y divide-gray-100 text-xs" style={{ borderRadius: '2px' }}>
              {[
                { label: t('bidder'),         value: bidder?.name },
                { label: t('tender_id_label'), value: tenderId },
                { label: t('rejection_stage_label'), value: stage },
                { label: t('reason_category'),        value: category },
                { label: t('officer_label'),          value: officer },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3 px-3 py-2">
                  <span className="w-36 flex-shrink-0 text-gray-500 font-medium">{label}</span>
                  <span className="text-slate-700 font-semibold">{value}</span>
                </div>
              ))}
            </div>

            {/* Reason preview */}
            <div>
              <p className="text-[10px] uppercase font-semibold text-gray-500 tracking-wide mb-1">
                {t('detailed_justification')}
              </p>
              <div className="bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-900 leading-relaxed" style={{ borderRadius: '2px' }}>
                "{reason.trim()}"
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800" style={{ borderRadius: '2px' }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
              <span>{t('rejection_permanent_warning')}</span>
            </div>
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button
              className="btn-secondary flex-1 justify-center"
              onClick={() => setShowConfirm(false)}
            >
              {t('back')}
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
              style={{ borderRadius: '2px' }}
              onClick={handleFinalConfirm}
            >
              <XCircle size={15} />
              {t('confirm_disqualify_btn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ borderRadius: '4px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rejection-modal-title"
      >
        {/* ── Modal Header ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-600 flex-shrink-0">
          <div className="w-9 h-9 bg-white/20 flex items-center justify-center flex-shrink-0" style={{ borderRadius: '2px' }}>
            <XCircle size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 id="rejection-modal-title" className="text-sm font-bold text-white uppercase tracking-wide">
              {t('disqualify_bidder_title')}
            </h2>
            <p className="text-xs text-red-100 mt-0.5">{bidder?.name}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 bg-white/10 hover:bg-white/20 transition-colors text-white"
            style={{ borderRadius: '2px' }}
            aria-label={t('close')}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Mandatory fields notice */}
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-xs text-red-800" style={{ borderRadius: '2px' }}>
            <Shield size={13} className="flex-shrink-0 mt-0.5 text-red-600" />
            <span>{t('rejection_mandatory_notice')}</span>
          </div>

          {/* Context: who / what */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { icon: FileText, label: t('tender_id_label'),  value: tenderId },
              { icon: User,     label: t('bidder'),           value: bidder?.name },
              { icon: Tag,      label: t('bidder_id_label'),  value: bidder?.id },
              { icon: Calendar, label: t('date_time_label'),  value: new Date().toLocaleString('en-IN') },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-100" style={{ borderRadius: '2px' }}>
                <Icon size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                  <p className="text-slate-700 font-semibold mt-0.5 truncate">{value || '—'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Field 1: Stage ─────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              <Layers size={11} className="inline mr-1 text-gray-400" />
              {t('rejection_stage_label')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={stage}
                onChange={(e) => { setStage(e.target.value); setErrors((p) => ({ ...p, stage: '' })) }}
                className={`w-full px-3 py-2.5 text-sm border appearance-none focus:outline-none focus:ring-2 focus:ring-red-400 ${errors.stage ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                style={{ borderRadius: '2px' }}
              >
                <option value="">{t('select_stage_placeholder')}</option>
                {REJECTION_STAGES.map((s) => (
                  <option key={s} value={s}>{t(`rejection_stage_${s.toLowerCase().replace(/[\s/]+/g, '_')}`) || s}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {errors.stage && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.stage}
              </p>
            )}
          </div>

          {/* ── Field 2: Category ──────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              <Tag size={11} className="inline mr-1 text-gray-400" />
              {t('reason_category')} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REJECTION_CATEGORIES.map((cat) => {
                const selected = category === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { setCategory(cat); setErrors((p) => ({ ...p, category: '' })) }}
                    className={`text-left text-xs px-3 py-2.5 border transition-all leading-snug ${
                      selected
                        ? 'border-red-500 bg-red-50 text-red-800 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-slate-600'
                    }`}
                    style={{ borderRadius: '2px' }}
                  >
                    {selected && <CheckCircle size={11} className="inline mr-1.5 text-red-500 flex-shrink-0" />}
                    {t(`rejection_cat_${cat.toLowerCase().replace(/[\s/()]+/g, '_')}`) || cat}
                  </button>
                )
              })}
            </div>
            {errors.category && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.category}
              </p>
            )}
          </div>

          {/* ── Field 3: Detailed Justification ───────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                {t('detailed_justification')} <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                className="text-[10px] text-blue-600 hover:underline"
                onClick={() => setShowExample((v) => !v)}
              >
                {showExample ? t('hide_example') : t('show_example')}
              </button>
            </div>

            {showExample && (
              <div className="mb-2 p-3 bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed italic" style={{ borderRadius: '2px' }}>
                <p className="text-[10px] uppercase font-bold text-blue-600 not-italic mb-1">{t('example_statement')}</p>
                "{EXAMPLE_STATEMENT}"
                <button
                  type="button"
                  className="block mt-2 text-[10px] text-blue-600 hover:underline not-italic font-semibold"
                  onClick={() => { setReason(EXAMPLE_STATEMENT); setShowExample(false) }}
                >
                  {t('use_as_template')}
                </button>
              </div>
            )}

            <textarea
              rows={5}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setErrors((p) => ({ ...p, reason: '' })) }}
              placeholder={t('rejection_reason_placeholder')}
              className={`w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-red-400 resize-none ${
                errors.reason ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
              style={{ borderRadius: '2px' }}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.reason ? (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle size={11} /> {errors.reason}
                </p>
              ) : (
                <span />
              )}
              <span className={`text-[10px] font-mono ${charCountClass(reason.trim().length, MIN_REASON_LENGTH)}`}>
                {reason.trim().length}/{MIN_REASON_LENGTH}+ {t('chars')}
              </span>
            </div>
          </div>

          {/* ── Field 4: Additional Remarks (optional) ─────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('officer_remarks')}{' '}
              <span className="font-normal text-gray-400">({t('optional')})</span>
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t('rejection_remarks_placeholder')}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              style={{ borderRadius: '2px' }}
            />
          </div>

          {/* Officer identity strip */}
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600" style={{ borderRadius: '2px' }}>
            <User size={12} className="text-gray-400 flex-shrink-0" />
            <span>{t('submitting_as')}: <strong>{officer}</strong></span>
            <span className="ml-auto text-gray-400">{new Date().toLocaleDateString('en-IN')}</span>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button className="btn-secondary flex-1 justify-center" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmitClick}
            disabled={!isValid}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white transition-colors ${
              isValid
                ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                : 'bg-gray-300 cursor-not-allowed'
            }`}
            style={{ borderRadius: '2px' }}
          >
            <XCircle size={15} />
            {t('review_and_disqualify')}
          </button>
        </div>
      </div>
    </div>
  )
}
