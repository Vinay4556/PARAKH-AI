import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck, ChevronRight, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, ExternalLink, Globe,
  Clock, Database, ArrowRight, Info, Zap
} from 'lucide-react'
import {
  getVerificationAdapters, verifyBidder, getTenderBidders, getTenders
} from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const ADAPTER_ICONS = {
  GSTN: '🏛',
  UDYAM: '🏭',
  MCA21: '📋',
  EPFO: '👥',
  ESIC: '🏥',
  DIGILOCKER: '📱',
  BLACKLIST: '⛔',
  STARTUP_INDIA: '🚀',
}

function AdapterCard({ name, meta, isConfigured }) {
  const avail = meta.live_available
    ? { label: isConfigured ? 'Live' : 'Live (key not set)', color: isConfigured ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50' }
    : { label: 'Format validation only', color: 'text-gray-600 bg-gray-50' }
  return (
    <div className={`card p-4 ${isConfigured ? 'border-l-4 border-l-green-400' : 'border-l-4 border-l-gray-200 opacity-75'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{ADAPTER_ICONS[name] || '🔗'}</span>
          <div>
            <p className="text-sm font-bold text-slate-800">{meta.name}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${avail.color}`}>{avail.label}</span>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {isConfigured ? '✓ Active' : '○ Mock'}
        </span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{meta.api}</p>
      {!isConfigured && meta.key_env && (
        <p className="text-[10px] text-amber-600 mt-1">Set <code className="bg-amber-50 px-1 rounded">{meta.key_env}</code> in backend/.env to activate.</p>
      )}
      {meta.signup_url && (
        <a href={meta.signup_url} target="_blank" rel="noreferrer"
          className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 mt-2">
          <ExternalLink size={9} /> {meta.signup_url}
        </a>
      )}
    </div>
  )
}

// Statuses that mean "could not verify yet" — not a failure, not a pass
const PENDING_STATUSES = new Set([
  'FORMAT_VALID_ONLY', 'FORMAT_VALID', 'STRUCTURALLY_VALID',
  'NOT_SUBMITTED', 'PENDING_USER_AUTH',
])

function VerificationResultCard({ result }) {
  const ok      = result.verified
  const pending = !ok && (PENDING_STATUSES.has(result.status) || result.mode === 'OFFLINE') && (!result.mismatch_flags || result.mismatch_flags.length === 0)
  const failed  = !ok && !pending

  const cardCls = ok
    ? 'bg-green-50 border-green-100'
    : pending
    ? 'bg-amber-50 border-amber-200'
    : 'bg-red-50 border-red-100'

  const statusCls = ok ? 'text-green-700' : pending ? 'text-amber-700' : 'text-red-700'

  const icon = ok
    ? <CheckCircle size={14} className="text-green-600" />
    : pending
    ? <Clock size={14} className="text-amber-500" />
    : <XCircle size={14} className="text-red-600" />

  return (
    <div className={`p-3 rounded-xl border ${cardCls}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm">{ADAPTER_ICONS[result.adapter] || '🔗'}</span>
          <span className="text-xs font-bold text-slate-700">{result.adapter}</span>
        </div>
        {icon}
      </div>
      {result.entity_name && (
        <p className="text-[11px] text-slate-700 font-medium">{result.entity_name}</p>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className={`text-[10px] font-bold ${statusCls}`}>{result.status}</span>
        <span className="text-[10px] text-gray-400">{Math.round((result.confidence || 0) * 100)}% confidence</span>
      </div>
      {result.mismatch_flags && result.mismatch_flags.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {result.mismatch_flags.map((flag, i) => (
            <p key={i} className="text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded">⚠ {flag}</p>
          ))}
        </div>
      )}
      {pending && result.notes && (
        <p className="text-[10px] text-amber-700 mt-1.5 leading-snug italic">{result.notes}</p>
      )}
      <p className="text-[10px] text-gray-400 mt-1.5">{result.source} · {result.mode}</p>
    </div>
  )
}

export default function GovVerification() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [adapters, setAdapters] = useState(null)
  const [bidders, setBidders] = useState([])
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState({})
  // Show error state when a verify call fails, keyed by bidder ID
  const [verifyErrors, setVerifyErrors] = useState({})

  useEffect(() => {
    Promise.all([
      getVerificationAdapters(),
      // Fetch ALL tenders and collect bidders from each, so newly registered
      // bidders under any tender show up — not just the hardcoded demo tender.
      getTenders(),
    ]).then(async ([aRes, tRes]) => {
      setAdapters(aRes.data)
      const tenders = tRes.data || []
      if (tenders.length === 0) {
        // Fallback: try the demo tender directly
        const bRes = await getTenderBidders('GEM-DEMO-2026-001')
        setBidders(bRes.data || [])
        return
      }
      // Collect bidders across all tenders (deduplicated by bidder ID)
      const allBidders = []
      const seen = new Set()
      for (const t of tenders) {
        try {
          const bRes = await getTenderBidders(t.id)
          for (const b of (bRes.data || [])) {
            if (!seen.has(b.id)) {
              seen.add(b.id)
              allBidders.push({ ...b, _tender_id: t.id, _tender_title: t.title })
            }
          }
        } catch { /* skip tenders that fail */ }
      }
      setBidders(allBidders)
    }).catch(() => showToast('Failed to load verification data', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const handleVerify = async (bidderId) => {
    setVerifying((p) => ({ ...p, [bidderId]: true }))
    setVerifyErrors((p) => ({ ...p, [bidderId]: null }))
    try {
      const res = await verifyBidder(bidderId)
      setResults((p) => ({ ...p, [bidderId]: res.data }))
      const status = res.data.overall_status
      showToast(
        status === 'CLEAR'
          ? `${bidderId}: All checks passed ✓`
          : `${bidderId}: Issues detected — review results`,
        status === 'CLEAR' ? 'success' : 'warning'
      )
    } catch (err) {
      const msg = err?.message || 'Verification request failed'
      setVerifyErrors((p) => ({ ...p, [bidderId]: msg }))
      showToast(`Verification failed for ${bidderId}: ${msg}`, 'error')
    } finally {
      setVerifying((p) => ({ ...p, [bidderId]: false }))
    }
  }

  const handleVerifyAll = async () => {
    for (const b of bidders) {
      await handleVerify(b.id)
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Government Verification</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Government API Verification</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cross-verify bidder data against authorized government sources
          </p>
        </div>
        <button className="btn-primary" onClick={handleVerifyAll} disabled={bidders.length === 0}>
          <ShieldCheck size={14} /> Verify All Bidders
        </button>
      </div>

      {/* Adapter Mode Banner */}
      {adapters && (
        adapters.mode === 'LIVE' ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
            <Zap size={15} className="text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-green-800">
                🟢 Running in <strong>LIVE</strong> mode — real government API calls active
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {Object.entries(adapters.adapters || {}).map(([label, meta]) => {
                  const live = adapters.configured?.includes(label)
                  return (
                    <span key={label} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                      live
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {live ? '● ' : '○ '}{label}
                      <span className="font-normal opacity-70 ml-1">— {meta.api}</span>
                    </span>
                  )
                })}
              </div>
              <p className="text-[10px] text-green-700 mt-1.5 opacity-80">
                "●" adapters have a key configured and hit the real government/GSP source. "○" adapters fall back to format validation or mock data — a check against them is not a confirmed government verification.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-800">
                Running in <strong>MOCK</strong> mode — results are from realistic demo adapters.
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Set <code className="bg-amber-100 px-1 rounded">GOV_ADAPTER_MODE=LIVE</code> in backend/.env to enable real government API calls.
              </p>
            </div>
          </div>
        )
      )}

      {/* Adapter Grid */}
      {adapters && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Globe size={14} className="text-blue-600" /> Configured Adapters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(adapters.adapters || {}).map(([name, meta]) => (
              <AdapterCard
                key={name}
                name={name}
                meta={meta}
                isConfigured={adapters.configured?.includes(name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bidder Verification Panel */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Database size={14} className="text-blue-600" /> Bidder Verification
        </h2>

        {bidders.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <ShieldCheck size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No bidders found for the active tender.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bidders.map((bidder) => {
              const result = results[bidder.id]
              const isVerifying = verifying[bidder.id]
              const verifyError = verifyErrors[bidder.id]
              const displayName = bidder.name || bidder.id
              return (
                <div key={bidder.id} className="card p-5">
                  {/* Bidder header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{displayName}</h3>
                        {!bidder.name && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded font-semibold">
                            Registration pending
                          </span>
                        )}
                        {result && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            result.overall_status === 'CLEAR'
                              ? 'bg-green-100 text-green-700'
                              : result.overall_status === 'PENDING'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {result.overall_status === 'CLEAR'
                              ? '✓ Clear'
                              : result.overall_status === 'PENDING'
                              ? '⏳ Pending Live Check'
                              : '⚠ Issues Found'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-500 font-mono">{bidder.gstin || '—'}</span>
                        <span className="text-xs text-gray-500 font-mono">{bidder.pan || '—'}</span>
                        {bidder._tender_id && (
                          <span className="text-[10px] text-blue-500">{bidder._tender_id}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => handleVerify(bidder.id)}
                      disabled={isVerifying}
                    >
                      {isVerifying
                        ? <><RefreshCw size={12} className="animate-spin" /> Verifying…</>
                        : <><ShieldCheck size={12} /> Verify</>
                      }
                    </button>
                  </div>

                  {/* Results / Error / Placeholder */}
                  {verifyError ? (
                    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700">
                      <XCircle size={15} className="flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold">Verification failed</p>
                        <p className="text-[11px] mt-0.5 text-red-600">{verifyError}</p>
                      </div>
                    </div>
                  ) : result ? (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                        {[
                          {
                            label: 'Checks Passed',
                            value: `${result.verified_count}/${result.total_checks}`,
                            color: result.verified_count === result.total_checks
                              ? 'text-green-600'
                              : result.mismatches_detected > 0
                              ? 'text-red-600'
                              : 'text-amber-600',
                          },
                          {
                            label: 'Mismatches',
                            value: result.mismatches_detected,
                            color: result.mismatches_detected > 0 ? 'text-red-600' : 'text-green-600',
                          },
                          {
                            label: 'Status',
                            value: result.overall_status,
                            color: result.overall_status === 'CLEAR'
                              ? 'text-green-600'
                              : result.overall_status === 'PENDING'
                              ? 'text-amber-600'
                              : 'text-red-600',
                          },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-gray-50 rounded-lg p-2">
                            <p className={`text-sm font-bold ${color}`}>{value}</p>
                            <p className="text-[10px] text-gray-400">{label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Pending live check notice */}
                      {result.pending_count > 0 && result.overall_status === 'PENDING' && (
                        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                          <Clock size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-800">
                              {result.pending_count} check{result.pending_count > 1 ? 's' : ''} pending live verification
                            </p>
                            <p className="text-[10px] text-amber-700 mt-0.5">
                              {result.note || 'Set APISATHI_API_KEY in backend/.env to enable real-time ITD PAN verification.'}
                            </p>
                          </div>
                        </div>
                      )}

                      {result.mismatch_details && result.mismatch_details.length > 0 && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl space-y-1">
                          <p className="text-xs font-semibold text-red-700 mb-1">Mismatches Detected:</p>
                          {result.mismatch_details.map((m, i) => (
                            <p key={i} className="text-xs text-red-700">⚠ {m}</p>
                          ))}
                        </div>
                      )}

                      {result.results && result.results.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {result.results.map((r, i) => (
                            <VerificationResultCard key={i} result={r} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700">
                          <AlertTriangle size={14} />
                          <span className="text-xs">No verifiable identifiers found — bidder has not submitted GSTIN, PAN, or CIN.</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock size={9} /> Verified {new Date(result.verified_at).toLocaleString('en-IN')}
                        </span>
                        <button
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          onClick={() => navigate(`/vendor-profiles/${bidder.id}`)}
                        >
                          View Vendor 360° <ArrowRight size={11} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-gray-400">
                      <Info size={14} />
                      <span className="text-xs">Click "Verify" to run government source verification for this bidder.</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
