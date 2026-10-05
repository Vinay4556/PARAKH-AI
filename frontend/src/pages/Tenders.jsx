import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ArrowRight, Calendar, Building2, IndianRupee, Users, Plus } from 'lucide-react'
import { getTenders } from '../services/api.js'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function Tenders() {
  const [tenders, setTenders] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useLanguage()

  useEffect(() => {
    getTenders()
      .then((res) => setTenders(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('tenders')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('tenders_subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/tenders/new')}>
          <Plus size={14} /> {t('create_tender')}
        </button>
      </div>

      <div className="space-y-4">
        {tenders.map((tender) => (
          <div
            key={tender.id}
            className="card p-5 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/tenders/${tender.id}`)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {tender.id}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    tender.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tender.status?.toUpperCase()}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-slate-800 leading-snug">{tender.title}</h2>
                <div className="flex flex-wrap items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Building2 size={12} /> {tender.department}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <IndianRupee size={12} /> {tender.estimated_value_display}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar size={12} /> {t('deadline')}: {new Date(tender.submission_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-center hidden sm:block">
                  <p className="text-xl font-bold text-blue-700">{tender.total_requirements}</p>
                  <p className="text-[10px] text-gray-500">{t('requirements')}</p>
                </div>
                <div className="text-center hidden sm:block">
                  <p className="text-xl font-bold text-purple-700">{tender.bidder_count}</p>
                  <p className="text-[10px] text-gray-500">{t('bidders')}</p>
                </div>
                <ArrowRight size={18} className="text-gray-400" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
