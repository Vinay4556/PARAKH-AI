/**
 * EvalCommittee.jsx — Technical Evaluation Committee
 * Officer forms committee, evaluators submit individual scores,
 * system computes aggregate (Average/Min/Max).
 * All scores are immutable once submitted.
 */
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Users, Plus, RefreshCw, CheckCircle,
  AlertTriangle, BarChart2, Save, Trash2, UserCheck, ShieldQuestion
} from 'lucide-react'
import { getCommittee, formCommittee, submitCommitteeScore, getTenderBidders, getOfficerBids, submitConflictDeclaration } from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'
import ScoreRing from '../../components/ScoreRing.jsx'

const METHODS = [
  { value: 'AVERAGE', label: 'Simple Average' },
  { value: 'MIN', label: 'Conservative (Minimum)' },
  { value: 'MAX', label: 'Liberal (Maximum)' },
]

const DEMO_EVALUATORS = [
  { id: 'USR-001', name: 'Rajesh Kumar', role: 'Procurement Officer' },
  { id: 'USR-002', name: 'Priya Sharma', role: 'Technical Expert' },
  { id: 'USR-003', name: 'Arun Nair', role: 'Domain Specialist' },
]

export default function EvalCommittee() {
  const { tenderId } = useParams()
  const tid = tenderId || 'GEM-DEMO-2026-001'
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [committee, setCommittee] = useState(null)
  const [bidders, setBidders] = useState([])
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scoring, setScoring] = useState({})
  const [members, setMembers] = useState([...DEMO_EVALUATORS])
  const [aggregateMethod, setAggregateMethod] = useState('AVERAGE')
  const [editMode, setEditMode] = useState(false)
  const [scoreInputs, setScoreInputs] = useState({})
  const [coiModal, setCoiModal] = useState(false)
  const [coiForm, setCoiForm] = useState({ officer_name: '', has_conflict: false, conflict_reason: '', action: 'NONE' })
  const [coiSaving, setCoiSaving] = useState(false)
  const [coiRecords, setCoiRecords] = useState([])

  const load = () => {
    setLoading(true)
    Promise.all([
      getCommittee(tid),
      getTenderBidders(tid),
      getOfficerBids({ tender_id: tid }),
    ]).then(([cRes, bRes, bidRes]) => {
      setCommittee(cRes.data)
      setBidders(bRes.data || [])
      setBids(bidRes.data || [])
      if (cRes.data?.members?.length) setMembers(cRes.data.members)
      if (cRes.data?.aggregate_method) setAggregateMethod(cRes.data.aggregate_method)
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tid])

  const handleFormCommittee = async () => {
    setSaving(true)
    try {
      await formCommittee(tid, {
        members,
        aggregate_method: aggregateMethod,
        formed_by: 'Rajesh Kumar',
      })
      addToast('Committee formed successfully', 'success')
      setEditMode(false)
      load()
    } catch { addToast('Failed to form committee', 'error') }
    finally { setSaving(false) }
  }

  const handleScore = async (bidId, evaluatorId, evaluatorName, bidderId) => {
    const key = `${bidId}_${evaluatorId}`
    const score = scoreInputs[key]
    if (score === undefined || score === '') { addToast('Enter a score (0–100)', 'warning'); return }
    setScoring((p) => ({ ...p, [key]: true }))
    try {
      await submitCommitteeScore(tid, {
        bid_id: bidId, evaluator_id: evaluatorId, evaluator_name: evaluatorName,
        score: Number(score), bidder_id: bidderId, comments: '',
      })
      addToast(`Score ${score}/100 submitted`, 'success')
      setScoreInputs((p) => { const n = { ...p }; delete n[key]; return n })
      load()
    } catch { addToast('Score submission failed', 'error') }
    finally { setScoring((p) => ({ ...p, [key]: false })) }
  }

  const handleSubmitConflict = async () => {
    if (!coiForm.officer_name.trim()) { addToast('Enter evaluator/officer name', 'warning'); return }
    if (coiForm.has_conflict && !coiForm.conflict_reason.trim()) { addToast('Describe the nature of the conflict', 'warning'); return }
    setCoiSaving(true)
    try {
      const res = await submitConflictDeclaration(tid, coiForm)
      setCoiRecords((p) => [res.data.declaration, ...p])
      addToast('Conflict of interest declaration recorded', 'success')
      setCoiModal(false)
      setCoiForm({ officer_name: '', has_conflict: false, conflict_reason: '', action: 'NONE' })
    } catch {
      addToast('Failed to record declaration', 'error')
    } finally {
      setCoiSaving(false)
    }
  }

  const enriched = bidders.map((b) => {
    const bid = bids.find((bd) => bd.bidder_id === b.id) || {}
    const scores = (committee?.scores || []).filter((s) => s.bid_id === bid.id)
    return { ...b, bid, scores, technical_score: bid.technical_score, committee_evaluators: bid.committee_evaluators }
  })

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tid}`)}>{tid}</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Technical Evaluation Committee</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Users size={20} className="text-blue-600" /> Evaluation Committee</h1>
          <p className="text-sm text-gray-500 mt-0.5">Form committee, assign evaluators, submit individual technical scores</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={() => setCoiModal(true)}>
            <ShieldQuestion size={13} /> Declare Conflict of Interest
          </button>
          <button className="btn-secondary text-xs" onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Cancel' : 'Edit Committee'}
          </button>
        </div>
      </div>

      {/* Conflict of Interest declarations recorded this session */}
      {coiRecords.length > 0 && (
        <div className="card p-4">
          <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Conflict of Interest Declarations</h2>
          <div className="space-y-2">
            {coiRecords.map((d, i) => (
              <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${d.has_conflict ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'}`}>
                {d.has_conflict
                  ? <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  : <CheckCircle size={12} className="text-green-600 flex-shrink-0 mt-0.5" />}
                <div className="text-xs">
                  <span className="font-semibold text-slate-700">{d.officer_name}</span>{' '}
                  <span className={d.has_conflict ? 'text-amber-800' : 'text-green-800'}>
                    {d.has_conflict ? `declared a conflict (${d.action}): ${d.conflict_reason}` : 'declared no conflict of interest'}
                  </span>
                  <span className="text-gray-400"> · {new Date(d.declared_at).toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflict of Interest Modal */}
      {coiModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 w-full max-w-sm shadow-2xl" style={{ borderRadius: '2px' }}>
            <h3 className="text-base font-bold text-slate-800 mb-1">Conflict of Interest Declaration</h3>
            <p className="text-xs text-gray-500 mb-4">
              Evaluators and officers must declare any personal, financial, or professional interest in bidders for tender {tid}.
            </p>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Your Name</label>
            <input
              type="text" value={coiForm.officer_name}
              onChange={(e) => setCoiForm((p) => ({ ...p, officer_name: e.target.value }))}
              placeholder="Evaluator / officer name"
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none mb-3"
              style={{ borderRadius: '2px' }}
            />
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox" checked={coiForm.has_conflict}
                onChange={(e) => setCoiForm((p) => ({ ...p, has_conflict: e.target.checked }))}
                className="w-4 h-4 accent-amber-600"
              />
              <span className="text-sm text-gray-700">I have a conflict of interest with a bidder in this tender</span>
            </label>
            {coiForm.has_conflict && (
              <>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Nature of Conflict</label>
                <textarea rows={3} value={coiForm.conflict_reason}
                  onChange={(e) => setCoiForm((p) => ({ ...p, conflict_reason: e.target.value }))}
                  placeholder="Describe the relationship or interest…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none mb-3"
                  style={{ borderRadius: '2px' }} />
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Action</label>
                <select
                  value={coiForm.action}
                  onChange={(e) => setCoiForm((p) => ({ ...p, action: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none mb-4"
                  style={{ borderRadius: '2px' }}
                >
                  <option value="RECUSE">Recuse from evaluation</option>
                  <option value="DISCLOSE">Disclose and continue</option>
                  <option value="NONE">No action</option>
                </select>
              </>
            )}
            <div className="flex gap-3 mt-1">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setCoiModal(false)}>Cancel</button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700"
                style={{ borderRadius: '2px' }}
                onClick={handleSubmitConflict}
                disabled={coiSaving}
              >
                {coiSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                {coiSaving ? 'Saving…' : 'Submit Declaration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Committee Config */}
      {(editMode || !committee?.members?.length) && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Committee Configuration</h2>
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Aggregate Method</label>
            <div className="flex gap-3">
              {METHODS.map((m) => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={aggregateMethod === m.value} onChange={() => setAggregateMethod(m.value)} className="accent-blue-600" />
                  <span className="text-sm">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Committee Members</label>
          <div className="space-y-2 mb-3">
            {members.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50" style={{ borderRadius: '2px' }}>
                <UserCheck size={14} className="text-blue-600" />
                <span className="text-sm font-semibold text-slate-700 flex-1">{m.name}</span>
                <span className="text-xs text-gray-500">{m.role}</span>
                {members.length > 1 && (
                  <button className="text-red-400 hover:text-red-600" onClick={() => setMembers((p) => p.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs" onClick={handleFormCommittee} disabled={saving}>
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save Committee'}
            </button>
          </div>
        </div>
      )}

      {/* Current committee summary */}
      {committee?.members?.length > 0 && !editMode && (
        <div className="p-3 bg-green-50 border border-green-200 flex items-center gap-3" style={{ borderRadius: '2px' }}>
          <CheckCircle size={15} className="text-green-600" />
          <p className="text-sm font-semibold text-green-800">
            Committee formed — {committee.members.length} evaluators · {committee.aggregate_method} method
          </p>
          <span className="ml-auto text-xs text-gray-500">Formed {committee.formed_at ? new Date(committee.formed_at).toLocaleDateString('en-IN') : ''}</span>
        </div>
      )}

      {/* Scoring Grid */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <BarChart2 size={15} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-700">Technical Scoring</h2>
          <span className="ml-auto text-xs text-gray-400">Scores are immutable once submitted</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase">Bidder</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Compliance</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Aggregate Score</th>
                {(committee?.members || DEMO_EVALUATORS).map((m) => (
                  <th key={m.id} className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">{m.name.split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enriched.map((b) => {
                const evaluators = committee?.members || DEMO_EVALUATORS
                return (
                  <tr key={b.id} className="hover:bg-blue-50/20">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-sm">{b.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{b.id}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <ScoreRing score={b.compliance_score || 0} size={40} strokeWidth={4} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      {b.technical_score != null ? (
                        <div>
                          <p className="text-lg font-bold text-blue-700">{b.technical_score}<span className="text-xs text-gray-400">/100</span></p>
                          <p className="text-[10px] text-gray-400">{b.committee_evaluators || 0} evaluators</p>
                        </div>
                      ) : <span className="text-gray-300 text-xs">Pending</span>}
                    </td>
                    {evaluators.map((ev) => {
                      const key = `${b.bid?.id}_${ev.id}`
                      const existingScore = b.scores?.find((s) => s.evaluator_id === ev.id)
                      return (
                        <td key={ev.id} className="px-3 py-3 text-center">
                          {existingScore ? (
                            <div>
                              <p className="text-sm font-bold text-green-700">{existingScore.score}</p>
                              <p className="text-[9px] text-gray-400">Submitted</p>
                            </div>
                          ) : b.bid?.id ? (
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number" min="0" max="100"
                                value={scoreInputs[key] ?? ''}
                                onChange={(e) => setScoreInputs((p) => ({ ...p, [key]: e.target.value }))}
                                placeholder="0-100"
                                className="w-16 px-2 py-1 text-xs border border-gray-300 text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                                style={{ borderRadius: '2px' }}
                              />
                              <button
                                className="text-[10px] px-1.5 py-1 bg-blue-600 text-white hover:bg-blue-700"
                                style={{ borderRadius: '2px' }}
                                onClick={() => handleScore(b.bid.id, ev.id, ev.name, b.id)}
                                disabled={scoring[key]}
                              >
                                {scoring[key] ? <RefreshCw size={10} className="animate-spin" /> : '✓'}
                              </button>
                            </div>
                          ) : <span className="text-[10px] text-gray-300">No bid</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800" style={{ borderRadius: '2px' }}>
        <AlertTriangle size={12} className="inline mr-1" />
        Individual evaluator scores are immutable once submitted. The aggregate is auto-computed using the configured method.
        Final technical qualification decision remains with the authorized Procurement Officer.
      </div>
    </div>
  )
}
