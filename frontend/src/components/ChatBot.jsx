/**
 * PARAKH AI — Gemini-powered floating chatbot widget.
 *
 * Renders a fixed floating button (bottom-right) on every portal.
 * Clicking opens a slide-up drawer with a full chat interface.
 *
 * Features:
 *  - Conversation history kept in local component state (not persisted)
 *  - Full message history sent to /api/chat on every turn (stateless backend)
 *  - Suggested quick-prompts for new users
 *  - Markdown-style bold (**text**) and bullet rendering
 *  - Auto-scroll to newest message
 *  - Enter to send, Shift+Enter for newline
 *  - Clear conversation button
 *  - Graceful error display (never infinite spinner)
 *  - GoI design system colours (navy + saffron)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, X, Send, RefreshCw, Bot, User,
  Trash2, ChevronDown, Sparkles, AlertCircle
} from 'lucide-react'
import api from '../services/api.js'

// ── Suggested prompts shown when conversation is empty ──────────────────────
const SUGGESTED_PROMPTS = [
  'What documents are required for a GeM tender?',
  'How is the compliance score calculated?',
  'Explain QCBS scoring and L1 selection.',
  'What does HIGH risk level mean for a bidder?',
  'How does the two-envelope system work?',
  'What is MSE preference in government procurement?',
]

// ── Lightweight markdown renderer ───────────────────────────────────────────
// Handles: **bold**, *italic*, bullet lists (- / * / •), numbered lists,
// inline `code`, and preserves line breaks. No external dep needed.
function renderMarkdown(text) {
  if (!text) return null

  const lines = text.split('\n')
  const elements = []
  let listBuffer = []
  let key = 0

  const flushList = () => {
    if (listBuffer.length === 0) return
    elements.push(
      <ul key={key++} className="list-disc list-inside space-y-0.5 my-1 pl-1">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed">{inlineFormat(item)}</li>
        ))}
      </ul>
    )
    listBuffer = []
  }

  const inlineFormat = (line) => {
    // Split on **bold**, *italic*, `code` markers
    const parts = []
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
    let last = 0
    let m
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index))
      const raw = m[0]
      if (raw.startsWith('**')) {
        parts.push(<strong key={m.index}>{raw.slice(2, -2)}</strong>)
      } else if (raw.startsWith('*')) {
        parts.push(<em key={m.index}>{raw.slice(1, -1)}</em>)
      } else {
        parts.push(
          <code key={m.index} className="bg-gray-100 text-blue-800 px-1 rounded text-[11px] font-mono">
            {raw.slice(1, -1)}
          </code>
        )
      }
      last = m.index + raw.length
    }
    if (last < line.length) parts.push(line.slice(last))
    return parts.length ? parts : line
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Bullet list line
    if (/^[-*•]\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^[-*•]\s+/, ''))
      continue
    }

    // Numbered list line
    if (/^\d+\.\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^\d+\.\s+/, ''))
      continue
    }

    // Flush any pending list before a non-list line
    flushList()

    if (!trimmed) {
      elements.push(<div key={key++} className="h-1.5" />)
    } else {
      elements.push(
        <p key={key++} className="text-sm leading-relaxed">
          {inlineFormat(trimmed)}
        </p>
      )
    }
  }

  flushList()
  return <div className="space-y-0.5">{elements}</div>
}

// ── Single message bubble ────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser  = msg.role === 'user'
  const isError = msg.isError

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: isUser
            ? 'var(--goi-saffron, #FF6600)'
            : isError
            ? '#dc2626'
            : 'var(--goi-navy, #003380)',
        }}
      >
        {isUser
          ? <User size={13} className="text-white" />
          : isError
          ? <AlertCircle size={13} className="text-white" />
          : <Bot size={13} className="text-white" />
        }
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[82%] px-3 py-2.5 rounded-2xl ${
          isUser
            ? 'rounded-tr-sm text-white'
            : isError
            ? 'rounded-tl-sm bg-red-50 border border-red-200 text-red-800'
            : 'rounded-tl-sm bg-white border border-gray-100 text-slate-800'
        }`}
        style={isUser ? { background: 'var(--goi-navy, #003380)' } : {}}
      >
        {isUser
          ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.parts}</p>
          : renderMarkdown(msg.parts)
        }
        <p className={`text-[10px] mt-1 ${isUser ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
          {msg.time}
        </p>
      </div>
    </div>
  )
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-2.5 flex-row">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--goi-navy, #003380)' }}
      >
        <Bot size={13} className="text-white" />
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-blue-400"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ChatBot component ───────────────────────────────────────────────────
export default function ChatBot() {
  const [open, setOpen]           = useState(false)
  const [messages, setMessages]   = useState([])   // {role, parts, time, isError}
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [unread, setUnread]       = useState(0)

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const drawerRef  = useRef(null)

  // Auto-scroll whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when drawer opens; clear unread badge
  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [open])

  const nowTime = () =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim()
    if (!trimmed || loading) return

    const userMsg = { role: 'user', parts: trimmed, time: nowTime() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // History to send: all previous messages + new one (max 20 kept on backend)
    const history = [...messages, userMsg].map((m) => ({
      role:  m.role,
      parts: m.parts,
    }))

    try {
      const res = await api.post('/chat', { messages: history })
      const reply = res.data?.reply || 'No response received.'
      setMessages((prev) => [...prev, {
        role:  'model',
        parts: reply,
        time:  nowTime(),
      }])
      // Badge if drawer is closed
      if (!open) setUnread((n) => n + 1)
    } catch (err) {
      // Provide a clear, actionable error message
      const status = err?.status
      let errText
      if (status === 404) {
        errText = 'Chat service not found. Please restart the PARAKH AI backend server and refresh the page.'
      } else if (status === 503) {
        errText = 'Grok API key is not configured on the server. Set GROK_API_KEY in backend/.env and restart.'
      } else if (status === 504 || err?.message?.includes('timeout')) {
        errText = 'The AI took too long to respond. Please try again.'
      } else if (!navigator.onLine) {
        errText = 'You appear to be offline. Please check your connection.'
      } else {
        errText = err?.data?.reply || err?.message || 'Something went wrong. Please try again.'
      }
      setMessages((prev) => [...prev, {
        role:    'model',
        parts:   errText,
        time:    nowTime(),
        isError: true,
      }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, open])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const isEmpty = messages.length === 0

  return (
    <>
      {/* ── Bounce keyframes (inline style — no extra CSS file needed) ── */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1);    }
        }
        .chat-drawer   { animation: chatSlideUp 0.22s ease-out forwards; }
        .chat-fab      { animation: chatFadeIn  0.18s ease-out forwards; }
        .chat-msg-in   { animation: chatSlideUp 0.15s ease-out forwards; }
      `}</style>

      {/* ── Floating Action Button ─────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="chat-fab fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl
                   flex items-center justify-center transition-transform hover:scale-105
                   active:scale-95 focus:outline-none"
        style={{ background: 'var(--goi-navy, #003380)' }}
        aria-label="Open PARAKH AI Assistant"
      >
        {open
          ? <ChevronDown size={22} className="text-white" />
          : <MessageCircle size={22} className="text-white" />
        }
        {/* Unread badge */}
        {!open && unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center
                       justify-center text-[10px] font-bold text-white shadow"
            style={{ background: 'var(--goi-saffron, #FF6600)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        {/* Pulse ring when closed */}
        {!open && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-25"
            style={{ background: 'var(--goi-navy, #003380)' }}
          />
        )}
      </button>

      {/* ── Chat Drawer ────────────────────────────────────────────── */}
      {open && (
        <div
          ref={drawerRef}
          className="chat-drawer fixed bottom-24 right-6 z-50 flex flex-col
                     w-[360px] max-w-[calc(100vw-3rem)]
                     rounded-2xl shadow-2xl overflow-hidden"
          style={{
            height: '520px',
            background: '#f8fafc',
            border:  '1px solid var(--border-color, #c8d0db)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: 'var(--goi-navy, #003380)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--goi-saffron, #FF6600)' }}
            >
              <Sparkles size={15} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">PARAKH AI Assistant</p>
              <p className="text-[10px] text-blue-200">Powered by xAI Grok · GeM Procurement Expert</p>
            </div>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10
                             transition-colors"
                  title="Clear conversation"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10
                           transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth">
            {/* Welcome state */}
            {isEmpty && (
              <div className="flex flex-col items-center pt-4 pb-2 text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-3 shadow"
                  style={{ background: 'var(--goi-navy, #003380)' }}
                >
                  <Sparkles size={26} className="text-white" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Hi! I'm your PARAKH AI Assistant</p>
                <p className="text-xs text-gray-500 mt-1 max-w-[260px]">
                  Ask me anything about GeM procurement, compliance, bid documents, or how PARAKH AI works.
                </p>
                {/* Suggested prompts */}
                <div className="mt-4 w-full space-y-1.5">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      disabled={loading}
                      className="w-full text-left text-xs px-3 py-2 rounded-xl border
                                 border-blue-200 bg-white text-blue-800 hover:bg-blue-50
                                 hover:border-blue-400 transition-colors leading-snug"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div key={i} className="chat-msg-in">
                <MessageBubble msg={msg} />
              </div>
            ))}

            {/* Typing indicator */}
            {loading && <TypingIndicator />}

            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div
            className="px-3 py-3 flex-shrink-0 border-t"
            style={{ borderColor: 'var(--border-color, #c8d0db)', background: '#fff' }}
          >
            <div
              className="flex items-end gap-2 rounded-xl border px-3 py-2 transition-shadow
                         focus-within:shadow-md"
              style={{ borderColor: 'var(--goi-navy, #003380)' }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  // Auto-grow: reset then set to scrollHeight (max ~80px / ~3 rows)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about compliance, documents, GeM rules…"
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-sm text-slate-800
                           placeholder-gray-400 focus:outline-none leading-relaxed"
                style={{ minHeight: '24px', maxHeight: '80px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                           transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--goi-navy, #003380)' }}
                title="Send (Enter)"
              >
                {loading
                  ? <RefreshCw size={14} className="text-white animate-spin" />
                  : <Send size={14} className="text-white" />
                }
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Enter to send · Shift+Enter for new line · AI may make mistakes
            </p>
          </div>
        </div>
      )}
    </>
  )
}
