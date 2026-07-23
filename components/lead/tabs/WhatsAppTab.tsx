'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Check, CheckCheck, Clock, AlertCircle, Pause, Play, ChevronRight, Link as LinkIcon } from 'lucide-react'
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

export default function WhatsAppTab({
  leadId,
  nurtureDay,
  nurturePaused,
  onLeadChanged,
}: {
  leadId: string
  nurtureDay: number | null
  nurturePaused: boolean
  onLeadChanged: () => void
}) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  function load() {
    fetch(`/api/leads/${leadId}/whatsapp/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMessages(Array.isArray(data) ? data : []))
  }

  useEffect(load, [leadId])

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
        {messages.length === 0 && <p className="text-center text-sm text-muted">No messages yet.</p>}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

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
    </div>
  )
}
