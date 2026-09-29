import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, Lock, User, ChevronRight, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

const DEMO_ACCOUNTS = [
  {
    role: 'OFFICER',
    label: 'Procurement Officer',
    email: 'officer@demo.gov',
    password: 'password',
    color: 'bg-blue-600',
    desc: 'Full access to tenders, bidder evaluation, compliance, decisions',
  },
  {
    role: 'BIDDER',
    label: 'Bidder / Seller',
    email: 'bidder@demo.com',
    password: 'password',
    color: 'bg-green-600',
    desc: 'ABC Technologies — tender discovery, bid submission, document upload',
  },
  {
    role: 'STAKEHOLDER',
    label: 'Public Stakeholder',
    email: 'citizen@demo.com',
    password: 'password',
    color: 'bg-purple-600',
    desc: 'Public tender search, timeline tracking, feedback submission',
  },
]

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      redirectByRole(user.role)
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickLogin = async (account) => {
    setError('')
    setLoading(true)
    try {
      const user = await login(account.email, account.password)
      redirectByRole(user.role)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const redirectByRole = (role) => {
    if (role === 'OFFICER') navigate('/')
    else if (role === 'BIDDER') navigate('/bidder/dashboard')
    else if (role === 'STAKEHOLDER') navigate('/public/dashboard')
    else navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left — Branding */}
        <div className="bg-[#0B2A4A] rounded-2xl p-8 flex flex-col justify-between text-white">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                <Shield size={20} className="text-white" />
              </div>
              <div>
                <div className="font-bold text-lg leading-tight">PARAKH AI</div>
                <div className="text-blue-300 text-xs">Powered by Aevora · SIH 2026</div>
              </div>
            </div>
            <h1 className="text-2xl font-bold leading-tight mb-3">
              AI-Powered Bid Compliance & Procurement Intelligence
            </h1>
            <p className="text-blue-200 text-sm leading-relaxed mb-8">
              Evidence-driven compliance verification for GeM procurement. AI verifies → AI identifies risks → AI recommends → Officer decides.
            </p>
            <div className="space-y-3">
              {[
                'AI Bid Readiness Analysis',
                'Evidence-backed Compliance',
                'Cross-document Verification',
                'Public Transparency Timeline',
                'Complete Audit Trail',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-blue-100">
                  <div className="w-4 h-4 bg-blue-500/40 rounded-full flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 bg-blue-300 rounded-full" />
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 text-[10px] text-blue-400">
            Smart India Hackathon 2026 · SIH26100 · Demo Build
          </div>
        </div>

        {/* Right — Login Form */}
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Sign In</h2>
          <p className="text-sm text-gray-500 mb-6">Government Procurement Portal</p>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Employee ID / Official Email
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domain.gov"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary justify-center py-3 text-sm"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Demo Quick Login */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Demo Quick Login
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  onClick={() => handleQuickLogin(acc)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                >
                  <div className={`w-8 h-8 ${acc.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-[10px] font-bold">{acc.role[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{acc.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{acc.desc}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
            <Shield size={10} className="text-blue-400" />
            Secure Government Access · PARAKH AI Demo
          </div>
        </div>
      </div>
    </div>
  )
}
