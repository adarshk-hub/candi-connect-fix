'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { RefreshCw } from 'lucide-react'

interface Campaign {
  id: string
  display_name: string
  client_name: string
}

interface SpendEntry {
  id: string
  campaign_id: string
  campaign_display_name: string
  week_starting: string
  spend_amount: string
  source: 'manual' | 'meta_api' | 'google_api'
  synced_at: string | null
  entered_at: string
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  meta_api: 'Meta API',
  google_api: 'Google API',
}

const SOURCE_PILL: Record<string, string> = {
  manual: 'bg-zinc-600/40 text-zinc-300',
  meta_api: 'bg-blue-500/20 text-blue-300',
  google_api: 'bg-amber-500/20 text-amber-300',
}

function mondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SpendEntryPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [weekStarting, setWeekStarting] = useState(mondayOf(new Date()))
  const [spendAmount, setSpendAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const [entries, setEntries] = useState<SpendEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  function loadEntries() {
    setEntriesLoading(true)
    fetch('/api/spend')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setEntries(Array.isArray(data) ? data : [])
        setEntriesLoading(false)
      })
      .catch(() => setEntriesLoading(false))
  }

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const rows = Array.isArray(data) ? data : []
        setCampaigns(rows)
        if (rows[0]) setCampaignId(rows[0].id)
      })
    loadEntries()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, weekStarting, spendAmount: Number(spendAmount) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body.error || 'Failed to save')
        setStatus('error')
        return
      }
      setStatus('saved')
      setSpendAmount('')
      loadEntries()
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error — could not reach the server')
      setStatus('error')
    }
  }

  async function syncNow() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/spend/sync', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSyncMsg(body.error || 'Sync failed')
        return
      }
      const body = await res.json()
      const matched = body.results.reduce((sum: number, r: any) => sum + r.campaignsMatched, 0)
      setSyncMsg(matched > 0 ? `Synced ${matched} campaign${matched === 1 ? '' : 's'}.` : 'Sync ran — no ad accounts connected yet or no matching campaigns.')
      loadEntries()
    } catch (err: any) {
      setSyncMsg(err?.message || 'Network error — could not reach the server')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">Weekly Spend Entry</h1>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="flex items-center gap-2 rounded-md border border-border bg-card2 px-3 py-2 text-sm font-medium text-fg hover:border-blue-500 disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      {syncMsg && <p className="mb-4 text-sm text-muted2">{syncMsg}</p>}

      <div className="rounded-card border border-border bg-card p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Campaign</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-fg outline-none focus:border-blue-500"
              required
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.client_name} — {c.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Week starting</label>
            <input
              type="date"
              value={weekStarting}
              onChange={(e) => setWeekStarting(e.target.value)}
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-fg outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Spend amount (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={spendAmount}
              onChange={(e) => setSpendAmount(e.target.value)}
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-fg outline-none focus:border-blue-500"
              required
            />
          </div>
          {status === 'error' && <p className="text-sm text-red-400">{errorMsg}</p>}
          {status === 'saved' && <p className="text-sm text-green-400">Saved.</p>}
          <button
            type="submit"
            disabled={status === 'saving'}
            className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save spend'}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Recent entries</p>
        {entriesLoading ? (
          <p className="text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted">No spend entries yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-card border border-border bg-card2 p-3"
              >
                <div>
                  <p className="text-sm text-fg">{e.campaign_display_name}</p>
                  <p className="text-xs text-muted2">Week of {fmtDate(e.week_starting)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={clsx('rounded-md px-2.5 py-0.5 text-xs font-medium', SOURCE_PILL[e.source])}>
                    {SOURCE_LABEL[e.source]}
                  </span>
                  <span className="text-sm font-medium text-fg">₹{Number(e.spend_amount).toLocaleString('en-IN')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
