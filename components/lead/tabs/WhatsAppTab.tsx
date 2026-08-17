'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Check, CheckCheck, Clock, AlertCircle, Pause, Play, ChevronRight, Link as LinkIcon, Lock } from 'lucide-react'
import { NURTURE_STEPS } from '@/lib/nurtureSteps'

interface WhatsAppMessage {
  id: string
  direction: 'inbound' | 'outbound'
  message_type: 'template' | 'session' | 'system'
  body: string
  template_name: string | null
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed'
  link_url: string | null
  link_clicked_at: string | null
  sent_by_name: string | null
  created_at: string
}

interface WaTemplate {
  id: string
  name: string
  category: string | null
  language: string
  bodyPreview: string
  variableCount: number
}

const POLL_INTERVAL_MS = 6000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

function StatusTicks({ status }: { status: WhatsAppMessage['status'] }) {
  if (status === 'failed') return <AlertCircle size={13} className="text-red-400" />
  if (status === 'queued') return <Clock size={13} className="text-muted" />
  if (status === 'read' || status === 'replied') return <CheckCheck size={13} className="text-blue-400" />
  if (status === 'delivered') return <CheckCheck size={13} className="text-muted2" />
  return <Check size={13} className="text-muted2" />
}

function MessageBubble({ msg }: { msg: WhatsAppMessage }) {
  const isOutbound = msg.direction === 'outbound'
  const time = new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={clsx('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[75%] rounded-card px-3 py-2 text-sm',
          isOutbound ? 'bg-blue-600 text-white' : 'bg-card2 text-fg'
        )}
      >
        {msg.message_type === 'template' && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
            Template: {msg.template_name}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        {msg.link_url && (
          <p
            className={clsx(
              'mt-1.5 flex items-center gap-1 text-[11px]',
              msg.link_clicked_at ? 'text-green-300' : 'opacity-70'
            )}
          >
            <LinkIcon size={11} />
            {msg.link_clicked_at ? 'Link clicked' : 'Link not clicked yet'}
          </p>
        )}
        <div className={clsx('mt-1 flex items-center gap-1 text-[10px]', isOutbound ? 'justify-end opacity-80' : 'text-muted')}>
          <span>{time}</span>
          {isOutbound && <StatusTicks status={msg.status} />}
        </div>
      </div>
    </div>
  )
}

function TemplateRestartPanel({
  leadId,
  leadName,
  onSent,
}: {
  leadId: string
  leadName: string
  onSent: () => void
}) {
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/leads/${leadId}/whatsapp/templates`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
  }, [leadId])

  const selected = templates?.find((t) => t.id === selectedId) || null

  function selectTemplate(id: string) {
    setSelectedId(id)
    const t = templates?.find((x) => x.id === id)
    const count = t?.variableCount || 0
    // First variable in every template in this app is the parent's name —
    // pre-fill it so the counsellor usually just has to hit Send.
    setValues(Array.from({ length: count }, (_, i) => (i === 0 ? leadName : '')))
  }

  async function send() {
    if (!selected) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/whatsapp/template-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selected.id, variables: values }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to send template')
        return
      }
      setSelectedId('')
      setValues([])
      onSent()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-card border border-amber-500/30 bg-amber-500/5 p-3">
      {templates === null && <p className="text-xs text-muted">Loading approved templates…</p>}
      {templates !== null && templates.length === 0 && (
        <p className="text-xs text-muted">
          No approved templates yet for this client — add some in Settings → WhatsApp before you can restart this conversation.
        </p>
      )}
      {templates !== null && templates.length > 0 && (
        <>
          <select
            value={selectedId}
            onChange={(e) => selectTemplate(e.target.value)}
            className="w-full rounded-md border border-border bg-card2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-blue-500"
          >
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <p className="text-xs italic text-muted">{selected.bodyPreview}</p>
              {values.map((v, i) => (
                <input
                  key={i}
                  value={v}
                  onChange={(e) => setValues((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                  placeholder={`Variable ${i + 1}${i === 0 ? ' (parent name)' : ''}`}
                  className="w-full rounded-md border border-border bg-card2 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-blue-500"
                />
              ))}
              <button
                onClick={send}
                disabled={sending}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send template'}
              </button>
            </>
          )}
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function WhatsAppTab({
  leadId,
  leadName,
  nurtureDay,
  nurturePaused,
  onLeadChanged,
}: {
  leadId: string
  leadName: string
  nurtureDay: number | null
  nurturePaused: boolean
  onLeadChanged: () => void
}) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [loadError, setLoadError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  function load() {
    return fetch(`/api/leads/${leadId}/whatsapp/messages`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load messages (${r.status})`)
        return r.json()
      })
      .then((data) => {
        setMessages(Array.isArray(data) ? data : [])
        setLoadError('')
      })
      .catch((err) => setLoadError(err?.message || 'Could not load this conversation'))
  }

  // Initial load, plus polling so an inbound reply (written by the Meta
  // webhook straight to the DB) actually shows up without the counsellor
  // having to close and reopen the lead. Also refresh whenever the tab
  // regains focus, since a poll may have been missed while backgrounded.
  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    function onFocus() {
      load()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send() {
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/whatsapp/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to send')
        return
      }
      setText('')
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSending(false)
    }
  }

  async function togglePause() {
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_paused: !nurturePaused }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to update sequence')
        return
      }
      onLeadChanged()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  async function advance() {
    setAdvancing(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/whatsapp/advance`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to advance sequence')
        return
      }
      onLeadChanged()
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setAdvancing(false)
    }
  }

  const currentIdx = nurtureDay === null ? -1 : NURTURE_STEPS.findIndex((s) => s.day === nurtureDay)
  const isComplete = currentIdx === NURTURE_STEPS.length - 1

  // Derived, not fetched separately — same last-inbound-message logic the
  // server uses to enforce this (lib/waWindow.ts), computed here purely for
  // display/UI-gating. The POST route re-checks it server-side regardless.
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound')
  const windowOpen = !!lastInbound && Date.now() - new Date(lastInbound.created_at).getTime() < TWENTY_FOUR_HOURS_MS

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between rounded-card border border-border bg-card2 px-4 py-3">
        <div className="flex items-center gap-2">
          {NURTURE_STEPS.map((s, i) => (
            <div key={s.day} className="flex items-center gap-2">
              <span
                className={clsx(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                  i <= currentIdx ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-muted2'
                )}
                title={s.label}
              >
                {s.day}
              </span>
              {i < NURTURE_STEPS.length - 1 && (
                <span className={clsx('h-0.5 w-4', i < currentIdx ? 'bg-blue-500' : 'bg-zinc-700')} />
              )}
            </div>
          ))}
          <span className="ml-2 text-xs text-muted2">
            {nurtureDay === null ? 'Not started' : `Day ${nurtureDay}`}
            {nurturePaused && <span className="ml-1.5 text-amber-400">· Paused</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isComplete && (
            <button
              onClick={advance}
              disabled={advancing || nurturePaused}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg hover:bg-card disabled:opacity-40"
              title={nurturePaused ? 'Resume the sequence to advance' : 'Send next step now'}
            >
              <ChevronRight size={13} /> {advancing ? 'Sending…' : 'Advance'}
            </button>
          )}
          <button
            onClick={togglePause}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg hover:bg-card"
          >
            {nurturePaused ? <Play size={13} /> : <Pause size={13} />}
            {nurturePaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto rounded-card border border-border bg-bg/40 p-4">
        {loadError && (
          <p className="text-center text-sm text-red-400">
            {loadError} — <button onClick={load} className="underline">retry</button>
          </p>
        )}
        {!loadError && messages.length === 0 && <p className="text-center text-sm text-muted">No messages yet.</p>}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {windowOpen ? (
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Type a message…"
            rows={2}
            className="flex-1 rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs text-amber-400">
            <Lock size={12} />
            {lastInbound
              ? "24-hour reply window closed — this lead hasn't messaged in the last 24 hours."
              : "This lead hasn't messaged in yet — free-form replies open once they do."}
            {' '}Send a template to restart the conversation.
          </p>
          <TemplateRestartPanel leadId={leadId} leadName={leadName} onSent={load} />
        </div>
      )}
    </div>
  )
}
