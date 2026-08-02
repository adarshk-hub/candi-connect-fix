'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

interface EmailBroadcastRow {
  id: string
  name: string
  subject: string
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  created_at: string
  completed_at: string | null
}

interface RecipientRow {
  lead_id: string
  full_name: string
  to_email: string
  status: string
  error: string | null
  sent_at: string | null
}

const STATUS_STYLES: Record<string, string> = {
  sending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  completed: 'bg-green-500/10 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
}

const RECIPIENT_STATUS_STYLES: Record<string, string> = {
  pending: 'text-muted',
  sent: 'text-green-400',
  failed: 'text-red-400',
}

export default function EmailBroadcastHistory({ clientId, refreshKey }: { clientId: string; refreshKey: number }) {
  const [broadcasts, setBroadcasts] = useState<EmailBroadcastRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ broadcast: EmailBroadcastRow; recipients: RecipientRow[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/email-broadcasts?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setBroadcasts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [clientId, refreshKey])

  function openDetail(id: string) {
    setActiveId(id)
    setDetailLoading(true)
    fetch(`/api/email-broadcasts/${id}?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }

  if (loading) return <p className="text-muted">Loading…</p>

  if (broadcasts.length === 0) {
    return <p className="text-sm text-muted">No email broadcasts sent yet for this institute.</p>
  }

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-fg">Broadcast History</h2>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-md border border-border bg-card2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-card"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Subject</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Sent / Total</th>
            <th className="pb-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {broadcasts.map((b) => (
            <tr
              key={b.id}
              onClick={() => openDetail(b.id)}
              className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-card2"
            >
              <td className="py-2 pr-2 text-fg">{b.name}</td>
              <td className="py-2 pr-2 text-xs text-muted2">{b.subject}</td>
              <td className="py-2 pr-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status] || ''}`}>
                  {b.status}
                </span>
              </td>
              <td className="py-2 pr-2 text-xs text-muted2">
                {b.sent_count} / {b.total_recipients}
                {b.failed_count > 0 && <span className="ml-1 text-red-400">({b.failed_count} failed)</span>}
              </td>
              <td className="py-2 text-xs text-muted2">{new Date(b.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {activeId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveId(null)} />
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-bold text-fg">{detail?.broadcast.name || 'Broadcast'}</h3>
              <button onClick={() => setActiveId(null)} className="text-muted2 hover:text-fg">
                <X size={20} />
              </button>
            </div>
            {detailLoading || !detail ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted2">
                  Subject <span className="text-fg">"{detail.broadcast.subject}"</span> — {detail.broadcast.sent_count} sent,{' '}
                  {detail.broadcast.failed_count} failed, out of {detail.broadcast.total_recipients} total.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="pb-2 font-medium">Lead</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recipients.map((r) => (
                      <tr key={r.lead_id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-2 text-xs text-fg">
                          {r.full_name}
                          <div className="text-muted2">{r.to_email}</div>
                        </td>
                        <td className={`py-2 pr-2 text-xs font-medium ${RECIPIENT_STATUS_STYLES[r.status] || ''}`}>
                          {r.status}
                        </td>
                        <td className="py-2 text-xs text-muted2">
                          {r.error || (r.sent_at ? new Date(r.sent_at).toLocaleString() : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
