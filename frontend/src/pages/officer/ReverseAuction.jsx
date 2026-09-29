/**
 * ReverseAuction.jsx — Reverse Auction Simulation Module
 * Demo simulation mode. Clearly labelled SIMULATED throughout.
 * Shows RA lifecycle: SCHEDULED → LIVE → CLOSED → FINAL_PRICE
 */
import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, TrendingDown, Clock, RefreshCw,
  AlertTriangle, CheckCircle, Lock, Unlock, Users, Play
} from 'lucide-react'
import { getTenderBidders, getOfficerBids } from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const RA_STAGES = ['RA_ELIGIBILITY', 'RA_SCHEDULED', 'RA_LIVE', 'RA_CLOSED', 'FINAL_PRICE']
const STAGE_LABELS = {
  RA_ELIGIBILITY: 'Eligibility Check',
  RA_SCHEDULED: 'Scheduled',
  RA_LIVE: 'LIVE',
  RA_CLOSED: 'Closed',
  FINAL_PRICE: 'Final Price Determined',
}

export default function ReverseAuction() {
  const { tenderId } = useParams()
  const tid = tenderId || 'GEM-DEMO-2026-001'
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [bidders, setBidders] = useState([])
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState('RA_ELIGIBILITY')
  const [countdown, setCountdown] = useState(0)
  const [raRunning, setRaRunning] = useState(false)
  const [raBids, setRaBids] = useState({})
  const timerRef = useRef(null)

  useEffect(() => {
    Promise.all([getTenderBidders(tid), getOfficerBids({ tender_id: tid })])
      .then(([bRes, bidRes]) => {
        setBidders(bRes.data || [])
        const b = bidRes.data || []
        setBids(b)
        // Init RA bids from current quoted prices
        const init = {}
        b.forEach((bid) => { if (bid.quoted_price > 0) init[bid.bidder_id] = bid.quoted_price })
        setRaBids(init)
      }).catch(console.error).finally(() => setLoading(false))
    return () => clearInterval(timerRef.current)
  }, [tid])

  const startRA = () => {
    setStage('RA_LIVE')
    setRaRunning(true)
    setCountdown(120) // 2-minute demo RA
    addToast('Reverse Auction LIVE — Simulation Mode', 'info')

    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current)
          setStage('RA_CLOSED')
          setRaRunning(false)
          addToast('Reverse Auction closed', 'success')
          setTimeout(() => setStage('FINAL_PRICE'), 1500)
          return 0
        }
        // Simulate random bid drops every 15s
        if (c % 15 === 0) {
          setRaBids((prev) => {
            const next = { ...prev }
            const keys = Object.keys(next)
            if (keys.length > 0) {
              const randomKey = keys[Math.floor(Math.random() * keys.length)]
              next[randomKey] = Math.round(next[randomKey] * (0.96 + Math.random() * 0.02))
            }
            return next
          })
        }
        return c - 1
      })
    }, 1000)
  }

  const formatPrice = (p) => {
    if (!p) return '—'
    if (p >= 10_000_000) return `₹${(p / 10_000_000).toFixed(2)} Cr`
    if (p >= 100_000) return `₹${(p / 100_000).toFixed(2)} L`
    return `₹${p.toLocaleString('en-IN')}`
  }

  const sortedByPrice = Object.entries(raBids)
    .map(([bidderId, price]) => ({
      bidderId, price,
      name: bidders.find((b) => b.id === bidderId)?.name || bidderId,
    }))
    .sort((a, b) => a.price - b.price)

  const l1 = sortedByPrice[0]

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tid}`)}>{tid}</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Reverse Auction</span>
      </div>

      {/* DEMO badge */}
      <div className="p-3 bg-amber-50 border-l-4 border-l-amber-500 flex items-center gap-3">
        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-amber-800">
          DEMO / SIMULATED MODE — This reverse auction is a simulation for demonstration purposes only.
          No real GeM RA integration. Price drops are randomly simulated.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="page-title">Reverse Auction — {tid}</h1>
        <span className={`px-3 py-1.5 text-sm font-bold ${
          stage === 'RA_LIVE' ? 'bg-red-600 text-white animate-pulse' :
          stage === 'FINAL_PRICE' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
        }`} style={{ borderRadius: '2px' }}>
          {STAGE_LABELS[stage] || stage}
        </span>
      </div>

      {/* Stage progress */}
      <div className="card p-4">
        <div className="flex items-center gap-0">
          {RA_STAGES.map((s, i) => {
            const currentIdx = RA_STAGES.indexOf(stage)
            const done = i < currentIdx
            const active = i === currentIdx
            return (
              <React.Fragment key={s}>
                <div className={`flex flex-col items-center flex-shrink-0 ${i > 0 ? '' : ''}`}>
                  <div className={`w-8 h-8 flex items-center justify-center text-xs font-bold ${
                    done ? 'bg-green-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`} style={{ borderRadius: '50%' }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1 text-center w-20">{STAGE_LABELS[s]}</p>
                </div>
                {i < RA_STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mt-[-18px] ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Countdown */}
      {stage === 'RA_LIVE' && (
        <div className="card p-5 border-l-4 border-l-red-500 bg-red-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-red-600 animate-pulse" />
              <div>
                <p className="text-sm font-bold text-red-800">REVERSE AUCTION IN PROGRESS</p>
                <p className="text-xs text-red-700">Bidders are submitting revised prices. Countdown to close:</p>
              </div>
            </div>
            <div className="text-3xl font-bold text-red-700 tabular-nums">
              {String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}
            </div>
          </div>
        </div>
      )}

      {/* Start button */}
      {stage === 'RA_ELIGIBILITY' && (
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Eligible Bidders: {sortedByPrice.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">All technically qualified bidders may participate in RA</p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setStage('RA_SCHEDULED')}>
            <Users size={14} /> Schedule Auction
          </button>
        </div>
      )}
      {stage === 'RA_SCHEDULED' && (
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Auction Scheduled — Start when ready</p>
            <p className="text-xs text-gray-500 mt-0.5">Duration: 2 minutes (demo). Minimum decrement: 0.5%</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
            style={{ borderRadius: '2px' }} onClick={startRA}>
            <Play size={14} /> Start Reverse Auction
          </button>
        </div>
      )}

      {/* Price board */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingDown size={15} className="text-green-600" />
          <h2 className="text-sm font-semibold text-slate-700">Live Price Board</h2>
          {stage === 'RA_LIVE' && <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 animate-pulse" style={{ borderRadius: '2px' }}>LIVE</span>}
        </div>
        <div className="divide-y divide-gray-50">
          {sortedByPrice.map((item, idx) => (
            <div key={item.bidderId} className={`flex items-center gap-4 px-5 py-4 ${idx === 0 ? 'bg-green-50/30' : ''}`}>
              <div className={`w-7 h-7 flex items-center justify-center text-xs font-bold ${
                idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-700' : 'bg-gray-100 text-gray-500'
              }`} style={{ borderRadius: '50%' }}>L{idx + 1}</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                <p className="text-[10px] text-gray-400">{item.bidderId}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${idx === 0 ? 'text-green-700' : 'text-slate-700'}`}>{formatPrice(item.price)}</p>
                {idx === 0 && <span className="text-[9px] text-green-600 font-bold">CURRENT L1</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final result */}
      {stage === 'FINAL_PRICE' && l1 && (
        <div className="p-5 bg-green-50 border border-green-200" style={{ borderRadius: '2px' }}>
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-800">Reverse Auction Complete — Final L1 Price Determined</p>
              <p className="text-xs text-green-700 mt-0.5">
                <strong>{l1.name}</strong> is L1 at <strong>{formatPrice(l1.price)}</strong>.
                Proceed to officer evaluation and award.
              </p>
              <p className="text-[10px] text-gray-400 mt-1">SIMULATED — Not a real GeM auction result</p>
            </div>
            <button className="ml-auto btn-primary text-xs" onClick={() => navigate(`/tenders/${tid}/bid-comparison`)}>
              View Bid Comparison
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
