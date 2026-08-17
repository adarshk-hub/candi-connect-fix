'use client'

import { useState } from 'react'
import { History } from 'lucide-react'

export default function BackfillMetaLeadsButton({ clientId }: { clientId: string }) {
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function run() {
    setRunning(true)
    setMsg('')
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/leads-backfill`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Backfill failed')
        return
      }
      setMsg(`Found ${body.totalFound} Lead Ads submission${body.totalFound === 1 ? '' : 's'} on Meta — ${body.created} new, ${body.duplicate} already in the CRM. ${body.retentionNote}`)
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 rounded-md border border-border bg-card2 px-4 py-2 text-sm font-medium text-fg hover:border-blue-500 disabled:opacity-50"
      >
        <History size={16} /> {running ? 'Pulling from Meta…' : 'Backfill Meta Lead Ads leads'}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {msg && <p className="mt-2 text-xs text-muted2">{msg}</p>}
    </div>
  )
}
