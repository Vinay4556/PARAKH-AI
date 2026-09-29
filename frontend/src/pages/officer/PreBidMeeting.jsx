/**
 * PreBidMeeting.jsx — Officer schedules pre-bid meeting, manages Q&A, publishes answers.
 */
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Calendar, MessageSquare, CheckCircle,
  RefreshCw, Plus, Users, Globe, MapPin, Send
} from 'lucide-react'
import { getPreBid, schedulePreBid, answerPreBidQuestion } from '../../services/api.js'
import { useToast } from '../../components/Toast.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'

export default function PreBidMeeting() {
  const { tenderId } = useParams()
  const tid = tenderId || 'GEM-DEMO-2026-001'
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [prebid, setPrebid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [answeringId, setAnsweringId] = useState(null)
  const [answers, setAnswers] = useState({})

  const [meetingForm, setMeetingForm] = useState({
    date: '', time: '11:00', mode: 'ONLINE',
    location: '', meeting_link: '', agenda: '',
    scheduled_by: 'Rajesh Kumar',
  })

  const load = () => {
    setLoading(true)
    getPreBid(tid)
      .then((res) => {
        setPrebid(res.data)
        if (res.data?.meeting) {
          const m = res.data.meeting
          setMeetingForm({
            date: m.date || '', time: m.time || '11:00', mode: m.mode || 'ONLINE',
            location: m.location || '', meeting_link: m.meeting_link || '',
            agenda: m.agenda || '', scheduled_by: m.scheduled_by || 'Rajesh Kumar',
          })
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tid])

  const handleSchedule = async () => {
    if (!meetingForm.date) { addToast('Date is required', 'warning'); return }
    setSavingMeeting(true)
    try {
      await schedulePreBid(tid, meetingForm)
      addToast('Pre-bid meeting scheduled', 'success')
      load()
    } catch { addToast('Failed to schedule meeting', 'error') }
    finally { setSavingMeeting(false) }
  }

  const handleAnswer = async (qId) => {
    const answer = answers[qId]
    if (!answer?.trim()) { addToast('Answer is required', 'warning'); return }
    setAnsweringId(qId)
    try {
      await answerPreBidQuestion(tid, qId, { answer, publish: true, answered_by: 'Rajesh Kumar' })
      addToast('Answer published', 'success')
      setAnswers((p) => { const n = { ...p }; delete n[qId]; return n })
      load()
    } catch { addToast('Failed to publish answer', 'error') }
    finally { setAnsweringId(null) }
  }

  if (loading) return <PageLoader />

  const questions = prebid?.questions || []
  const pending = questions.filter(q => q.status === 'PENDING')
  const answered = questions.filter(q => q.status === 'ANSWERED')

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tid}`)}>{tid}</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Pre-Bid Meeting</span>
      </div>

      <h1 className="page-title flex items-center gap-2"><Calendar size={18} className="text-blue-600" /> Pre-Bid Meeting</h1>

      {/* Meeting Schedule Form */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          {prebid?.meeting ? 'Meeting Scheduled' : 'Schedule Pre-Bid Meeting'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Date <span className="text-red-500">*</span></label>
            <input type="date" value={meetingForm.date} onChange={(e) => setMeetingForm(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Time</label>
            <input type="time" value={meetingForm.time} onChange={(e) => setMeetingForm(p => ({ ...p, time: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Mode</label>
            <select value={meetingForm.mode} onChange={(e) => setMeetingForm(p => ({ ...p, mode: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none bg-white" style={{ borderRadius: '2px' }}>
              <option value="ONLINE">Online</option>
              <option value="PHYSICAL">Physical</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>
          {meetingForm.mode !== 'ONLINE' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Physical Location</label>
              <input value={meetingForm.location} onChange={(e) => setMeetingForm(p => ({ ...p, location: e.target.value }))}
                placeholder="Venue address" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
            </div>
          )}
          {meetingForm.mode !== 'PHYSICAL' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Meeting Link</label>
              <input value={meetingForm.meeting_link} onChange={(e) => setMeetingForm(p => ({ ...p, meeting_link: e.target.value }))}
                placeholder="https://meet.gov.in/..." className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
            </div>
          )}
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Meeting Agenda</label>
            <textarea rows={2} value={meetingForm.agenda} onChange={(e) => setMeetingForm(p => ({ ...p, agenda: e.target.value }))}
              placeholder="Agenda items for the pre-bid meeting…"
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none" style={{ borderRadius: '2px' }} />
          </div>
        </div>
        <button className="btn-primary mt-4 text-xs" onClick={handleSchedule} disabled={savingMeeting}>
          {savingMeeting ? <><RefreshCw size={12} className="animate-spin" /> Saving…</> : <><Calendar size={12} /> {prebid?.meeting ? 'Update Meeting' : 'Schedule Meeting'}</>}
        </button>
      </div>

      {/* Pending Questions */}
      {pending.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <MessageSquare size={14} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-700">Pending Questions ({pending.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map((q) => (
              <div key={q.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-[10px] text-gray-400 font-mono">{q.id}</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{q.question}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{q.category} · {q.submitted_at ? new Date(q.submitted_at).toLocaleDateString('en-IN') : ''}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <textarea rows={2} value={answers[q.id] || ''} onChange={(e) => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                    placeholder="Official answer (will be published to all bidders)…"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" style={{ borderRadius: '2px' }} />
                  <button className="btn-primary text-xs self-end" onClick={() => handleAnswer(q.id)} disabled={answeringId === q.id}>
                    {answeringId === q.id ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                    Publish
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answered Q&A */}
      {answered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle size={14} className="text-green-600" />
            <h2 className="text-sm font-semibold text-slate-700">Published Q&amp;A ({answered.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {answered.map((q) => (
              <div key={q.id} className="p-4">
                <p className="text-sm font-semibold text-slate-800">Q: {q.question}</p>
                <div className="mt-2 p-3 bg-green-50 border border-green-200" style={{ borderRadius: '2px' }}>
                  <p className="text-[10px] font-bold text-green-600 uppercase mb-1">Official Answer</p>
                  <p className="text-sm text-green-800">{q.answer}</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Answered by {q.answered_by} · {q.answered_at ? new Date(q.answered_at).toLocaleDateString('en-IN') : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {questions.length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No pre-bid questions received yet.</p>
        </div>
      )}
    </div>
  )
}
