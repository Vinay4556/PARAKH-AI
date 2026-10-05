import React, { useEffect, useState, useRef } from 'react'
import {
  X, Download, ExternalLink, FileText, ZoomIn, ZoomOut,
  AlertTriangle, CheckCircle, Clock, Shield, ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { getDocument, getDocumentViewUrl, getDocumentDownloadUrl } from '../services/api.js'

// Get stored auth token to pass as query param for iframe/img (can't set headers on these)
const getAuthToken = () => localStorage.getItem('auth_token') || ''

const TYPE_COLORS = {
  GST:           { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  PAN:           { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  UDYAM:         { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  ISO9001:       { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200' },
  ISO27001:      { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200' },
  FINANCIAL:     { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200' },
  OEM:           { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  EPFO:          { bg: 'bg-cyan-100',   text: 'text-cyan-700',   border: 'border-cyan-200' },
  ESIC:          { bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200' },
  EXPERIENCE:    { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
  DECLARATION:   { bg: 'bg-rose-100',   text: 'text-rose-700',   border: 'border-rose-200' },
  BIS_CE:        { bg: 'bg-lime-100',   text: 'text-lime-700',   border: 'border-lime-200' },
  NABL:          { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-200' },
  INCORPORATION: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  UNKNOWN:       { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200' },
}

function ConfidencePill({ confidence }) {
  const pct = Math.round((confidence || 0) * 100)
  const color = pct >= 90 ? 'text-green-700 bg-green-50' : pct >= 70 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>
      {pct}% confidence
    </span>
  )
}

function ExtractedTextView({ text, filename }) {
  const [fontSize, setFontSize] = useState(13)
  if (!text || text.startsWith('[')) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-8">
        <FileText size={48} className="opacity-30" />
        <p className="text-sm font-medium">No extracted text available</p>
        <p className="text-xs text-center max-w-xs">
          {text || 'This document has no extracted text. It may be a scanned image or the file was not processed.'}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <span className="text-xs text-gray-500 font-medium">Extracted Text — {filename}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Decrease font size"
          >
            <ZoomOut size={13} className="text-gray-500" />
          </button>
          <span className="text-[10px] text-gray-400 w-7 text-center">{fontSize}px</span>
          <button
            onClick={() => setFontSize((s) => Math.min(20, s + 1))}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Increase font size"
          >
            <ZoomIn size={13} className="text-gray-500" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-white">
        <pre
          className="whitespace-pre-wrap break-words leading-relaxed text-slate-700 font-mono"
          style={{ fontSize: `${fontSize}px` }}
        >
          {text}
        </pre>
      </div>
    </div>
  )
}

export default function DocumentViewer({ docId, onClose, allDocs = [], currentIndex = 0, onNavigate }) {
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('auto') // auto | text | file
  const [fileError, setFileError] = useState(false)
  const iframeRef = useRef()

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    setFileError(false)
    setDoc(null)
    getDocument(docId)
      .then((res) => {
        setDoc(res.data)
        // Decide initial view mode based on whether a physical file exists
        const hasSavedPath = !!res.data?.saved_path
        setViewMode(hasSavedPath ? 'file' : 'text')
      })
      .catch(() => setViewMode('text'))
      .finally(() => setLoading(false))
  }, [docId])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fileExt = doc?.filename?.split('.').pop().toLowerCase() || ''
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)
  const isPdf = fileExt === 'pdf'
  const typeStyle = TYPE_COLORS[doc?.classification] || TYPE_COLORS.UNKNOWN
  const token = getAuthToken()
  const viewUrl = doc ? `${getDocumentViewUrl(doc.id)}?token=${token}` : ''
  const downloadUrl = doc ? `${getDocumentDownloadUrl(doc.id)}?token=${token}` : ''

  const canNavigatePrev = currentIndex > 0
  const canNavigateNext = currentIndex < allDocs.length - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-5xl h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#0b2a4a] text-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Shield size={16} className="text-blue-300 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{doc?.filename || 'Loading…'}</p>
              <p className="text-[10px] text-blue-300">Officer View · Confidential · {doc?.bidder_id}</p>
            </div>
            {doc && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${typeStyle.bg} ${typeStyle.text}`}>
                {doc.classification}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Navigation arrows */}
            {allDocs.length > 1 && (
              <>
                <button
                  onClick={() => canNavigatePrev && onNavigate(currentIndex - 1)}
                  disabled={!canNavigatePrev}
                  className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
                  title="Previous document"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[11px] text-blue-200">{currentIndex + 1}/{allDocs.length}</span>
                <button
                  onClick={() => canNavigateNext && onNavigate(currentIndex + 1)}
                  disabled={!canNavigateNext}
                  className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
                  title="Next document"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}

            {/* View mode toggle */}
            {doc?.saved_path && (
              <div className="flex items-center bg-white/10 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode('file')}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${viewMode === 'file' ? 'bg-white text-slate-800' : 'text-white/70 hover:text-white'}`}
                >
                  {isImage ? 'Image' : 'File'}
                </button>
                <button
                  onClick={() => setViewMode('text')}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${viewMode === 'text' ? 'bg-white text-slate-800' : 'text-white/70 hover:text-white'}`}
                >
                  Text
                </button>
              </div>
            )}

            {/* Open in new tab */}
            {doc?.saved_path && (
              <a
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={15} />
              </a>
            )}

            {/* Download */}
            {doc?.saved_path && (
              <a
                href={downloadUrl}
                download
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Download file"
              >
                <Download size={15} />
              </a>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-red-500/40 transition-colors ml-1"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Meta strip */}
        {doc && (
          <div className="flex items-center gap-4 px-5 py-2 bg-gray-50 border-b border-gray-200 text-xs flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5">
              <FileText size={12} className="text-gray-400" />
              <span className="text-gray-500">{doc.pages} page{doc.pages !== 1 ? 's' : ''}</span>
            </div>
            <ConfidencePill confidence={doc.confidence} />
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-gray-400" />
              <span className="text-gray-500">
                Uploaded {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Method:</span>
              <span className="text-gray-600 font-medium capitalize">{doc.extraction_method || 'processed'}</span>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {loading && (
            <div className="flex items-center justify-center h-full gap-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Loading document…</span>
            </div>
          )}

          {!loading && doc && (
            <>
              {/* FILE MODE — PDF or image via iframe/img */}
              {viewMode === 'file' && doc.saved_path && !fileError && (
                <div className="h-full flex flex-col">
                  {isPdf && (
                    <iframe
                      ref={iframeRef}
                      src={viewUrl}
                      className="w-full flex-1 border-0"
                      title={doc.filename}
                      onError={() => setFileError(true)}
                    />
                  )}
                  {isImage && (
                    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-200">
                      <img
                        src={viewUrl}
                        alt={doc.filename}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                        onError={() => setFileError(true)}
                      />
                    </div>
                  )}
                  {!isPdf && !isImage && (
                    // DOCX or unknown — show download prompt + extracted text
                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-3 p-4 bg-amber-50 border-b border-amber-200 flex-shrink-0">
                        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">
                            Browser cannot display .{fileExt} files directly
                          </p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            Use the download button to open this file in the appropriate application.
                          </p>
                        </div>
                        <a
                          href={downloadUrl}
                          download
                          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0"
                        >
                          <Download size={13} /> Download File
                        </a>
                      </div>
                      <ExtractedTextView text={doc.extracted_text} filename={doc.filename} />
                    </div>
                  )}
                </div>
              )}

              {/* FILE ERROR fallback */}
              {viewMode === 'file' && fileError && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
                  <AlertTriangle size={40} className="text-amber-400" />
                  <p className="text-sm font-medium text-slate-600">Could not load file preview</p>
                  <p className="text-xs text-gray-400">Showing extracted text instead</p>
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => setViewMode('text')}
                  >
                    View extracted text
                  </button>
                </div>
              )}

              {/* TEXT MODE — always works, uses extracted_text */}
              {(viewMode === 'text' || !doc.saved_path) && (
                <ExtractedTextView text={doc.extracted_text} filename={doc.filename} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <Shield size={10} className="text-blue-400" />
            Restricted to authorized Procurement Officers only · Veritas AI v2.0
          </div>
          {doc && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className="font-mono">{doc.id}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
