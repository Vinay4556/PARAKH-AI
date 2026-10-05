import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, Shield, User, Bell, Lock, Database,
  Save, CheckCircle, RefreshCw, Info, Cpu
} from 'lucide-react'
import { useToast } from '../components/Toast.jsx'

export default function Settings() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    officerName: 'Rajesh Kumar',
    officerEmail: 'rajesh.kumar@gem.gov.in',
    department: 'Government Industrial Procurement Division',
    aiMode: 'demo',
    mandatoryWeight: 5,
    optionalWeight: 2,
    reviewCredit: 50,
    autoAnalyze: false,
    notifyOnComplete: true,
    notifyOnIssue: true,
  })

  const handleSave = async () => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 800))
    setSaving(false)
    showToast('Settings saved successfully', 'success')
  }

  const update = (key, value) => setSettings((p) => ({ ...p, [key]: value }))

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Settings</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform configuration for BidGuard AI</p>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      {/* Officer Profile */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 rounded-lg">
            <User size={16} className="text-blue-700" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">Officer Profile</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Full Name', key: 'officerName', type: 'text' },
            { label: 'Official Email', key: 'officerEmail', type: 'email' },
            { label: 'Department', key: 'department', type: 'text' },
          ].map(({ label, key, type }) => (
            <div key={key} className={key === 'department' ? 'md:col-span-2' : ''}>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
              <input
                type={type}
                value={settings[key]}
                onChange={(e) => update(key, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* AI Configuration */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Cpu size={16} className="text-purple-700" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">AI Engine Configuration</h2>
        </div>

        <div className="space-y-4">
          {/* AI Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">AI Mode</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'demo', label: 'Demo Mode', desc: 'Deterministic synthetic results. No API key required.' },
                { value: 'live', label: 'Live AI Mode', desc: 'Uses configured LLM/API for real-time analysis.' },
              ].map((opt) => (
                <div
                  key={opt.value}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${settings.aiMode === opt.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  onClick={() => update('aiMode', opt.value)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${settings.aiMode === opt.value ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-slate-700">{opt.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {settings.aiMode === 'demo' && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2">
              <Info size={13} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">
                Demo mode uses deterministic compliance results pre-computed from realistic bidder documents.
                All analysis logic runs locally without any external API calls.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Scoring Weights */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-50 rounded-lg">
            <Shield size={16} className="text-green-700" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">Scoring Configuration</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Mandatory Requirement Weight', key: 'mandatoryWeight', min: 1, max: 10 },
            { label: 'Optional Requirement Weight', key: 'optionalWeight', min: 1, max: 10 },
            { label: 'Review Credit (%)', key: 'reviewCredit', min: 0, max: 100 },
          ].map(({ label, key, min, max }) => (
            <div key={key}>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-600">{label}</label>
                <span className="text-sm font-bold text-blue-700">{settings[key]}{key === 'reviewCredit' ? '%' : ' pts'}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                value={settings[key]}
                onChange={(e) => update(key, parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{min}</span><span>{max}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded-xl">
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-semibold">Score formula: </span>
            (Σ satisfied weights / Σ total weights) × 100. Review items receive {settings.reviewCredit}% partial credit.
            Mandatory requirements have {settings.mandatoryWeight}× weight vs {settings.optionalWeight}× for optional.
          </p>
        </div>
      </div>

      {/* Notifications */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Bell size={16} className="text-amber-700" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">Notifications</h2>
        </div>
        <div className="space-y-3">
          {[
            { key: 'notifyOnComplete', label: 'Analysis completed', desc: 'Notify when compliance analysis finishes' },
            { key: 'notifyOnIssue', label: 'Compliance issues detected', desc: 'Alert when non-compliant or missing items found' },
            { key: 'autoAnalyze', label: 'Auto-analyze on upload', desc: 'Automatically run analysis after document upload' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <button
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${settings[key] ? 'bg-blue-600' : 'bg-gray-300'}`}
                onClick={() => update(key, !settings[key])}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Data Management */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Database size={16} className="text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">Data Management</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Tender', value: '1 active' },
            { label: 'Bidders', value: '3 registered' },
            { label: 'Documents', value: '27 processed' },
            { label: 'Audit Events', value: '14 logged' },
          ].map(({ label, value }) => (
            <div key={label} className="p-3 bg-gray-50 rounded-xl text-center">
              <p className="text-sm font-bold text-slate-700">{value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <CheckCircle size={12} className="text-green-500" />
          All data stored locally. No external database required.
        </div>
      </div>

      {/* System Info */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">System Information</h2>
        <div className="space-y-2">
          {[
            { label: 'Platform', value: 'PARAKH AI v1.0.0' },
            { label: 'Submission', value: 'Smart India Hackathon 2026 — SIH26100' },
            { label: 'Team', value: 'Aevora' },
            { label: 'Backend', value: 'Python Flask + JSON Storage' },
            { label: 'Frontend', value: 'React 18 + Vite + Tailwind CSS' },
            { label: 'AI Mode', value: settings.aiMode === 'demo' ? 'Demo (Deterministic)' : 'Live API' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-xs font-semibold text-slate-700">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
