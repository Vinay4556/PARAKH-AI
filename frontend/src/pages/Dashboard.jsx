import React, { useEffect, useState } from 'react'


import { useNavigate } from 'react-router-dom'


import {


  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,


  PieChart, Pie, Cell, Legend


} from 'recharts'


import {


  FileText, Users, FolderOpen, TrendingUp, ArrowRight, AlertTriangle,


  CheckCircle, XCircle, Clock, ChevronRight, Shield, Search,


  GitBranch, BarChart2, Lightbulb, UserCheck, AlertCircle,


  IndianRupee, MessageSquare, Lock, Fingerprint, Package


} from 'lucide-react'


import { getDashboard } from '../services/api.js'


import { PageLoader } from '../components/LoadingSkeleton.jsx'


import { useLanguage } from '../context/LanguageContext.jsx'


import api from '../services/api.js'





const PIE_COLORS = ['#16a34a', '#d97706', '#dc2626']





const WORKFLOW_STEP_KEYS = [
  { num: '01', labelKey: 'workflow_step_tender',     icon: FileText,   color: 'bg-blue-600',   descKey: 'workflow_step_tender_desc' },
  { num: '02', labelKey: 'workflow_step_prebid',     icon: Search,     color: 'bg-indigo-600', descKey: 'workflow_step_prebid_desc' },
  { num: '03', labelKey: 'workflow_step_verify',     icon: Shield,     color: 'bg-purple-600', descKey: 'workflow_step_verify_desc' },
  { num: '04', labelKey: 'workflow_step_crosscheck', icon: GitBranch,  color: 'bg-teal-600',   descKey: 'workflow_step_crosscheck_desc' },
  { num: '05', labelKey: 'workflow_step_assess',     icon: BarChart2,  color: 'bg-amber-600',  descKey: 'workflow_step_assess_desc' },
  { num: '06', labelKey: 'workflow_step_recommend',  icon: Lightbulb,  color: 'bg-orange-600', descKey: 'workflow_step_recommend_desc' },
  { num: '07', labelKey: 'workflow_step_decide',     icon: UserCheck,  color: 'bg-green-600',  descKey: 'workflow_step_decide_desc' },
]





const GOV_SOURCES = [


  { label: 'GSTN',            color: 'bg-blue-50 text-blue-700 border-blue-200' },


  { label: 'Udyam / MSME',   color: 'bg-purple-50 text-purple-700 border-purple-200' },


  { label: 'PAN / IT',       color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },


  { label: 'MCA21 (CIN)',    color: 'bg-slate-50 text-slate-700 border-slate-200' },


  { label: 'DigiLocker',     color: 'bg-teal-50 text-teal-700 border-teal-200' },


  { label: 'EPFO',           color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },


  { label: 'ESIC',           color: 'bg-sky-50 text-sky-700 border-sky-200' },


  { label: 'BIS / MII',     color: 'bg-green-50 text-green-700 border-green-200' },


]





export default function Dashboard() {


  const [data, setData] = useState(null)


  const [loading, setLoading] = useState(true)


  const [actionCounts, setActionCounts] = useState(null)


  const navigate = useNavigate()


  const { t } = useLanguage()





  useEffect(() => {


    getDashboard()


      .then((res) => setData(res.data))


      .catch(console.error)


      .finally(() => setLoading(false))





    // Load action counts from various sources


    Promise.all([


      api.get('/officer/bids?tender_id=GEM-DEMO-2026-001').catch(() => ({ data: [] })),


      api.get('/officer/clarifications').catch(() => ({ data: [] })),


      api.get('/grievances').catch(() => ({ data: [] })),


    ]).then(([bidsRes, clrRes, grvRes]) => {


      const bids = bidsRes.data || []


      const clrs = clrRes.data || []


      const grvs = grvRes.data || []


      setActionCounts({


        bids_awaiting_scrutiny: bids.filter(b => b.status === 'SUBMITTED' || b.status === 'UNDER_INITIAL_SCRUTINY').length,


        emd_pending: bids.filter(b => !b.emd_verification && b.status !== 'DRAFT' && b.quoted_price > 0).length,


        tech_eval_pending: bids.filter(b => b.status === 'TECHNICAL_EVALUATION').length,


        clarifications_pending: clrs.filter(c => c.status === 'PENDING_OFFICER').length,


        high_risk_bids: bids.filter(b => b.risk_level === 'HIGH').length,


        tampering_alerts: bids.filter(b => b.financial_bid_opened === false && b.quoted_price > 0).length,


        grievances_open: grvs.filter(g => g.status === 'SUBMITTED' || g.status === 'UNDER_REVIEW').length,


      })


    }).catch(() => {})


  }, [])





  if (loading) return <PageLoader />


  if (!data) return <div className="p-6 text-red-500">Failed to load dashboard data.</div>





  const { stats, compliance_chart, score_distribution, recent_activity } = data





  const statCards = [


    { label: t('active_tenders'), value: stats.active_tenders, icon: FileText, color: 'text-blue-700', bg: 'bg-blue-50', path: '/tenders' },


    { label: t('bids_analyzed'), value: stats.bids_analyzed, icon: Users, color: 'text-purple-700', bg: 'bg-purple-50', path: '/bidders' },


    { label: t('documents_processed'), value: (stats.documents_processed || 0).toLocaleString(), icon: FolderOpen, color: 'text-teal-700', bg: 'bg-teal-50', path: '/documents' },


    { label: t('avg_compliance'), value: `${stats.avg_compliance}%`, icon: TrendingUp, color: 'text-green-700', bg: 'bg-green-50', path: '/bidders' },


  ]





  const pieData = [


    { name: t('compliant_label'), value: score_distribution.VERIFIED },


    { name: t('review_label'), value: score_distribution.NEEDS_REVIEW },


    { name: t('non_compliant_label'), value: score_distribution.NON_COMPLIANT },


  ]





  const activityIcons = {


    success: <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />,


    warning: <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />,


    error:   <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />,


  }





  // Action widgets


  const actionWidgets = actionCounts ? [


    { label: t('bids_awaiting_scrutiny'), value: actionCounts.bids_awaiting_scrutiny, icon: Package, color: 'text-blue-700', bg: 'bg-blue-50', path: '/bid-comparison', urgent: actionCounts.bids_awaiting_scrutiny > 0 },


    { label: t('emd_verification_pending'), value: actionCounts.emd_pending, icon: IndianRupee, color: 'text-amber-700', bg: 'bg-amber-50', path: '/bid-comparison', urgent: actionCounts.emd_pending > 0 },


    { label: t('technical_evaluation'), value: actionCounts.tech_eval_pending, icon: BarChart2, color: 'text-purple-700', bg: 'bg-purple-50', path: '/bid-comparison', urgent: false },


    { label: t('clarifications_pending_action'), value: actionCounts.clarifications_pending, icon: MessageSquare, color: 'text-orange-700', bg: 'bg-orange-50', path: '/bidders', urgent: actionCounts.clarifications_pending > 0 },


    { label: t('high_risk_bids'), value: actionCounts.high_risk_bids, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50', path: '/bid-comparison', urgent: actionCounts.high_risk_bids > 0 },


    { label: t('open_grievances'), value: actionCounts.grievances_open, icon: MessageSquare, color: 'text-rose-700', bg: 'bg-rose-50', path: '/grievances', urgent: actionCounts.grievances_open > 0 },


  ] : []





  return (


    <div className="p-6 space-y-5 max-w-full">


      {/* Header */}


      <div className="flex items-center justify-between">


        <div>


          <div className="flex items-center gap-2 mb-0.5">


            <h1 className="page-title">Veritas AI</h1>


            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5" style={{ borderRadius: '2px' }}>SIH 2026 · #26100</span>


          </div>


          <p className="text-sm text-gray-500">


            Evidence-Driven Bid Compliance Intelligence · GEM-DEMO-2026-001 · <span className="font-medium text-slate-600">Team Aevora</span>


          </p>


        </div>


        <button className="btn-primary" onClick={() => navigate('/tenders/GEM-DEMO-2026-001')}>


          View Active Tender <ArrowRight size={15} />


        </button>


      </div>





      {/* Action Required Widgets */}


      {actionCounts && actionWidgets.some(w => w.value > 0) && (


        <div className="card p-4">


          <div className="flex items-center gap-2 mb-3">


            <AlertCircle size={14} className="text-amber-600" />


            <h2 className="text-sm font-semibold text-slate-700">{t('actions_required')}</h2>


          </div>


          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">


            {actionWidgets.map((w) => {


              const Icon = w.icon


              return (


                <div key={w.label}


                  className={`p-3 text-center cursor-pointer transition-all hover:shadow-sm ${w.urgent && w.value > 0 ? 'border-2 border-amber-400 bg-amber-50' : 'bg-gray-50 border border-gray-100'}`}


                  style={{ borderRadius: '2px' }}


                  onClick={() => navigate(w.path)}>


                  <div className={`w-7 h-7 mx-auto mb-1.5 flex items-center justify-center ${w.bg}`} style={{ borderRadius: '2px' }}>


                    <Icon size={13} className={w.color} />


                  </div>


                  <p className={`text-xl font-bold ${w.value > 0 ? w.color : 'text-gray-300'}`}>{w.value}</p>


                  <p className="text-[9px] text-gray-500 leading-tight mt-0.5">{w.label}</p>


                </div>


              )


            })}


          </div>


        </div>


      )}





      {/* Veritas AI 7-Step Workflow */}


      <div className="card p-5">


        <div className="flex items-center justify-between mb-4">


          <h2 className="text-sm font-semibold text-slate-700">{t('how_it_works')}</h2>


          <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{t('tagline')}</span>


        </div>


        <div className="flex items-start gap-0 overflow-x-auto pb-1">


          {WORKFLOW_STEP_KEYS.map((step, idx) => {


            const Icon = step.icon


            return (


              <div key={step.num} className="flex items-center flex-shrink-0">


                <div className="flex flex-col items-center gap-1.5 w-24">


                  <div className={`w-10 h-10 ${step.color} rounded-full flex items-center justify-center shadow-sm`}>


                    <Icon size={16} className="text-white" />


                  </div>


                  <span className="text-[9px] font-bold text-gray-400">{step.num}</span>


                  <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{t(step.labelKey)}</span>


                  <span className="text-[9px] text-gray-400 text-center leading-tight">{t(step.descKey)}</span>


                </div>


                {idx < WORKFLOW_STEP_KEYS.length - 1 && (


                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0 -mx-1 mt-[-20px]" />


                )}


              </div>


            )


          })}


        </div>


      </div>





      {/* Stat Cards */}


      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">


        {statCards.map((card) => {


          const Icon = card.icon


          return (


            <div key={card.label} className="stat-card cursor-pointer hover:shadow-md transition-shadow"


              onClick={() => card.path && navigate(card.path)}>


              <div className="flex items-start justify-between">


                <div>


                  <p className="text-xs text-gray-500 font-medium">{card.label}</p>


                  <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>


                </div>


                <div className={`p-2 ${card.bg}`} style={{ borderRadius: '2px' }}>


                  <Icon className={card.color} size={18} />


                </div>


              </div>


            </div>


          )


        })}


      </div>





      {/* Charts Row */}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">


        <div className="card p-5 lg:col-span-2">


          <h2 className="text-sm font-semibold text-slate-700 mb-4">{t('compliance_digital_twin')}</h2>


          <ResponsiveContainer width="100%" height={200}>


            <BarChart data={compliance_chart} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>


              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />


              <XAxis dataKey="name" tick={{ fontSize: 11 }} />


              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />


              <Tooltip formatter={(v) => [`${v}%`, 'Compliance Score']} contentStyle={{ fontSize: 12, borderRadius: 4 }} />


              <Bar dataKey="score" radius={[2, 2, 0, 0]}>


                {compliance_chart.map((entry) => (


                  <Cell key={entry.name} fill={entry.score >= 85 ? '#16a34a' : entry.score >= 70 ? '#d97706' : '#dc2626'} />


                ))}


              </Bar>


            </BarChart>


          </ResponsiveContainer>


        </div>


        <div className="card p-5">


          <h2 className="text-sm font-semibold text-slate-700 mb-4">{t('risk_distribution')}</h2>


          <ResponsiveContainer width="100%" height={200}>


            <PieChart>


              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">


                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}


              </Pie>


              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />


              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />


            </PieChart>


          </ResponsiveContainer>


        </div>


      </div>





      {/* Government Verification Layer */}


      <div className="card p-5">


        <div className="flex items-center justify-between mb-3">


          <div>


            <h2 className="text-sm font-semibold text-slate-700">{t('government_verification_layer')}</h2>


            <p className="text-xs text-gray-400 mt-0.5">{t('api_setu_adapters')}</p>


          </div>


          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 font-semibold" style={{ borderRadius: '2px' }}>


            {t('demo_mode_simulated')}


          </span>


        </div>


        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">


          {GOV_SOURCES.map((src) => (


            <div key={src.label} className={`border p-2.5 text-center ${src.color}`} style={{ borderRadius: '2px' }}>


              <CheckCircle size={12} className="mx-auto mb-1 opacity-70" />


              <p className="text-[10px] font-semibold leading-tight">{src.label}</p>


              <p className="text-[9px] opacity-60 mt-0.5">{t('simulated')}</p>


            </div>


          ))}


        </div>


        <p className="text-[10px] text-gray-400 mt-2.5 flex items-center gap-1.5">


          <Shield size={10} className="text-blue-500" />


          {t('in_production_note')}


        </p>


      </div>





      {/* Bottom Row */}


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">


        <div className="card p-5">


          <div className="flex items-center justify-between mb-4">


            <h2 className="text-sm font-semibold text-slate-700">{t('recent_activity')}</h2>


            <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/audit')}>{t('view_all')}</button>


          </div>


          <div className="space-y-3">


            {(recent_activity || []).slice(0, 5).map((item, idx) => (


              <div key={item.id || idx}


                className="flex items-start gap-3 p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"


                style={{ borderRadius: '2px' }}


                onClick={() => item.bidder && navigate(`/bidders/${item.bidder}/compliance`)}>


                {activityIcons[item.type] || activityIcons.success}


                <div className="flex-1 min-w-0">


                  <p className="text-sm font-medium text-slate-700 truncate">{item.action}</p>


                  <p className="text-xs text-gray-500 truncate">{item.detail || item.bidder}</p>


                </div>


                <span className="text-[10px] text-gray-400 flex-shrink-0 flex items-center gap-0.5 mt-0.5">


                  <Clock size={10} />


                  {item.time ? new Date(item.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}


                </span>


              </div>


            ))}


            {(!recent_activity || recent_activity.length === 0) && (


              <p className="text-sm text-gray-400 text-center py-4">{t('no_recent_activity')}</p>


            )}


          </div>


        </div>





        <div className="card p-5">


          <h2 className="text-sm font-semibold text-slate-700 mb-4">{t('active_tender')}</h2>


          <div className="border border-blue-100 bg-blue-50 p-4 cursor-pointer hover:bg-blue-100 transition-colors"


            style={{ borderRadius: '2px' }}


            onClick={() => navigate('/tenders/GEM-DEMO-2026-001')}>


            <div className="flex items-start justify-between gap-2">


              <div>


                <p className="text-xs text-blue-600 font-semibold">GEM-DEMO-2026-001</p>


                <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-snug">


                  Supply and Installation of Industrial IoT Monitoring Equipment


                </p>


                <p className="text-xs text-gray-500 mt-1">Government Industrial Procurement Division</p>


              </div>


              <ArrowRight size={16} className="text-blue-600 flex-shrink-0 mt-1" />


            </div>


            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-blue-200">


              <div className="text-center"><p className="text-lg font-bold text-blue-700">3</p><p className="text-[10px] text-gray-500">{t('bidders')}</p></div>


              <div className="text-center"><p className="text-lg font-bold text-blue-700">20</p><p className="text-[10px] text-gray-500">{t('requirements')}</p></div>


              <div className="text-center"><p className="text-lg font-bold text-blue-700">₹4.8Cr</p><p className="text-[10px] text-gray-500">{t('est_value')}</p></div>


              <div className="text-center"><p className="text-xs font-semibold text-amber-600">30 Sep 2026</p><p className="text-[10px] text-gray-500">{t('deadline')}</p></div>


            </div>


          </div>


          {/* Quick links to new features */}


          <div className="grid grid-cols-3 gap-2 mt-3">


            {[


              { label: t('committee'), path: '/tenders/GEM-DEMO-2026-001/committee' },


              { label: t('grievances'), path: '/grievances' },


              { label: t('reverse_auction'), path: '/tenders/GEM-DEMO-2026-001/reverse-auction' },


            ].map(({ label, path }) => (


              <button key={label} onClick={() => navigate(path)}


                className="text-[10px] py-1.5 text-blue-600 font-semibold bg-blue-50 hover:bg-blue-100 transition-colors text-center"


                style={{ borderRadius: '2px' }}>


                {label}


              </button>


            ))}


          </div>


        </div>


      </div>


    </div>


  )


}


