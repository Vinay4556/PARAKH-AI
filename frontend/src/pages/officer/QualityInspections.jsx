import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronRight, CheckCircle, AlertTriangle, XCircle,
  Package, ClipboardList, RefreshCw, Plus, ArrowRight
} from 'lucide-react'
import api from '../../services/api.js'
import { useToast } from '../../components/Toast.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'

const RESULT_CONFIG = {
  ACCEPTED:           { label: 'Accepted',            color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
  CONDITIONAL_ACCEPT: { label: 'Conditional Accept',  color: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertTriangle },
  REJECTED:           { label: 'Rejected',            color: 'text-red-700 bg-red-50 border-red-200',       icon: XCircle },
}

const INSPECTION_TYPES = [
  'Pre-Dispatch Inspection',
  'Goods Receipt Inspection',
  'Installation Quality Check',
  'Final Acceptance Test',
  'Performance Verification',
]

export default function QualityInspections() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedContract = searchParams.get('contract')
  const { addToast } = useToast()

  const [contracts, setContracts]       = useState([])
  const [inspections, setInspections]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [selectedContract, setSelectedContract] = useState(preselectedContract || '')
  const [showForm, setShowForm]         = useState(!!preselectedContract)
  const [submitting, setSubmitting]     = useState(false)

  const [form, setForm] = useState({
    inspection_type: 'Goods Receipt Inspection',
    inspector: 'Rajesh Kumar',
    overall_result: 'ACCEPTED',
    report_notes: '',
    items: [
      { item: 'Equipment count as per PO', result: 'PASS', remarks: '' },
      { item: 'Physical condition — no damage', result: 'PASS', remarks: '' },
      { item: 'Model and specifications match', result: 'PASS', remarks: '' },
      { item: 'Documentation complete', result: 'PASS', remarks: '' },
    ],
  })

  useEffect(() => {
    Promise.all([
      api.get('/contracts?tender_id=GEM-DEMO-2026-001'),
      preselectedContract
        ? api.get(`/contracts/${preselectedContract}/inspections`)
        : api.get('/contracts?tender_id=GEM-DEMO-2026-001').then(() => ({ data: [] })),
    ])
      .then(([cRes, iRes]) => {
        setContracts(cRes.data || [])
        setInspections(iRes.data || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [preselectedContract])

  const loadInspections = (contractId) => {
    api.get(`/contracts/${contractId}/inspections`)
      .then((res) => setInspections(res.data || []))
      .catch(console.error)
  }

  const handleContractChange = (id) => {
    setSelectedContract(id)
    if (id) loadInspections(id)
  }

  const updateItem = (idx, key, val) => {
    setForm((prev) => {
      const items = [...prev.items]
      items[idx] = { ...items[idx], [key]: val }
      return { ...prev, items }
    })
  }

  const handleSubmit = async () => {
    if (!selectedContract) { addToast('Select a contract first', 'warning'); return }
    setSubmitting(true)
    try {
      await api.post('/inspections', {
        contract_id:     selectedContract,
        tender_id:       'GEM-DEMO-2026-001',
        bidder_id:       contracts.find((c) => c.id === selectedContract)?.bidder_id,
        inspection_type: form.inspection_type,
        inspector:       form.inspector,
        inspected_at:    new Date().toISOString(),
        overall_result:  form.overall_result,
        report_notes:    form.report_notes,
        items:           form.items,
      })
      addToast('Inspection recorded successfully', 'success')
      setShowForm(false)
      loadInspections(selectedContract)
    } catch {
      addToast('Failed to save inspection', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader />

  const selectedContractData = contracts.find((c) => c.id === selectedContract)

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/contracts')}>Contracts</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Quality Inspections</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList size={20} className="text-blue-600" /> Quality Inspections
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Record and track delivery inspections for contract milestones</p>
        </div>
        <button className="btn-primary text-xs" onClick={() => setShowForm(true)}>
          <Plus size={13} /> New Inspection
        </button>
      </div>

      {/* Contract Selector */}
      <div className="card p-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Select Contract</label>
        <select
          value={selectedContract}
          onChange={(e) => handleContractChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderRadius: '2px' }}
        >
          <option value="">— Select a contract —</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>{c.id} · {c.bidder_name} · {c.contract_value_display}</option>
          ))}
        </select>
        {selectedContractData && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            {[
              { label: 'Bidder',    value: selectedContractData.bidder_name },
              { label: 'Value',     value: selectedContractData.contract_value_display },
              { label: 'Deadline',  value: selectedContractData.delivery_deadline },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 p-2" style={{ borderRadius: '2px' }}>
                <p className="text-gray-400 mb-0.5">{label}</p>
                <p className="font-semibold text-slate-700">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Inspection Form */}
      {showForm && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Inspection Report</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Inspection Type</label>
              <select
                value={form.inspection_type}
                onChange={(e) => setForm((p) => ({ ...p, inspection_type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderRadius: '2px' }}
              >
                {INSPECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Inspector Name</label>
              <input
                type="text"
                value={form.inspector}
                onChange={(e) => setForm((p) => ({ ...p, inspector: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderRadius: '2px' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Overall Result</label>
              <select
                value={form.overall_result}
                onChange={(e) => setForm((p) => ({ ...p, overall_result: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderRadius: '2px' }}
              >
                <option value="ACCEPTED">Accepted</option>
                <option value="CONDITIONAL_ACCEPT">Conditional Accept</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          {/* Checklist Items */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Inspection Checklist</label>
            <div className="divide-y divide-gray-100 border border-gray-200" style={{ borderRadius: '2px' }}>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3">
                  <p className="flex-1 text-sm text-slate-700">{item.item}</p>
                  <select
                    value={item.result}
                    onChange={(e) => updateItem(idx, 'result', e.target.value)}
                    className="text-xs border border-gray-300 px-2 py-1 focus:outline-none"
                    style={{ borderRadius: '2px' }}
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="N/A">N/A</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Remarks…"
                    value={item.remarks}
                    onChange={(e) => updateItem(idx, 'remarks', e.target.value)}
                    className="text-xs border border-gray-300 px-2 py-1 w-40 focus:outline-none"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Inspection Notes</label>
            <textarea
              rows={3}
              value={form.report_notes}
              onChange={(e) => setForm((p) => ({ ...p, report_notes: e.target.value }))}
              placeholder="Overall findings, observations, and recommendations…"
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{ borderRadius: '2px' }}
            />
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : 'Save Inspection Report'}
            </button>
          </div>
        </div>
      )}

      {/* Inspection History */}
      {inspections.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-slate-700">Inspection History ({inspections.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {inspections.map((ins) => {
              const cfg = RESULT_CONFIG[ins.overall_result] || RESULT_CONFIG.ACCEPTED
              const Icon = cfg.icon
              return (
                <div key={ins.id} className="px-5 py-4 flex items-start gap-3">
                  <Icon size={16} className={cfg.color.split(' ')[0]} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-700">{ins.inspection_type}</p>
                      <span className={`text-[10px] px-2 py-0.5 border font-semibold ${cfg.color}`} style={{ borderRadius: '2px' }}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{ins.report_notes}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Inspector: {ins.inspector} · {ins.inspected_at ? new Date(ins.inspected_at).toLocaleDateString('en-IN') : 'N/A'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!selectedContract && inspections.length === 0 && !showForm && (
        <div className="card p-12 text-center text-gray-400">
          <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a contract above to view or create inspections.</p>
        </div>
      )}
    </div>
  )
}
