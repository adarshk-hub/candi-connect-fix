'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

export default function DisplayPrefsPanel({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [leadsPerPage, setLeadsPerPage] = useState(250)
  const [showLeadStatusTabs, setShowLeadStatusTabs] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clients/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.leads_per_page) setLeadsPerPage(data.leads_per_page)
        if (data?.show_lead_status_tabs !== undefined) setShowLeadStatusTabs(!!data.show_lead_status_tabs)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [clientId])

  async function save() {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadsPerPage, showLeadStatusTabs }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
        return
      }
      setStatus('Saved.')
      // The sidebar's show/hide state comes from a server-rendered value
      // computed once in app/layout.tsx, not re-fetched on client-side
      // navigation — without this, the toggle would silently take effect
      // only after a manual browser reload, which feels broken even
      // though the save itself succeeded.
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <h2 className="mb-4 text-lg font-bold text-fg">Leads Per Page</h2>
      <div className="mb-4 flex items-center gap-3">
        <select
          value={leadsPerPage}
          onChange={(e) => setLeadsPerPage(Number(e.target.value))}
          className="rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
        >
          {[25, 50, 100, 250, 500, 1000].map((n) => (
            <option key={n} value={n}>
              {n} leads
            </option>
          ))}
        </select>
        <span className="text-sm text-muted2">Choose how many leads to display per page</span>
      </div>

      <div className="mb-4 border-t border-border pt-4">
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={showLeadStatusTabs}
            onChange={(e) => setShowLeadStatusTabs(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-fg">Show Warm / Hot / Cold / Enrolled tabs in the sidebar</span>
        </label>
        <p className="mt-1 pl-6 text-xs text-muted2">
          When off, these sub-links under "All Leads" are hidden for everyone at this institute — the leads
          themselves aren't affected, just the shortcut links.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {status && <p className="mb-3 text-sm text-green-400">{status}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
      >
        <Check size={16} /> {saving ? 'Saving…' : 'Save Display Preferences'}
      </button>
    </div>
  )
}
