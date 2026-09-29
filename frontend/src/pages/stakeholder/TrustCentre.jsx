import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, ChevronRight, Info, AlertTriangle, CheckCircle,
  Lock, Eye, FileText, Users, HelpCircle, ExternalLink,
  ChevronDown, ChevronUp, BookOpen, Scale, Accessibility,
  Database, MessageSquare, Globe
} from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'

// Collapsible accordion section
function AccordionSection({ title, icon: Icon, iconColor = 'text-blue-600', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg bg-gray-50 ${iconColor}`}>
            <Icon size={16} />
          </div>
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 bg-white border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// Numbered step
function Step({ number, title, desc }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

// Info row
function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-40 flex-shrink-0">{label}</span>
      <span className={`text-xs font-medium ${highlight ? 'text-blue-700' : 'text-slate-700'}`}>{value}</span>
    </div>
  )
}

export default function TrustCentre() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500" aria-label="Breadcrumb">
        <span
          className="hover:text-blue-600 cursor-pointer"
          onClick={() => navigate('/public/dashboard')}
        >
          {t('public_portal')}
        </span>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="font-medium text-slate-700">{t('trust_centre')}</span>
      </div>

      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-blue-50">
            <Shield size={22} className="text-blue-700" aria-hidden="true" />
          </div>
          <h1 className="page-title">{t('trust_centre')}</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          {t('trust_centre_subtitle')}
        </p>
      </div>

      {/* Mock / Demo notice — always visible */}
      <div
        className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl"
        role="alert"
        aria-label="Demo mode notice"
      >
        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-amber-800">{t('trust_demo_mode_title')}</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            {t('trust_demo_mode_desc')}
          </p>
        </div>
      </div>

      {/* How procurement decisions work */}
      <AccordionSection
        title={t('trust_how_decisions_title')}
        icon={Scale}
        iconColor="text-blue-600"
        defaultOpen
      >
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {t('trust_how_decisions_intro')}
        </p>
        <div className="space-y-4">
          <Step number="1" title={t('trust_step1_title')} desc={t('trust_step1_desc')} />
          <Step number="2" title={t('trust_step2_title')} desc={t('trust_step2_desc')} />
          <Step number="3" title={t('trust_step3_title')} desc={t('trust_step3_desc')} />
          <Step number="4" title={t('trust_step4_title')} desc={t('trust_step4_desc')} />
          <Step number="5" title={t('trust_step5_title')} desc={t('trust_step5_desc')} />
          <Step number="6" title={t('trust_step6_title')} desc={t('trust_step6_desc')} />
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-800 font-semibold">
            {t('trust_human_decides_note')}
          </p>
        </div>
      </AccordionSection>

      {/* AI limitations */}
      <AccordionSection
        title={t('trust_ai_limits_title')}
        icon={Info}
        iconColor="text-purple-600"
      >
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {t('trust_ai_limits_intro')}
        </p>
        <div className="space-y-3">
          {[
            { label: t('trust_ai_role_label'), value: t('trust_ai_role_value') },
            { label: t('trust_ai_evidence_label'), value: t('trust_ai_evidence_value') },
            { label: t('trust_ai_override_label'), value: t('trust_ai_override_value') },
            { label: t('trust_ai_mock_label'), value: t('trust_ai_mock_value'), highlight: true },
            { label: t('trust_ai_audit_label'), value: t('trust_ai_audit_value') },
          ].map(({ label, value, highlight }) => (
            <InfoRow key={label} label={label} value={value} highlight={highlight} />
          ))}
        </div>

        {/* What AI can and cannot do */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs font-bold text-green-800 mb-2 flex items-center gap-1.5">
              <CheckCircle size={13} aria-hidden="true" /> {t('trust_ai_can_title')}
            </p>
            <ul className="space-y-1.5">
              {[
                t('trust_ai_can_1'),
                t('trust_ai_can_2'),
                t('trust_ai_can_3'),
                t('trust_ai_can_4'),
              ].map((item) => (
                <li key={item} className="text-xs text-green-700 flex items-start gap-1.5">
                  <span className="mt-1 flex-shrink-0">•</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={13} aria-hidden="true" /> {t('trust_ai_cannot_title')}
            </p>
            <ul className="space-y-1.5">
              {[
                t('trust_ai_cannot_1'),
                t('trust_ai_cannot_2'),
                t('trust_ai_cannot_3'),
                t('trust_ai_cannot_4'),
              ].map((item) => (
                <li key={item} className="text-xs text-red-700 flex items-start gap-1.5">
                  <span className="mt-1 flex-shrink-0">•</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AccordionSection>

      {/* Accessibility */}
      <AccordionSection
        title={t('trust_accessibility_title')}
        icon={Accessibility}
        iconColor="text-teal-600"
      >
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {t('trust_accessibility_intro')}
        </p>
        <div className="space-y-3">
          {[
            { label: t('trust_wcag_label'), value: t('trust_wcag_value') },
            { label: t('trust_languages_label'), value: t('trust_languages_value') },
            { label: t('trust_mobile_label'), value: t('trust_mobile_value') },
            { label: t('trust_keyboard_label'), value: t('trust_keyboard_value') },
          ].map(({ label, value }) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </div>
        <div className="mt-4 p-3 bg-teal-50 border border-teal-100 rounded-lg">
          <p className="text-xs text-teal-800 leading-relaxed">
            {t('trust_accessibility_note')}
          </p>
        </div>
      </AccordionSection>

      {/* Open data */}
      <AccordionSection
        title={t('trust_open_data_title')}
        icon={Database}
        iconColor="text-indigo-600"
      >
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {t('trust_open_data_intro')}
        </p>

        {/* Three-column data classification */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          {/* Publish by default */}
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-[10px] font-bold text-green-800 uppercase tracking-wide mb-2">
              {t('trust_data_publish_default')}
            </p>
            <ul className="space-y-1">
              {[
                t('trust_data_pd_1'), t('trust_data_pd_2'),
                t('trust_data_pd_3'), t('trust_data_pd_4'),
              ].map((item) => (
                <li key={item} className="text-[11px] text-green-700 flex items-start gap-1">
                  <CheckCircle size={10} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Publish with policy approval */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide mb-2">
              {t('trust_data_publish_policy')}
            </p>
            <ul className="space-y-1">
              {[
                t('trust_data_pp_1'), t('trust_data_pp_2'), t('trust_data_pp_3'),
              ].map((item) => (
                <li key={item} className="text-[11px] text-amber-700 flex items-start gap-1">
                  <Info size={10} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Never publish */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-[10px] font-bold text-red-800 uppercase tracking-wide mb-2">
              {t('trust_data_never_publish')}
            </p>
            <ul className="space-y-1">
              {[
                t('trust_data_np_1'), t('trust_data_np_2'),
                t('trust_data_np_3'), t('trust_data_np_4'),
              ].map((item) => (
                <li key={item} className="text-[11px] text-red-700 flex items-start gap-1">
                  <Lock size={10} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AccordionSection>

      {/* Grievance route */}
      <AccordionSection
        title={t('trust_grievance_title')}
        icon={MessageSquare}
        iconColor="text-orange-600"
      >
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {t('trust_grievance_intro')}
        </p>
        <div className="space-y-4">
          <Step number="1" title={t('trust_griev_step1_title')} desc={t('trust_griev_step1_desc')} />
          <Step number="2" title={t('trust_griev_step2_title')} desc={t('trust_griev_step2_desc')} />
          <Step number="3" title={t('trust_griev_step3_title')} desc={t('trust_griev_step3_desc')} />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className="btn-primary text-xs"
            onClick={() => navigate('/public/feedback')}
            aria-label="Submit feedback or raise a concern"
          >
            <MessageSquare size={12} aria-hidden="true" /> {t('submit_feedback')}
          </button>
          <button
            className="btn-secondary text-xs"
            onClick={() => navigate('/public/glossary')}
            aria-label="View procurement glossary"
          >
            <BookOpen size={12} aria-hidden="true" /> {t('procurement_glossary')}
          </button>
        </div>
      </AccordionSection>

      {/* Privacy */}
      <AccordionSection
        title={t('trust_privacy_title')}
        icon={Lock}
        iconColor="text-gray-600"
      >
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {t('trust_privacy_intro')}
        </p>
        <div className="space-y-3">
          {[
            { label: t('trust_privacy_collect_label'), value: t('trust_privacy_collect_value') },
            { label: t('trust_privacy_use_label'), value: t('trust_privacy_use_value') },
            { label: t('trust_privacy_share_label'), value: t('trust_privacy_share_value') },
            { label: t('trust_privacy_retain_label'), value: t('trust_privacy_retain_value') },
            { label: t('trust_privacy_rights_label'), value: t('trust_privacy_rights_value') },
          ].map(({ label, value }) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </div>
      </AccordionSection>

      {/* Contact and governance */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Users size={15} className="text-blue-600" aria-hidden="true" /> {t('trust_contact_title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide mb-2">{t('trust_contact_nodal')}</p>
            <p className="text-sm font-semibold text-slate-700">{t('trust_contact_nodal_name')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('trust_contact_nodal_dept')}</p>
            <p className="text-xs text-blue-600 mt-1 font-medium">{t('trust_contact_nodal_email')}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide mb-2">{t('trust_contact_tech')}</p>
            <p className="text-sm font-semibold text-slate-700">{t('trust_contact_tech_name')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('trust_contact_tech_dept')}</p>
            <p className="text-xs text-blue-600 mt-1 font-medium">{t('trust_contact_tech_email')}</p>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <Globe size={14} className="text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-gray-500 leading-relaxed">
          {t('trust_footer_note')}
        </p>
      </div>
    </div>
  )
}
