import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, X, Search, Filter } from 'lucide-react'
import { getTenderRequirements } from '../services/api.js'
import StatusBadge from '../components/StatusBadge.jsx'
import { PageLoader } from '../components/LoadingSkeleton.jsx'

const CATEGORY_COLORS = {
  Legal: 'bg-blue-50 text-blue-700',
  Financial: 'bg-green-50 text-green-700',
  Technical: 'bg-purple-50 text-purple-700',
  Certifications: 'bg-teal-50 text-teal-700',
}

export default function Requirements() {
  const { tenderId } = useParams()
  const navigate = useNavigate()
  const [requirements, setRequirements] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterMandatory, setFilterMandatory] = useState('All')

  useEffect(() => {
    getTenderRequirements(tenderId)
      .then((res) => setRequirements(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [tenderId])

  const categories = ['All', ...new Set(requirements.map((r) => r.category))]

  const filtered = requirements.filter((r) => {
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCategory === 'All' || r.category === filterCategory
    const matchMand = filterMandatory === 'All' ||
      (filterMandatory === 'Mandatory' && r.mandatory) ||
      (filterMandatory === 'Optional' && !r.mandatory)
    return matchSearch && matchCat && matchMand
  })

  if (loading) return <PageLoader />

  return (
    <div className="p-6 flex gap-5 max-w-full">
      {/* Main Table */}
      <div className={`flex-1 min-w-0 transition-all ${selected ? 'lg:mr-0' : ''}`}>
        {/* Header */}
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">
          <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
          <ChevronRight size={12} />
          <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}`)}>{tenderId}</span>
          <ChevronRight size={12} />
          <span className="text-slate-700 font-medium">Requirements</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="page-title">Tender Requirements</h1>
            <p className="text-sm text-gray-500 mt-0.5">{requirements.length} requirements — {requirements.filter(r => r.mandatory).length} mandatory, {requirements.filter(r => !r.mandatory).length} optional</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search requirements..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
          >
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select
            value={filterMandatory}
            onChange={(e) => setFilterMandatory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
          >
            <option>All</option>
            <option>Mandatory</option>
            <option>Optional</option>
          </select>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Requirement</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Mandatory</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Required Evidence</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <tr
                  key={req.id}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${selected?.id === req.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  onClick={() => setSelected(selected?.id === req.id ? null : req)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">{req.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{req.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{req.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${CATEGORY_COLORS[req.category] || 'bg-gray-100 text-gray-600'}`}>
                      {req.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {req.mandatory ? (
                      <span className="text-xs font-semibold text-red-600">YES</span>
                    ) : (
                      <span className="text-xs text-gray-400">Optional</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {req.required_evidence?.slice(0, 2).map((ev) => (
                        <span key={ev} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ev}</span>
                      ))}
                      {req.required_evidence?.length > 2 && (
                        <span className="text-[10px] text-gray-400">+{req.required_evidence.length - 2}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    No requirements match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Panel */}
      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="card p-5 sticky top-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-mono text-blue-600">{selected.id}</span>
                <h3 className="font-semibold text-slate-800 mt-0.5 leading-snug">{selected.title}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Category</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${CATEGORY_COLORS[selected.category] || 'bg-gray-100 text-gray-600'}`}>
                  {selected.category}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Mandatory</p>
                <p className={`text-sm font-semibold ${selected.mandatory ? 'text-red-600' : 'text-gray-500'}`}>
                  {selected.mandatory ? 'Yes — Mandatory' : 'No — Optional'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Description</p>
                <p className="text-xs text-slate-700 leading-relaxed">{selected.description}</p>
              </div>
              {selected.threshold_display && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Threshold</p>
                  <p className="text-sm font-bold text-blue-700">{selected.threshold_display}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Required Evidence</p>
                <ul className="space-y-1">
                  {selected.required_evidence?.map((ev) => (
                    <li key={ev} className="text-xs text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Verification Type</p>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                  {selected.verification_type}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
