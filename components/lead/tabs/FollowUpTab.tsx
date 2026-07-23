'use client'

import { useEffect, useState } from 'react'

interface FollowUp {
  id: string
  follow_up_date: string
  details: string | null
  status: string
  created_by_name: string | null
  created_at: string
}

export default function FollowUpTab({ leadId }: { leadId: string }) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [date, setDate] = useState('')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetch(`/api/leads/${leadId}/follow-ups`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setFollowUps(Array.isArray(data) ? data : []))
  }

  useEffect(load, [leadId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    setError('')
    // Without this try/catch, a request that never resolves (network drop,
    // dev server restart mid-request, a browser extension blocking the
    // call) throws before setSaving(false) ever runs — the button is left
    // permanently stuck disabled with zero feedback, looking exactly like
    // "nothing happens" when clicked.
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpDate: date, details }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save follow-up')
        return
      }
      setDate('')
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
        <p className="mb-4 font-semibold text-fg">Schedule follow-up action for this lead:</p>
        <form onSubmit={onSubmit} className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-fg outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">Details</label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g., Call to follow up on meeting"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-fg outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-600 px-4 py-2 font-medium text-white hover:bg-zinc-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Follow up'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      <div className="mt-6">
        {followUps.length === 0 ? (
          <p className="text-center italic text-muted">No follow-ups scheduled</p>
        ) : (
          <ul className="space-y-3">
            {followUps.map((f) => (
              <li key={f.id} className="rounded-card border border-border bg-card2 p-4">
                <p className="text-sm font-medium text-fg">
                  {new Date(f.follow_up_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                {f.details && <p className="text-sm text-muted2">{f.details}</p>}
                <p className="mt-1 text-xs text-muted">by {f.created_by_name || 'Unknown'}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
