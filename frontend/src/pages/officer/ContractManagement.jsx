import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Package, CheckCircle, Clock, AlertTriangle, ChevronRight,
  IndianRupee, Calendar, MapPin, FileText, RefreshCw, ArrowRight
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const STATUS_CONFIG = {
  AWARDED: { label: 'Awarded', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  DELIVERY_IN_PROGRESS: { label: 'Delivery In Progress', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  INSPECTION_PENDING: { label: 'Inspection Pending', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  COMPLETED: { label: 'Completed', color: 'bg-green-50 text-green-700 border-green-200' },
  DISPUTED: { label: 'Disputed', color: 'bg-red-50 text-red-700 border-red-200' },
}

const MS_STATUS = {
  COMPLETED: { icon: CheckCircle, color: 'text-green-600', bg: 'border-green-500' },
  IN_PROGRESS: { icon: Clock, color: 'text-blue-600', bg: 'border-blue-500' },
  PENDING: { icon: Clock, color: 'text-gray-300', bg: 'border-gray-200' },
}

export default function ContractManagement() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const [contracts, setContracts] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatingMs, setUpdatingMs] = useState(null)

  const load = () => {
    api.get('/contracts')
      .then((res) => setContracts(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Deep link: /contracts?contract=<id> opens that contract's detail panel
  const deepLinkedId = searchParams.get('contract')
  useEffect(() => {
    if (!deepLinkedId) return
    api.get(`/contracts/${deepLinkedId}`)
      .then((res) => setSelected(res.data))
      .catch(() => addToast('Contract not found', 'error'))
  }, [deepLinkedId])

  const updateMilestone = async (contractId, milestoneId, newStatus) => {
    setUpdatingMs(milestoneId)
    try {
      await api.put(`/contracts/${contractId}/milestone`, {
        milestone_id: milestoneId,
        status: newStatus,
        updated_by: 'Rajesh Kumar',
      })
      addToast('Milestone updated', 'success')
      // Refresh selected contract
      const res = await api.get(`/contracts/${contractId}`)
      setSelected(res.data)
      load()
    } catch {
      addToast('Update failed', 'error')
    } finally {
      setUpdatingMs(null)
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Contract Management</span>
      </div>

      <div className="flex items-center gap-3">
        <Package size={20} className="text-blue-700" />
        <div>
          <h1 className="page-title">Contract Management</h1>
          <p className="text-sm text-gray-500">{contracts.length} active contract{contracts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Contract List */}
        <div className="space-y-3">
          {contracts.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              <Package size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No contracts yet.</p>
            </div>
          ) : (
            contracts.map((c) => {
              const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.AWARDED
              const isSelected = selected?.id === c.id
              return (
                <div
                  key={c.id}
                  className={`card p-4 cursor-pointer transition-all hover:shadow-md ${isSelected ? 'border-2 border-blue-600 bg-blue-50' : ''}`}
                  onClick={() => {
                    api.get(`/contracts/${c.id}`).then((res) => setSelected(res.data))
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-mono text-gray-400">{c.id}</span>
                    <span className={`status-badge text-[10px] border ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{c.bidder_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.contract_reference}</p>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><IndianRupee size={10} />{c.contract_value_display}</span>
                    <span className="flex items-center gap-1"><Calendar size={10} />Due {c.delivery_deadline}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Contract Detail */}
        {selected ? (
          <div className="lg:col-span-2 space-y-4">
            {/* Header */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-xs font-mono text-gray-400">{selected.id}</span>
                  <h2 className="text-base font-bold text-slate-800">{selected.bidder_name}</h2>
                  <p className="text-xs text-gray-500">{selected.contract_reference}</p>
                </div>
                <span className={`status-badge text-[10px] border ${STATUS_CONFIG[selected.status]?.color || ''}`}>
                  {STATUS_CONFIG[selected.status]?.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-400 mb-0.5">Contract Value</p>
                  <p className="font-bold text-slate-700">{selected.contract_value_display}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-400 mb-0.5">Delivery Deadline</p>
                  <p className="font-bold text-slate-700">{selected.delivery_deadline}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-400 mb-0.5">Payment Terms</p>
                  <p className="font-bold text-slate-700">{selected.payment_terms}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-400 mb-0.5">Penalty</p>
                  <p className="font-bold text-red-600">
                    {selected.total_penalty_amount > 0 ? `₹${selected.total_penalty_amount.toLocaleString('en-IN')}` : 'None'}
                  </p>
                </div>
              </div>
              {selected.penalty_details && (
                <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {selected.penalty_details}
                </div>
              )}
            </div>

            {/* Milestones */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Contract Milestones</h3>
              <div className="space-y-3">
                {(selected.milestones || []).map((ms, idx) => {
                  const cfg = MS_STATUS[ms.status] || MS_STATUS.PENDING
                  const Icon = cfg.icon
                  const canUpdate = ms.status !== 'COMPLETED'
                  return (
                    <div key={ms.id} className={`flex items-start gap-3 p-3 rounded-xl border ${ms.status === 'IN_PROGRESS' ? 'bg-blue-50 border-blue-200' : ms.status === 'COMPLETED' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <Icon size={15} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{ms.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          <span>Due: {ms.due_date}</span>
                          {ms.completed_date && <span className="text-green-600">Completed: {ms.completed_date}</span>}
                        </div>
                        {ms.notes && <p className="text-xs text-gray-500 mt-1 italic">{ms.notes}</p>}
                      </div>
                      {canUpdate && (
                        <select
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                          value={ms.status}
                          disabled={updatingMs === ms.id}
                          onChange={(e) => updateMilestone(selected.id, ms.id, e.target.value)}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Inspections */}
            {selected.inspections?.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Quality Inspections</h3>
                {selected.inspections.map((ins) => (
                  <div key={ins.id} className={`p-3 rounded-xl border mb-2 ${ins.overall_result === 'ACCEPTED' ? 'bg-green-50 border-green-200' : ins.overall_result === 'CONDITIONAL_ACCEPT' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-700">{ins.id} — {ins.inspection_type}</p>
                      <span className="text-xs font-bold text-slate-600">{ins.overall_result?.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{ins.report_notes}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Inspector: {ins.inspector} · {new Date(ins.inspected_at).toLocaleDateString('en-IN')}</p>
                  </div>
                ))}
                <button
                  className="btn-secondary text-xs mt-2"
                  onClick={() => navigate(`/contracts?contract=${selected.id}`)}
                >
                  View Full Inspection <ArrowRight size={12} />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                className="btn-secondary text-xs"
                onClick={() => navigate(`/bidders/${selected.bidder_id}/compliance`)}
              >
                Compliance Report
              </button>
              <button
                className="btn-primary text-xs"
                onClick={() => navigate(`/quality/inspections?contract=${selected.id}`)}
              >
                New Inspection <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 card p-10 text-center text-gray-400">
            <Package size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select a contract to view details.</p>
          </div>
        )}
      </div>
    </div>
  )
}
