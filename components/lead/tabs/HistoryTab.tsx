'use client'

import { useEffect, useState } from 'react'

interface Activity {
  id: string
  activity_type: string
  title: string
  description: string | null
  actor_name: string | null
  created_at: string
}

export default function HistoryTab({ leadId }: { leadId: string }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [actionType, setActionType] = useState('')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetch(`/api/leads/${leadId}/activity`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setActivities(Array.isArray(data) ? data : []))
  }

  useEffect(load, [leadId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!details) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, details }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
        return
      }
      setActionType('')
      setDetails('')
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="rounded-card border border-border bg-card2 p-5">
        <p className="mb-4 font-semibold text-fg">Log an update — it'll appear below with a timestamp:</p>
        <form onSubmit={onSubmit} className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Action Type</label>
            <input
              type="text"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              placeholder="e.g., Call"
              className="rounded-md border border-border bg-card px-3 py-2 text-fg outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">Details</label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g., Discussed proposal, follow up next week"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-fg outline-none focus:border-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-600 px-4 py-2 font-medium text-white hover:bg-zinc-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Update'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      <ul className="relative mt-6 space-y-6 border-l border-border pl-6">
        {activities.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full bg-zinc-500" />
            <p className="font-bold text-fg">{a.title}</p>
            {a.description && <p className="mt-0.5 text-sm text-muted2">{a.description}</p>}
            <p className="mt-1 text-xs text-muted">
              {new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {a.actor_name ? ` · by ${a.actor_name}` : ''}
            </p>
          </li>
        ))}
        {activities.length === 0 && <p className="text-muted">No history yet.</p>}
      </ul>
    </div>
  )
}
