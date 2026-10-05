import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck, ChevronRight, CheckCircle, Clock,
  AlertTriangle, XCircle, Plus, RefreshCw, ArrowRight, User
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const STATUS_CONFIG = {
  NOT_STARTED: { label: 'Not Started', color: 'text-gray-500 bg-gray-100 border-gray-200', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: RefreshCw },
  BLOCKED: { label: 'Blocked', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
  COMPLETED: { label: 'Completed', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
  SUBMITTED: { label: 'Submitted', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: CheckCircle },
}

const TASK_TYPE_COLORS = {
  DOCUMENT_VERIFICATION: 'bg-blue-100 text-blue-700',
  TECHNICAL_EVALUATION: 'bg-purple-100 text-purple-700',
  FINANCIAL_EVALUATION: 'bg-green-100 text-green-700',
  COMPLIANCE_REVIEW: 'bg-teal-100 text-teal-700',
}

export default function EvaluationTasks() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [updating, setUpdating] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/evaluation/tasks?tender_id=GEM-DEMO-2026-001')
      .then((res) => setTasks(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (taskId, newStatus) => {
    setUpdating(taskId)
    try {
      await api.put(`/evaluation/tasks/${taskId}`, { status: newStatus })
      addToast('Task updated', 'success')
      load()
    } catch {
      addToast('Update failed', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const filtered = filter === 'ALL' ? tasks : tasks.filter((t) => t.status === filter)

  const counts = {
    NOT_STARTED: tasks.filter((t) => t.status === 'NOT_STARTED').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    BLOCKED: tasks.filter((t) => t.status === 'BLOCKED').length,
    COMPLETED: tasks.filter((t) => t.status === 'COMPLETED').length,
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Evaluation Tasks</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Evaluation Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">GEM-DEMO-2026-001 · {tasks.length} total tasks</p>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(counts).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status]
          const Icon = cfg?.icon || Clock
          return (
            <div
              key={status}
              className={`border rounded-xl p-3 text-center cursor-pointer transition-all ${filter === status ? 'ring-2 ring-blue-500' : 'hover:shadow-sm'} ${cfg?.color || ''}`}
              onClick={() => setFilter(filter === status ? 'ALL' : status)}
            >
              <Icon size={14} className="mx-auto mb-1" />
              <p className="text-xl font-bold">{count}</p>
              <p className="text-[9px] font-medium">{cfg?.label}</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filter === s ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {s === 'ALL' ? 'All Tasks' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <ClipboardCheck size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tasks found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => {
            const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.NOT_STARTED
            const Icon = cfg.icon
            const typeColor = TASK_TYPE_COLORS[task.task_type] || 'bg-gray-100 text-gray-600'

            return (
              <div key={task.id} className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">{task.id}</span>
                      <span className={`status-badge text-[10px] border ${cfg.color}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                      <span className={`status-badge text-[10px] ${typeColor}`}>
                        {task.task_type?.replace('_', ' ')}
                      </span>
                      <span className={`status-badge text-[10px] ${task.priority === 'HIGH' ? 'bg-red-50 text-red-700 border border-red-200' : task.priority === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                        {task.priority}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">{task.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><User size={10} />{task.assigned_to}</span>
                      {task.due_date && (
                        <span>Due: {new Date(task.due_date).toLocaleDateString('en-IN')}</span>
                      )}
                      {task.completed_at && (
                        <span className="text-green-600">Completed: {new Date(task.completed_at).toLocaleDateString('en-IN')}</span>
                      )}
                    </div>
                    {task.comments && (
                      <p className="text-xs text-gray-500 mt-1.5 italic">{task.comments}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      className="btn-secondary text-xs py-1.5"
                      onClick={() => navigate(`/bidders/${task.bidder_id}/compliance`)}
                    >
                      View Compliance
                    </button>
                    {task.status !== 'COMPLETED' && (
                      <select
                        value={task.status}
                        disabled={updating === task.id}
                        onChange={(e) => updateStatus(task.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-600 focus:outline-none"
                      >
                        <option value="NOT_STARTED">Not Started</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="BLOCKED">Blocked</option>
                        <option value="COMPLETED">Complete</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
