import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileText, Clock, CheckCircle, Circle, AlertTriangle,
  ChevronRight, Building2, Calendar, MapPin, IndianRupee,
  MessageSquare, ArrowRight, Info, Download, ExternalLink,
  BookOpen, RefreshCw, Bell
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

// ── What Happens Next explanations per stage ──────────────────
const WHAT_NEXT = {
  'Tender Published':               'The tender notice is now publicly available. Eligible vendors can download the tender document, review requirements, and register their interest.',
  'Pre-Bid Meeting':                'A pre-bid meeting is held where prospective bidders can seek clarifications on the tender scope, eligibility, and technical requirements.',
  'Corrigendum / Clarification':    'Any corrections or clarifications to the original tender are published here. Bidders must review all corrigenda before submitting their bid.',
  'Bid Submission Opens':           'The online portal is open for bid submissions. Bidders must upload all required documents and complete the submission before the deadline.',
  'Bid Submission Closed':          'The bid submission window is now closed. All received bids are sealed and stored securely pending the evaluation process.',
  'Scrutiny & Document Verification': 'The procurement team verifies that all submitted documents meet the mandatory eligibility criteria. Incomplete bids are flagged at this stage.',
  'Compliance Evaluation':          'Each bid is evaluated for technical compliance against the tender requirements. AI-assisted analysis supports the procurement officer.',
  'Technical Evaluation':           'Technically qualified bids are assessed in detail by an evaluation committee. Scores are assigned based on the published evaluation criteria.',
  'Financial Evaluation':           'Financial bids of technically qualified vendors are opened. The lowest evaluated price (L1) is determined. Individual bid prices remain confidential until this stage.',
  'Award Decision':                 'The Procurement Officer makes the final award decision, which is permanently recorded with supporting evidence. The officer may accept, reject, or seek further clarification.',
  'Award Published':                'The award order is published on the GeM portal. The successful bidder and the contract value are made publicly available.',
}

const STAGE_STATUS_STYLE = {
  COMPLETED:   { icon: CheckCircle, iconClass: 'text-green-600', border: '#16a34a', label: 'Completed',   labelClass: 'text-green-700' },
  IN_PROGRESS: { icon: Clock,        iconClass: 'text-blue-600',  border: '#2563eb', label: 'In Progress', labelClass: 'text-blue-700'  },
  PENDING:     { icon: Circle,       iconClass: 'text-gray-300',  border: '#e5e7eb', label: 'Pending',     labelClass: 'text-gray-400'  },
}

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:   'bg-green-50 text-green-700 border-green-200',
    OPEN:     'bg-green-50 text-green-700 border-green-200',
    closed:   'bg-gray-100 text-gray-500 border-gray-200',
    awarded:  'bg-blue-50 text-blue-700 border-blue-200',
  }
  return (
    <span
      className={`text-[10px] px-2 py-0.5 border font-bold uppercase tracking-wide rounded ${map[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  )
}

// ── Tab button ────────────────────────────────────────────────
function Tab({ label, active, onClick, count }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-slate-700 hover:border-gray-300'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </button>
  )
}

// ── At a glance key-value ─────────────────────────────────────
function KeyFact({ label, value, icon: Icon, iconClass = 'text-gray-400' }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wide font-semibold">
        <Icon size={11} className={iconClass} aria-hidden="true" />
        {label}
      </div>
      <p className="text-sm font-semibold text-slate-700 leading-snug">{value || '—'}</p>
    </div>
  )
}

export default function PublicTenderDetail() {
  const { tenderId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const [tender,   setTender]   = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!tenderId) return
    setLoading(true)
    Promise.all([
      api.get(`/public/tenders/${tenderId}`),
      api.get(`/public/tenders/${tenderId}/timeline`),
    ])
      .then(([tRes, tlRes]) => {
        setTender(tRes.data)
        setTimeline(tlRes.data)
      })
      .catch(() => setError('Unable to load tender details. Please try again.'))
      .finally(() => setLoading(false))
  }, [tenderId])

  if (loading) return <PageLoader />

  if (error || !tender) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="card p-10 text-center text-gray-400">
          <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">{error || 'Tender not found'}</p>
          <button className="btn-secondary mt-4 text-xs" onClick={() => navigate('/public/tenders')}>
            ← Back to Tenders
          </button>
        </div>
      </div>
    )
  }

  const currentStage  = timeline?.current_stage || '—'
  const timelineItems = timeline?.timeline || []
  const hasDelay      = timelineItems.some((s) => s.delayed)
  const currentItem   = timelineItems.find((s) => s.status === 'IN_PROGRESS') ||
                        timelineItems.filter((s) => s.status === 'COMPLETED').at(-1)

  // Tabs with dynamic counts
  const TABS = [
    { id: 'overview',  label: 'Overview'  },
    { id: 'documents', label: 'Documents', count: tender.requirement_count || 0 },
    { id: 'timeline',  label: 'Timeline'  },
    { id: 'updates',   label: 'Updates'   },
    { id: 'questions', label: 'Questions' },
    { id: 'feedback',  label: 'Feedback'  },
  ]

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-gray-500" aria-label="Breadcrumb">
        <span
          className="hover:text-blue-600 cursor-pointer"
          onClick={() => navigate('/public/dashboard')}
        >
          {t('public_portal')}
        </span>
        <ChevronRight size={12} aria-hidden="true" />
        <span
          className="hover:text-blue-600 cursor-pointer"
          onClick={() => navigate('/public/tenders')}
        >
          {t('browse_tenders')}
        </span>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="font-medium text-slate-700 truncate max-w-xs">{tenderId}</span>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <header className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-mono">
                {tender.id}
              </span>
              <StatusBadge status={tender.status} />
              {hasDelay && (
                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                  <AlertTriangle size={10} aria-hidden="true" /> Delayed
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-800 leading-snug">{tender.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {tender.department} · {tender.location || 'Pan India'}
            </p>
          </div>
          <button
            className="btn-primary text-xs flex-shrink-0"
            onClick={() => setActiveTab('documents')}
            aria-label="View public documents for this tender"
          >
            <FileText size={13} aria-hidden="true" /> View Documents
          </button>
        </div>

        {/* At a glance — 5 key facts with text labels */}
        <div
          className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t border-gray-100"
          aria-label="Key tender facts"
        >
          <KeyFact
            label="Value"
            value={tender.estimated_value_display}
            icon={IndianRupee}
            iconClass="text-green-500"
          />
          <KeyFact
            label="Deadline"
            value={tender.submission_deadline
              ? new Date(tender.submission_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'}
            icon={Calendar}
            iconClass="text-blue-500"
          />
          <KeyFact
            label="Location"
            value={tender.location || 'Pan India'}
            icon={MapPin}
            iconClass="text-red-400"
          />
          <KeyFact
            label="Category"
            value={tender.category || '—'}
            icon={FileText}
            iconClass="text-purple-400"
          />
          <KeyFact
            label="Current Stage"
            value={currentStage}
            icon={Clock}
            iconClass="text-amber-500"
          />
        </div>
      </header>

      {/* Current stage + what happens next banner */}
      {currentItem && (
        <div
          className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3"
          role="status"
          aria-live="polite"
        >
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-xs font-bold text-blue-800">
              Current Stage: {currentItem.stage}
              {currentItem.delayed && (
                <span className="ml-2 text-amber-700">
                  · Delayed by {currentItem.delay_days} day{currentItem.delay_days > 1 ? 's' : ''}
                </span>
              )}
            </p>
            <p className="text-xs text-blue-700 mt-1 leading-relaxed">{currentItem.public_note}</p>
            {WHAT_NEXT[currentItem.stage] && (
              <p className="text-xs text-blue-600 mt-2 font-semibold">
                What happens next:{' '}
                <span className="font-normal">{WHAT_NEXT[currentItem.stage]}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB BAR ──────────────────────────────────────────── */}
      <div
        className="flex gap-0 border-b border-gray-200 overflow-x-auto"
        role="tablist"
        aria-label="Tender detail sections"
      >
        {TABS.map(({ id, label, count }) => (
          <Tab
            key={id}
            label={label}
            active={activeTab === id}
            onClick={() => setActiveTab(id)}
            count={count}
          />
        ))}
      </div>

      {/* ── TAB CONTENT ──────────────────────────────────────── */}

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <section aria-labelledby="tab-overview">
          <h2 id="tab-overview" className="sr-only">Overview</h2>
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wide mb-2">
                About This Tender
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {tender.description || 'No description provided.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Department</p>
                <p className="text-sm font-medium text-slate-700">{tender.department || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Category</p>
                <p className="text-sm font-medium text-slate-700">{tender.category || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Location</p>
                <p className="text-sm font-medium text-slate-700">{tender.location || 'Pan India'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Contact Officer</p>
                <p className="text-sm font-medium text-slate-700">{tender.contact_officer || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Published On</p>
                <p className="text-sm font-medium text-slate-700">
                  {tender.created_at
                    ? new Date(tender.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Bids Received</p>
                <p className="text-sm font-medium text-slate-700">{tender.bid_count ?? '—'}</p>
              </div>
            </div>
          </div>
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-start gap-2">
            <Info size={13} className="text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-gray-500 leading-relaxed">
              This page shows publicly approved information only. Bidder names, bid prices, internal officer notes,
              and evaluation details are not disclosed until the award stage.
              <button
                className="text-blue-600 font-semibold ml-1 hover:underline"
                onClick={() => navigate('/public/trust-centre')}
              >
                Learn more in the Trust Centre.
              </button>
            </p>
          </div>
        </section>
      )}

      {/* DOCUMENTS */}
      {activeTab === 'documents' && (
        <section aria-labelledby="tab-documents">
          <h2 id="tab-documents" className="sr-only">Public Documents</h2>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={16} className="text-blue-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">Public Documents</h3>
            </div>

            {/* Notice about what's published */}
            <div className="p-3 mb-4 bg-green-50 border border-green-100 rounded-lg flex items-start gap-2">
              <CheckCircle size={13} className="text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-green-800">
                Only documents cleared for public release are listed here. Bidder submissions and confidential
                procurement documents are not shown.
              </p>
            </div>

            {/* Tender Notice */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText size={14} className="text-blue-700" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Tender Notice — {tender.id}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Published · PDF · Official Notice</p>
                  </div>
                </div>
                <button
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  aria-label={`Download Tender Notice for ${tender.id}`}
                >
                  <Download size={12} aria-hidden="true" /> Download
                </button>
              </div>

              {/* Requirements summary */}
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <FileText size={14} className="text-purple-700" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Eligibility & Requirements — {tender.requirement_count || 0} criteria
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Published · Summary · Eligibility</p>
                  </div>
                </div>
                <button
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  aria-label="Download eligibility and requirements document"
                >
                  <Download size={12} aria-hidden="true" /> Download
                </button>
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-xs text-amber-800 flex items-start gap-1.5">
                <Info size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                If you believe a document should be publicly available but is missing, use the Feedback tab to
                raise a concern.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* TIMELINE */}
      {activeTab === 'timeline' && (
        <section aria-labelledby="tab-timeline">
          <h2 id="tab-timeline" className="sr-only">Procurement Timeline</h2>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
              <Clock size={16} className="text-blue-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">
                Procurement Timeline
                <span className="text-[10px] text-gray-400 ml-2 font-normal">
                  All dates in IST (UTC+5:30)
                </span>
              </h3>
            </div>

            {hasDelay && (
              <div
                className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2"
                role="alert"
              >
                <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-amber-800">
                  One or more milestones are delayed. The procurement team is reviewing the schedule.
                </p>
              </div>
            )}

            <ol className="relative space-y-0" aria-label="Procurement stages">
              {timelineItems.map((item, idx) => {
                const isLast  = idx === timelineItems.length - 1
                const style   = STAGE_STATUS_STYLE[item.status] || STAGE_STATUS_STYLE.PENDING
                const Icon    = style.icon
                const whatNext = WHAT_NEXT[item.stage]

                return (
                  <li key={idx} className="flex gap-4 relative">
                    {!isLast && (
                      <div className="absolute left-[17px] top-9 bottom-0 w-0.5 bg-gray-100" aria-hidden="true" />
                    )}
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center bg-white relative z-10"
                      style={{ borderColor: style.border }}
                      aria-hidden="true"
                    >
                      <Icon size={17} className={style.iconClass} />
                    </div>
                    <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${item.status === 'PENDING' ? 'text-gray-400' : 'text-slate-700'}`}>
                            {item.stage}
                          </p>
                          <p className={`text-[10px] font-semibold mt-0.5 ${style.labelClass}`}>
                            {style.label}
                            {item.delayed && (
                              <span className="ml-2 text-amber-600">
                                · Delayed {item.delay_days}d
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-gray-400">
                            {item.date
                              ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.public_note}</p>
                      {/* What happens next — shown on current / next stage */}
                      {(item.status === 'IN_PROGRESS' ||
                        (item.status === 'PENDING' && idx > 0 && timelineItems[idx - 1]?.status === 'COMPLETED')
                       ) && whatNext && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                          <p className="text-[10px] text-blue-700 font-semibold">What happens next:</p>
                          <p className="text-[10px] text-blue-600 mt-0.5 leading-relaxed">{whatNext}</p>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>
      )}

      {/* UPDATES */}
      {activeTab === 'updates' && (
        <section aria-labelledby="tab-updates">
          <h2 id="tab-updates" className="sr-only">Updates</h2>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} className="text-blue-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">Official Updates &amp; Notices</h3>
            </div>
            <div className="space-y-3">
              {/* Published notice */}
              <div className="p-3 border-l-4 border-blue-600 bg-blue-50 rounded-r-lg">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-blue-800">Tender Published</p>
                  <p className="text-[10px] text-gray-400">
                    {tender.created_at
                      ? new Date(tender.created_at).toLocaleDateString('en-IN')
                      : '—'}
                  </p>
                </div>
                <p className="text-xs text-blue-700">
                  Tender {tender.id} has been published on the GeM portal and is open for applications.
                </p>
              </div>

              {/* Corrigendum notice if delayed */}
              {hasDelay && (
                <div className="p-3 border-l-4 border-amber-500 bg-amber-50 rounded-r-lg">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs font-bold text-amber-800">Schedule Update</p>
                    <p className="text-[10px] text-gray-400">Recent</p>
                  </div>
                  <p className="text-xs text-amber-700">
                    One or more evaluation stages have been delayed. The procurement office is reviewing the timeline.
                    Check the Timeline tab for details.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center py-4">
                All official updates and corrigenda are published here as they are issued.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* QUESTIONS */}
      {activeTab === 'questions' && (
        <section aria-labelledby="tab-questions">
          <h2 id="tab-questions" className="sr-only">Questions &amp; Answers</h2>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={16} className="text-blue-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">Frequently Asked Questions</h3>
            </div>
            <div className="space-y-3">
              {[
                {
                  q: 'Who can apply for this tender?',
                  a: 'Any registered vendor on the GeM portal meeting the published eligibility criteria may apply. Review the requirements document for details.',
                },
                {
                  q: 'Can I see the bids submitted by other vendors?',
                  a: 'No. Individual bid details, including prices and documents, are confidential and never disclosed publicly before the award stage.',
                },
                {
                  q: 'How are procurement decisions made?',
                  a: 'PARAKH AI assists the Procurement Officer with compliance analysis and risk assessment. The final decision is always made by the authorised Procurement Officer and is permanently recorded.',
                },
                {
                  q: 'What is a corrigendum?',
                  a: 'A corrigendum is an official amendment to the tender document. It may correct errors, change deadlines, or clarify requirements. All corrigenda are published publicly.',
                },
                {
                  q: 'How do I raise a concern or grievance?',
                  a: 'Use the Feedback tab on this page to submit a structured concern. For formal grievances, follow the official GePNIC grievance route listed in the Trust Centre.',
                },
              ].map(({ q, a }, i) => (
                <details key={i} className="border border-gray-200 rounded-lg">
                  <summary className="px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-gray-50 list-none flex items-center justify-between">
                    {q}
                    <ChevronRight size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                  </summary>
                  <div className="px-4 pb-3 pt-1">
                    <p className="text-xs text-gray-600 leading-relaxed">{a}</p>
                  </div>
                </details>
              ))}
            </div>
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-500">
                Have a question not answered here?{' '}
                <button
                  className="text-blue-600 font-semibold hover:underline"
                  onClick={() => setActiveTab('feedback')}
                >
                  Submit feedback
                </button>{' '}
                or visit the{' '}
                <button
                  className="text-blue-600 font-semibold hover:underline"
                  onClick={() => navigate('/public/trust-centre')}
                >
                  Trust Centre
                </button>.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* FEEDBACK */}
      {activeTab === 'feedback' && (
        <section aria-labelledby="tab-feedback">
          <h2 id="tab-feedback" className="sr-only">Submit Feedback</h2>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={16} className="text-purple-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">Submit Feedback</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Submit a structured concern about this tender. Your feedback is reviewed by the Procurement Officer.
              High-priority concerns are escalated. Do not share personal or confidential information.
            </p>
            <button
              className="btn-primary"
              onClick={() => navigate(`/public/tenders/${tenderId}/feedback`)}
              aria-label="Go to feedback submission form"
            >
              <ArrowRight size={14} aria-hidden="true" /> Go to Feedback Form
            </button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 pt-4">
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <button
            className="hover:text-blue-600 hover:underline"
            onClick={() => navigate('/public/trust-centre')}
          >
            Trust Centre
          </button>
          <button
            className="hover:text-blue-600 hover:underline"
            onClick={() => navigate('/public/glossary')}
          >
            Glossary
          </button>
          <button
            className="hover:text-blue-600 hover:underline"
            onClick={() => navigate('/public/feedback')}
          >
            Submit Feedback
          </button>
          <span className="text-gray-300">|</span>
          <span>Last updated: {new Date().toLocaleDateString('en-IN')}</span>
          <span>Data: IST (UTC+5:30)</span>
        </div>
      </footer>
    </div>
  )
}
