import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, X, CheckCircle, AlertTriangle,
  ChevronRight, RefreshCw, Trash2, FolderOpen,
  ClipboardList, Tag, Building2, ShieldCheck, ShieldAlert, Info, XCircle
} from 'lucide-react'
import {
  uploadDocuments, getTenders, getTenderBidders,
  getBidderDocuments, deleteDocument, getTenderRequirements,
  checkDuplicateDocument, reprocessDocument
} from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.docx']

const TYPE_COLORS = {
  GST: 'bg-blue-100 text-blue-700',
  PAN: 'bg-indigo-100 text-indigo-700',
  UDYAM: 'bg-purple-100 text-purple-700',
  ISO9001: 'bg-teal-100 text-teal-700',
  ISO27001: 'bg-teal-100 text-teal-700',
  FINANCIAL: 'bg-green-100 text-green-700',
  OEM: 'bg-orange-100 text-orange-700',
  EPFO: 'bg-cyan-100 text-cyan-700',
  ESIC: 'bg-sky-100 text-sky-700',
  EXPERIENCE: 'bg-amber-100 text-amber-700',
  DECLARATION: 'bg-rose-100 text-rose-700',
  BIS_CE: 'bg-lime-100 text-lime-700',
  NABL: 'bg-pink-100 text-pink-700',
  INCORPORATION: 'bg-violet-100 text-violet-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function Documents() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { user } = useAuth()
  const { t } = useLanguage()
  const [bidders, setBidders] = useState([])
  const [selectedBidder, setSelectedBidder] = useState(
    user?.role === 'BIDDER' ? (user?.organization_id || 'BID-SUB-001') : 'BID-SUB-001'
  )
  const [tenders, setTenders] = useState([])
  const [selectedTender, setSelectedTender] = useState('')
  const [requirements, setRequirements] = useState([])
  const [selectedRequirement, setSelectedRequirement] = useState('')
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [existingDocs, setExistingDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [duplicateWarnings, setDuplicateWarnings] = useState([]) // [{filename, docType, existingDoc}]
  const [rejectedUploads, setRejectedUploads] = useState([]) // [{filename, message, existingDoc}] — hard backend rejections (e.g. duplicate PAN)
  const [reprocessingId, setReprocessingId] = useState(null)
  const [autoVerification, setAutoVerification] = useState(null) // bidder-level gov verification run after upload
  const fileRef = useRef()

  // Load tenders + bidders on mount
  useEffect(() => {
    getTenders()
      .then((res) => {
        const loadedTenders = res.data || []
        setTenders(loadedTenders)
        if (loadedTenders.length > 0) {
          setSelectedTender(loadedTenders[0].id)
          return getTenderBidders(loadedTenders[0].id).then((bRes) => {
            const loaded = bRes.data || []
            if (loaded.length > 0) {
              setBidders(loaded)
              if (user?.role !== 'BIDDER') setSelectedBidder(loaded[0].id)
            } else {
              setFallbackBidders()
            }
          })
        }
      })
      .catch(() => setFallbackBidders())
  }, [])

  const setFallbackBidders = () => {
    // UI safety-net only — shown when the tender/bidder API is unavailable.
    // BID-SUB-001/002/003 are the known demo bidders. Real bidders registered via
    // the form will appear once the API is reachable again.
    // BID-SUB-004 is intentionally excluded: it was a test registration with
    // placeholder data that has been cleaned from the data layer.
    setBidders([
      { id: 'BID-SUB-001', name: 'ABC Technologies Pvt Ltd' },
      { id: 'BID-SUB-002', name: 'Bharat Industrial Systems Pvt Ltd' },
      { id: 'BID-SUB-003', name: 'Nova Engineering Solutions Pvt Ltd' },
    ])
  }

  // Load requirements when tender changes
  useEffect(() => {
    if (!selectedTender) return
    getTenderRequirements(selectedTender)
      .then((res) => {
        setRequirements(res.data || [])
        setSelectedRequirement('')
      })
      .catch(() => setRequirements([]))
  }, [selectedTender])

  // Load existing docs whenever selected bidder changes
  useEffect(() => {
    if (!selectedBidder) return
    setLoadingDocs(true)
    getBidderDocuments(selectedBidder)
      .then((res) => {
        // getBidderDocuments already returns only uploaded docs (saved_path present)
        // — the backend filters out demo seed documents server-side.
        setExistingDocs(res.data || [])
      })
      .catch(() => setExistingDocs([]))
      .finally(() => setLoadingDocs(false))
  }, [selectedBidder])

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return
    setDeletingId(docId)
    try {
      await deleteDocument(docId)
      setExistingDocs((prev) => prev.filter((d) => d.id !== docId))
      setResults((prev) => prev.filter((r) => r.id !== docId))
      showToast(`"${filename}" deleted successfully.`, 'success')
    } catch {
      showToast(`Failed to delete "${filename}".`, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleReprocess = async (docId, filename) => {
    setReprocessingId(docId)
    try {
      const res = await reprocessDocument(docId)
      const updated = res.data
      setExistingDocs((prev) => prev.map((d) =>
        d.id === docId
          ? { ...d, classification: updated.classification, confidence: updated.confidence, extracted_entities: updated.extracted_entities, gov_verification: updated.gov_verification }
          : d
      ))
      showToast(`"${filename}" reprocessed — classified as ${updated.classification} (${Math.round(updated.confidence * 100)}%)`, 'success')
    } catch {
      showToast(`Failed to reprocess "${filename}".`, 'error')
    } finally {
      setReprocessingId(null)
    }
  }

  const validateFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) return `Unsupported format: ${file.name}`
    if (file.size > 20 * 1024 * 1024) return `File too large (max 20MB): ${file.name}`
    return null
  }

  // Quick client-side doc type guess from filename (before upload)
  const guessDocType = (filename) => {
    const f = filename.toUpperCase()
    if (f.includes('PAN') || f.includes('PERMANENT ACCOUNT')) return 'PAN'
    if (f.includes('GST') || f.includes('GSTIN')) return 'GST'
    if (f.includes('UDYAM') || f.includes('MSME')) return 'UDYAM'
    if (f.includes('ISO') && f.includes('9001')) return 'ISO9001'
    if (f.includes('ISO') && f.includes('27001')) return 'ISO27001'
    if (f.includes('EPFO') || f.includes('PF')) return 'EPFO'
    if (f.includes('ESIC') || f.includes('ESI')) return 'ESIC'
    if (f.includes('OEM')) return 'OEM'
    if (f.includes('INCORP') || f.includes('MOA') || f.includes('AOA')) return 'INCORPORATION'
    if (f.includes('BIS') || f.includes('CE CERT')) return 'BIS_CE'
    if (f.includes('NABL')) return 'NABL'
    return null
  }

  const addFiles = useCallback(async (newFiles) => {
    const errors = []
    const valid  = []
    newFiles.forEach((f) => {
      const err = validateFile(f)
      if (err) errors.push(err)
      else valid.push(f)
    })
    if (errors.length) showToast(errors[0], 'error')

    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !names.has(f.name))]
    })

    // Check each new file for duplicates against existing uploaded docs
    const warnings = []
    for (const f of valid) {
      const guessed = guessDocType(f.name)
      if (!guessed || !selectedBidder) continue
      try {
        const res = await checkDuplicateDocument(selectedBidder, guessed, selectedRequirement || '')
        if (res.data?.duplicate) {
          warnings.push({
            filename:    f.name,
            docType:     guessed,
            existingDoc: res.data.existing_doc,
          })
        }
      } catch { /* silent */ }
    }
    if (warnings.length > 0) {
      setDuplicateWarnings((prev) => {
        const names = new Set(prev.map(w => w.filename))
        return [...prev, ...warnings.filter(w => !names.has(w.filename))]
      })
    }
  }, [selectedBidder, selectedRequirement])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const handleUpload = async () => {
    if (files.length === 0) { showToast('Please add at least one file.', 'warning'); return }
    if (!selectedTender)    { showToast('Please select a tender first.', 'warning'); return }
    setUploading(true)
    setRejectedUploads([])
    showToast(`Uploading ${files.length} document${files.length > 1 ? 's' : ''}…`, 'info')
    try {
      const res = await uploadDocuments(selectedBidder, files, selectedTender, selectedRequirement || null)
      const uploaded = res.data?.results || []
      setResults(uploaded)
      // Store the bidder-level gov verification that runs automatically after upload
      if (res.data?.gov_verification) {
        setAutoVerification(res.data.gov_verification)
      }

      // Surface any per-file rejections from a mixed batch (e.g. one PAN among several files)
      const batchErrors = (res.data?.errors || []).filter((e) => e.error_code === 'PAN_ALREADY_EXISTS')
      if (batchErrors.length > 0) {
        setRejectedUploads(batchErrors.map((e) => ({
          filename: e.filename, message: e.error, existingDoc: e.existing_doc,
        })))
      }

      const successCount = res.data?.total_uploaded ?? uploaded.length
      if (successCount > 0) {
        showToast(`${successCount} document${successCount > 1 ? 's' : ''} processed successfully`, 'success')
      }
      setFiles([])
      setDuplicateWarnings([])
      getBidderDocuments(selectedBidder)
        .then((r) => setExistingDocs((r.data || []).filter((d) => d.saved_path)))
        .catch(() => {})
    } catch (err) {
      // A 409 with error_code PAN_ALREADY_EXISTS means every file in this request
      // was rejected outright (most common single-file "upload my PAN" case) —
      // nothing was saved, so keep the files selected and show a persistent reason.
      if (err.status === 409 && err.data?.error_code === 'PAN_ALREADY_EXISTS') {
        setRejectedUploads([{
          filename: files.map((f) => f.name).join(', '),
          message: err.data.error,
          existingDoc: err.data.existing_doc,
        }])
      }
      showToast(err.message || 'Upload failed. Please try again.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const bidderName = bidders.find((b) => b.id === selectedBidder)?.name || selectedBidder
  const isOfficer = user?.role === 'OFFICER'

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span
          className="hover:text-blue-600 cursor-pointer"
          onClick={() => navigate(isOfficer ? '/' : '/bidder/dashboard')}
        >
          Dashboard
        </span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">{t('documents')}</span>
      </div>

      <div>
        <h1 className="page-title">{t('upload_documents')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t('upload_subtitle')}
        </p>
      </div>

      {/* Tender + Requirement Selector */}
      <div className="card p-5 space-y-4">
        {/* Tender selector */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Building2 size={14} className="text-blue-600" /> Select Tender
          </label>
          {tenders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {tenders.map((t) => (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedTender === t.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => { setSelectedTender(t.id); setSelectedRequirement('') }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-700">{t.id}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{t.status?.toUpperCase()}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5 leading-tight line-clamp-2">{t.title}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Deadline: {t.submission_deadline}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No active tenders found.</p>
          )}
        </div>

        {/* Requirement selector */}
        {requirements.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <ClipboardList size={14} className="text-purple-600" />
              Which requirement does this document satisfy?
              <span className="text-[10px] text-gray-400 font-normal">(optional — helps with compliance tracking)</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {/* "General / Multiple" option */}
              <div
                className={`p-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedRequirement === ''
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedRequirement('')}
              >
                <p className="text-xs font-semibold text-slate-600">📋 General / Multiple requirements</p>
                <p className="text-[10px] text-gray-400 mt-0.5">AI will auto-classify</p>
              </div>

              {requirements.map((req) => (
                <div
                  key={req.id}
                  className={`p-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedRequirement === req.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedRequirement(req.id)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 leading-tight">{req.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {req.required_evidence?.join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        req.mandatory
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>{req.mandatory ? 'MANDATORY' : 'OPTIONAL'}</span>
                      <span className="text-[9px] text-gray-400">{req.category}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bidder Selector — officers only */}
      {isOfficer && bidders.length > 0 && (
        <div className="card p-5">
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('select_bidder')}</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bidders.map((b) => (
              <div
                key={b.id}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedBidder === b.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setSelectedBidder(b.id); setResults([]); setAutoVerification(null) }}
              >
                <p className="text-xs font-bold text-blue-700">{b.id}</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5 leading-tight">{b.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.docx"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files))}
        />
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
          dragOver ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          <Upload size={26} className={dragOver ? 'text-blue-600' : 'text-gray-400'} />
        </div>
        <p className="text-sm font-semibold text-slate-700">
          {dragOver ? 'Drop files here' : 'Drag & drop documents here'}
        </p>
        <p className="text-xs text-gray-500 mt-1">or click to browse</p>
        <p className="text-[10px] text-gray-400 mt-2">PDF · PNG · JPG · DOCX · Max 20MB per file</p>
      </div>

      {/* File Queue */}
      {files.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">
              {files.length} {t('files_ready')}
            </h2>
            <button
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
              onClick={() => { setFiles([]); setDuplicateWarnings([]) }}
            >
              <Trash2 size={12} /> {t('clear_all')}
            </button>
          </div>

          {/* Hard rejections — e.g. duplicate PAN, blocked by the backend */}
          {rejectedUploads.length > 0 && (
            <div className="mb-3 space-y-2">
              {rejectedUploads.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-300 rounded-xl">
                  <XCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-red-800">PAN document already exists</p>
                    <p className="text-[11px] text-red-700 mt-0.5">{r.message}</p>
                    {r.existingDoc?.filename && (
                      <p className="text-[10px] text-red-600 mt-1">
                        Existing PAN on file: <span className="font-semibold">"{r.existingDoc.filename}"</span>
                        {r.existingDoc.uploaded_at && ` — uploaded ${new Date(r.existingDoc.uploaded_at).toLocaleDateString('en-IN')}`}.
                        {' '}Delete it first from the documents list below if you need to replace it.
                      </p>
                    )}
                  </div>
                  <button
                    className="text-[10px] text-red-700 hover:text-red-900 font-semibold flex-shrink-0"
                    onClick={() => setRejectedUploads((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Duplicate warnings */}
          {duplicateWarnings.length > 0 && (
            <div className="mb-3 space-y-2">
              {duplicateWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-300 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-800">
                      Duplicate {w.docType} document detected
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      <span className="font-semibold">"{w.filename}"</span> — a {w.docType} document already exists:
                      {' '}<span className="font-semibold">"{w.existingDoc?.filename}"</span>
                      {' '}uploaded on {w.existingDoc?.uploaded_at
                        ? new Date(w.existingDoc.uploaded_at).toLocaleDateString('en-IN')
                        : '—'}.
                    </p>
                    <p className="text-[10px] text-amber-600 mt-1">
                      {w.docType === 'PAN'
                        ? '⚠ PAN uploads are strictly one-per-bidder — this upload will be rejected. Delete the existing PAN document first if you need to replace it.'
                        : '⚠ Delete the existing document first, then upload the new one — or proceed to replace it.'}
                    </p>
                  </div>
                  <button
                    className="text-[10px] text-amber-700 hover:text-amber-900 font-semibold flex-shrink-0"
                    onClick={() => setDuplicateWarnings(prev => prev.filter((_, j) => j !== i))}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-400">{formatBytes(f.size)}</p>
                </div>
                <button
                  onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500 space-y-0.5">
              <div>
                Bidder: <span className="font-semibold text-slate-700">{bidderName}</span>
              </div>
              <div>
                Tender: <span className="font-semibold text-slate-700">
                  {tenders.find(t => t.id === selectedTender)?.id || <span className="text-red-500">Not selected</span>}
                </span>
              </div>
              {selectedRequirement && (
                <div className="flex items-center gap-1">
                  <Tag size={9} className="text-purple-500" />
                  <span className="font-semibold text-purple-700">
                    {requirements.find(r => r.id === selectedRequirement)?.title || selectedRequirement}
                  </span>
                </div>
              )}
            </div>
            <button className="btn-primary" onClick={handleUpload} disabled={uploading || !selectedTender}>
              {uploading
                ? <><RefreshCw size={14} className="animate-spin" /> {t('analyzing')}…</>
                : <><Upload size={14} /> {t('analyze_documents')}</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Existing Uploaded Documents */}
      {(existingDocs.length > 0 || loadingDocs) && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-700">
                Uploaded Documents
                {existingDocs.length > 0 && (
                  <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                    {existingDocs.length}
                  </span>
                )}
              </h2>
            </div>
            <span className="text-xs text-gray-400">{bidderName}</span>
          </div>

          {loadingDocs ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <RefreshCw size={13} className="animate-spin" /> Loading documents…
            </div>
          ) : (
            <div className="space-y-2">
              {existingDocs.map((doc) => {
                const conf = Math.round((doc.confidence || 0) * 100)
                const typeColor = TYPE_COLORS[doc.classification] || TYPE_COLORS.UNKNOWN
                const isDeleting = deletingId === doc.id
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-white transition-colors">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{doc.filename}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {doc.pages} page{doc.pages !== 1 ? 's' : ''} ·{' '}
                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN') : ''}
                        {doc.tender_id && <span className="ml-2 text-blue-600 font-semibold">{doc.tender_id}</span>}
                        {doc.requirement_id && (
                          <span className="ml-1 text-purple-600 font-semibold">
                            · {requirements.find(r => r.id === doc.requirement_id)?.title || doc.requirement_id}
                          </span>
                        )}
                        {doc.tampered && <span className="ml-2 text-red-600 font-semibold">⚠ Tampered</span>}
                        {doc.suspicious && !doc.tampered && <span className="ml-2 text-amber-600 font-semibold">⚠ Suspicious</span>}
                      </p>
                    </div>
                    <span className={`status-badge text-[10px] flex-shrink-0 ${typeColor}`}>
                      {doc.classification || 'UNKNOWN'}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="w-10 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${conf >= 90 ? 'bg-green-500' : conf >= 70 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: `${conf}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-7">{conf}%</span>
                    </div>
                    <button
                      onClick={() => handleReprocess(doc.id, doc.filename)}
                      disabled={reprocessingId === doc.id}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                      title="Re-analyze document (re-run OCR + classification + gov verification)"
                    >
                      {reprocessingId === doc.id
                        ? <RefreshCw size={13} className="animate-spin text-blue-400" />
                        : <RefreshCw size={13} />
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id, doc.filename)}
                      disabled={isDeleting}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                      title="Delete document"
                    >
                      {isDeleting
                        ? <RefreshCw size={13} className="animate-spin text-red-400" />
                        : <Trash2 size={13} />
                      }
                    </button>                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Auto Gov Verification Summary — shown after upload completes */}
      {autoVerification && (
        <div className={`card p-4 border-l-4 ${
          autoVerification.overall_status === 'CLEAR'
            ? 'border-l-green-500 bg-green-50'
            : 'border-l-amber-500 bg-amber-50'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">{autoVerification.overall_status === 'CLEAR' ? '✅' : '⚠️'}</span>
              <p className="text-sm font-semibold text-slate-800">
                Government Verification — {autoVerification.overall_status === 'CLEAR' ? 'All Clear' : 'Issues Found'}
              </p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              autoVerification.overall_status === 'CLEAR'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {autoVerification.verified_count}/{autoVerification.total_checks} passed
            </span>
          </div>
          {autoVerification.mismatch_details && autoVerification.mismatch_details.length > 0 && (
            <div className="space-y-1 mb-2">
              {autoVerification.mismatch_details.map((m, i) => (
                <p key={i} className="text-xs text-red-700 flex items-start gap-1">
                  <span className="flex-shrink-0">⚠</span> {m}
                </p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            {(autoVerification.results || []).map((r, i) => (
              <div key={i} className={`p-2 rounded border text-xs ${
                r.verified
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : r.status === 'NOT_SUBMITTED'
                  ? 'bg-gray-50 border-gray-200 text-gray-500'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold">{r.adapter}</span>
                  <span>{r.verified ? '✓' : r.status === 'NOT_SUBMITTED' ? '—' : '✗'}</span>
                </div>
                <p className="text-[10px] mt-0.5 font-semibold">{r.status}</p>
                {r.identifier && <p className="text-[10px] font-mono mt-0.5 truncate">{r.identifier}</p>}
                {r.entity_name && <p className="text-[10px] mt-0.5 truncate">{r.entity_name}</p>}
                {(r.mismatch_flags || []).length > 0 && (
                  <p className="text-[10px] text-red-600 mt-0.5">{r.mismatch_flags[0]}</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Identifiers sourced from uploaded documents. Visit <strong>Gov. Verify</strong> for the full report.
          </p>
        </div>
      )}

      {/* Upload Results */}
      {results.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">{t('processing_results')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {results.length} {t('document')}{results.length > 1 ? 's' : ''} {t('classified')}
              </p>
            </div>
            <button
              className="btn-primary text-xs py-2"
              onClick={() =>
                navigate(isOfficer ? `/bidders/${selectedBidder}/compliance` : '/bidder/readiness')
              }
            >
              {isOfficer ? t('view_compliance') : t('check_readiness')} <ChevronRight size={13} />
            </button>
          </div>
          <div className="space-y-3">
            {results.map((r, i) => {
              const conf    = Math.round((r.confidence || 0) * 100)
              const typeColor = TYPE_COLORS[r.document_type] || TYPE_COLORS.UNKNOWN
              const gov     = r.gov_verification
              const entities = r.extracted_entities || {}
              return (
                <div key={i} className={`rounded-xl border p-4 ${
                  r.success ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100'
                }`}>
                  {/* Row 1 — filename + type badge + delete */}
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {r.success
                        ? <CheckCircle size={16} className="text-green-500" />
                        : <XCircle size={16} className="text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{r.filename}</p>
                      {r.error && <p className="text-[10px] text-red-500 mt-0.5">{r.error}</p>}
                    </div>
                    {r.success && (
                      <>
                        <span className={`status-badge text-[10px] flex-shrink-0 ${typeColor}`}>
                          {r.document_type}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="w-10 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${
                              conf >= 90 ? 'bg-green-500' : conf >= 70 ? 'bg-amber-500' : 'bg-red-400'
                            }`} style={{ width: `${conf}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-500 w-6">{conf}%</span>
                        </div>
                        {r.id && (
                          <button
                            onClick={() => handleDelete(r.id, r.filename)}
                            disabled={deletingId === r.id}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                          >
                            {deletingId === r.id
                              ? <RefreshCw size={13} className="animate-spin text-red-400" />
                              : <Trash2 size={13} />
                            }
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Row 1.5 — Duplicate document warning (server-confirmed by content classification, not filename) */}
                  {r.success && r.is_duplicate && r.duplicate_of && (
                    <div className="mt-2.5 rounded-lg px-3 py-2 flex items-start gap-2.5 bg-amber-50 border border-amber-200">
                      <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800">
                        A <strong>{r.document_type}</strong> document already exists for this bidder
                        (<strong>{r.duplicate_of.filename}</strong>, uploaded{' '}
                        {r.duplicate_of.uploaded_at ? new Date(r.duplicate_of.uploaded_at).toLocaleDateString('en-IN') : 'earlier'}).
                        This new upload has been added as a separate document — delete the outdated one below if this replaces it.
                      </p>
                    </div>
                  )}

                  {/* Row 2 — Extracted entities (PAN number, GSTIN, etc.) */}
                  {r.success && Object.keys(entities).length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {entities.pan && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                          PAN: {entities.pan}
                        </span>
                      )}
                      {entities.gstin && (
                        <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                          GSTIN: {entities.gstin}
                        </span>
                      )}
                      {entities.company_name && (
                        <span className="text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-semibold">
                          {entities.company_name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Row 3 — Live Gov API verification result */}
                  {r.success && gov && (
                    <div className={`mt-2.5 rounded-lg px-3 py-2 flex items-start gap-2.5 ${
                      gov.verified
                        ? 'bg-green-50 border border-green-200'
                        : gov.status === 'FORMAT_VALID'
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      {gov.verified
                        ? <ShieldCheck size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                        : gov.status === 'FORMAT_VALID'
                        ? <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                        : <ShieldAlert size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold ${
                            gov.verified ? 'text-green-700'
                            : gov.status === 'FORMAT_VALID' ? 'text-blue-600'
                            : 'text-red-700'
                          }`}>
                            {gov.adapter} — {gov.status}
                          </span>
                          <span className="text-[10px] text-gray-400">{gov.source}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                            gov.mode === 'LIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>{gov.mode}</span>
                        </div>
                        {gov.entity_name && (
                          <p className="text-[11px] font-semibold text-slate-700 mt-0.5">{gov.entity_name}</p>
                        )}
                        {gov.mismatch_flags?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {gov.mismatch_flags.map((flag, fi) => (
                              <p key={fi} className="text-[10px] text-red-600">⚠ {flag}</p>
                            ))}
                          </div>
                        )}
                        {gov.notes && (
                          <p className="text-[10px] text-gray-500 mt-0.5">{gov.notes}</p>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold flex-shrink-0">
                        {Math.round((gov.confidence || 0) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-800 font-medium">
              ✓ Documents processed.{' '}
              {isOfficer
                ? 'Run compliance analysis to verify requirements.'
                : 'Check bid readiness to see your current status.'
              }
            </p>
          </div>
        </div>
      )}

      {/* Requirements Checklist */}
      {requirements.length > 0 && existingDocs.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={15} className="text-purple-600" />
            <h2 className="text-sm font-semibold text-slate-700">Requirements Checklist</h2>
            <span className="text-[10px] text-gray-400">— {tenders.find(t => t.id === selectedTender)?.title}</span>
          </div>
          <div className="space-y-2">
            {requirements.map((req) => {
              const satisfied = existingDocs.some(d =>
                d.requirement_id === req.id ||
                // Also check if AI classification matches
                req.required_evidence?.some(ev =>
                  ev.toLowerCase().includes((d.classification || '').toLowerCase()) ||
                  (d.classification || '').toLowerCase().includes(ev.toLowerCase().split(' ')[0])
                )
              )
              return (
                <div key={req.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                  satisfied
                    ? 'bg-green-50 border-green-100'
                    : req.mandatory
                    ? 'bg-red-50 border-red-100'
                    : 'bg-gray-50 border-gray-100'
                }`}>
                  <div className="flex-shrink-0">
                    {satisfied
                      ? <CheckCircle size={15} className="text-green-500" />
                      : <AlertTriangle size={15} className={req.mandatory ? 'text-red-400' : 'text-gray-300'} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{req.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{req.required_evidence?.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      req.mandatory ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                    }`}>{req.mandatory ? 'MANDATORY' : 'OPTIONAL'}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      satisfied ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'
                    }`}>{satisfied ? '✓ Submitted' : 'Pending'}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Summary */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
            <span className="text-green-600 font-semibold">
              ✓ {requirements.filter(req => existingDocs.some(d => d.requirement_id === req.id)).length} submitted
            </span>
            <span className="text-red-500 font-semibold">
              ⚠ {requirements.filter(req => req.mandatory && !existingDocs.some(d => d.requirement_id === req.id)).length} mandatory pending
            </span>
            <span>of {requirements.length} total requirements</span>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Supported Formats',
            items: ['PDF documents', 'PNG / JPG images', 'DOCX files', 'Max 20MB each'],
          },
          {
            title: 'AI Classification',
            items: ['GST, PAN, Udyam', 'ISO 9001 / 27001', 'Financial statements', 'OEM Authorization'],
          },
          {
            title: 'After Upload',
            items: ['Auto-classification', 'Text extraction (OCR)', 'Entity recognition', 'Compliance matching'],
          },
        ].map(({ title, items }) => (
          <div key={title} className="card p-4">
            <h3 className="text-xs font-semibold text-slate-600 mb-2">{title}</h3>
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
