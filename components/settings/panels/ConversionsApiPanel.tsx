//Re

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { META_STANDARD_EVENTS } from '@/lib/types'

interface StageRow {
  key: string
  label: string
}

interface CapiEventRow {
  id: string
  event_name: string
  pipeline_stage: string | null
  status: 'sent' | 'failed' | 'skipped'
  fbtrace_id: string | null
  error: string | null
  created_at: string
  lead_name: string | null
}

// A pseudo-stage (not a real pipeline_stages row) representing the moment a
// lead first lands in the CRM from any channel — the only trigger point
// that fires before a lead has a "real" stage yet.
const NEW_LEAD_TRIGGER = { key: 'lead_created', label: 'New lead created (any source)' }

function statusPill(status: CapiEventRow['status']) {
  const map: Record<string, string> = {
    sent: 'bg-green-500/20 text-green-300',
    failed: 'bg-red-500/20 text-red-300',
    skipped: 'bg-amber-500/20 text-amber-300',
  }
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>
}

export default function ConversionsApiPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [capiEnabled, setCapiEnabled] = useState(false)
  const [pixelId, setPixelId] = useState('')
  const [testEventCode, setTestEventCode] = useState('')
  const [stageEvents, setStageEvents] = useState<Record<string, string>>({})
  const [stages, setStages] = useState<StageRow[]>([])

  const [events, setEvents] = useState<CapiEventRow[]>([])
  const [summary, setSummary] = useState<{ sent: number; failed: number; skipped: number; last_event_at: string | null } | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  const loadEvents = useCallback(() => {
    setEventsLoading(true)
    fetch(`/api/capi-events?clientId=${clientId}&limit=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setEvents(data.events || [])
          setSummary(data.summary || null)
        }
        setEventsLoading(false)
      })
      .catch(() => setEventsLoading(false))
  }, [clientId])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/clients/${clientId}/capi-config`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/pipeline-stages?clientId=${clientId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([config, stageRows]) => {
        if (config) {
          setCapiEnabled(!!config.capi_enabled)
          setPixelId(config.meta_pixel_id || '')
          setTestEventCode(config.meta_capi_test_event_code || '')
          setStageEvents(config.capi_stage_events || {})
        }
        setStages((stageRows || []).map((s: any) => ({ key: s.key, label: s.label })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
    loadEvents()
  }, [clientId, loadEvents])

  async function save() {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/clients/${clientId}/capi-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capiEnabled,
          metaPixelId: pixelId,
          metaCapiTestEventCode: testEventCode,
          capiStageEvents: stageEvents,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error || 'Failed to save')
        return
      }
      setStatus('Saved.')
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  function setMapping(stageKey: string, eventName: string) {
    setStageEvents((prev) => {
      const next = { ...prev }
      if (eventName) next[stageKey] = eventName
      else delete next[stageKey]
      return next
    })
  }

  if (loading) return <p className="text-muted">Loading…</p>

  const allTriggerRows = [NEW_LEAD_TRIGGER, ...stages]

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="mb-1 text-lg font-bold text-fg">Meta Conversions API</h2>
        <p className="mb-4 text-sm text-muted2">
          Sends server-side conversion events straight from this CRM to Meta — so when a lead gets qualified, books
          a visit, or enrolls, Meta's ad algorithm learns about it even though that all happens well after the
          original ad click. Uses the same system-user access token as ad-spend sync
          (<code className="rounded bg-card2 px-1 py-0.5 text-xs">META_MARKETING_API_ACCESS_TOKEN</code>), configured
          once on the server for every institute.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Status</label>
            <button
              onClick={() => setCapiEnabled((v) => !v)}
              className={`w-full rounded-md border px-3 py-2 text-sm font-medium ${
                capiEnabled
                  ? 'border-green-500/50 bg-green-500/10 text-green-300'
                  : 'border-border bg-card2 text-muted2'
              }`}
            >
              {capiEnabled ? 'Enabled — sending events' : 'Disabled — click to enable'}
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Meta Pixel / Dataset ID</label>
            <input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="e.g. 1234567890123456"
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-muted">Events Manager &gt; Data Sources &gt; your Pixel &gt; Settings.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Test Event Code (optional)</label>
            <input
              value={testEventCode}
              onChange={(e) => setTestEventCode(e.target.value)}
              placeholder="TEST12345"
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-muted">
              Paste from Events Manager &gt; Test Events while verifying, then clear it once live.
            </p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {status && <p className="mt-4 text-sm text-green-400">{status}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="mt-4 flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          <Check size={16} /> {saving ? 'Saving…' : 'Save Conversions API Settings'}
        </button>
      </div>

      <div className="rounded-card border border-border bg-card p-5">
        <h3 className="mb-1 font-semibold text-fg">Stage → Event mapping</h3>
        <p className="mb-4 text-sm text-muted2">
          Pick which Meta standard event to fire when a lead reaches each stage. Leave a stage set to "Don't send"
          to skip it — most institutes only map two or three stages (e.g. Qualified, Visit Done, Enrolled).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-3 py-2">CRM Stage</th>
                <th className="px-3 py-2">Meta Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allTriggerRows.map((s) => (
                <tr key={s.key}>
                  <td className="px-3 py-2 text-fg">{s.label}</td>
                  <td className="px-3 py-2">
                    <select
                      value={stageEvents[s.key] || ''}
                      onChange={(e) => setMapping(s.key, e.target.value)}
                      className="w-64 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
                    >
                      <option value="">Don't send</option>
                      {META_STANDARD_EVENTS.map((ev) => (
                        <option key={ev.value} value={ev.value}>
                          {ev.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {stages.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-muted">
                    No lead stages found for this institute yet — set those up under Lead Stages first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-fg">Recent events</h3>
            <p className="text-sm text-muted2">
              {summary
                ? `${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped${
                    summary.last_event_at ? ` — last event ${new Date(summary.last_event_at).toLocaleString('en-IN')}` : ''
                  }`
                : 'No events yet.'}
            </p>
          </div>
          <button
            onClick={loadEvents}
            disabled={eventsLoading}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted2 hover:text-fg"
          >
            <RefreshCw size={13} className={eventsLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-xs text-muted2">{new Date(e.created_at).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-fg">{e.lead_name || '—'}</td>
                  <td className="px-3 py-2 text-fg">{e.event_name}</td>
                  <td className="px-3 py-2">{statusPill(e.status)}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-muted2" title={e.error || e.fbtrace_id || ''}>
                    {e.error || e.fbtrace_id || '—'}
                  </td>
                </tr>
              ))}
              {events.length === 0 && !eventsLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">
                    Nothing sent yet — events will show up here once a mapped stage fires.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
