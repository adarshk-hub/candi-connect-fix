'use client'

import { useEffect, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'

interface PageOption {
  id: string
  name: string
}

// Same pattern as AdAccountConnector — replaces a raw, easy-to-mistype
// Page ID field with a live picker sourced from the token itself. This ID
// is what both live Meta Lead Ads webhook routing (matching incoming
// leadgen events to a client) and the historical Lead Ads backfill key off
// of, so a wrong/placeholder value here silently breaks both.
export default function PageConnector({
  clientId,
  currentPageId,
}: {
  clientId: string
  currentPageId: string | null
}) {
  const [pages, setPages] = useState<PageOption[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(currentPageId || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  function loadPages() {
    setLoadingPages(true)
    setLoadError('')
    fetch('/api/meta/pages')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data?.error || 'Failed to load Pages')
        return data
      })
      .then((data) => setPages(data.pages || []))
      .catch((err) => setLoadError(err?.message || 'Could not reach Meta — check META_PAGE_ACCESS_TOKEN is set.'))
      .finally(() => setLoadingPages(false))
  }

  useEffect(() => {
    loadPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    setSaveError('')
    setSaved(false)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaPageId: selected || null }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSaveError(b.error || 'Failed to save')
        return
      }
      setSaved(true)
    } catch (err: any) {
      setSaveError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  const currentPageName = pages.find((p) => p.id === currentPageId)?.name
  const looksLikePlaceholder = currentPageId && !/^\d+$/.test(currentPageId)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-muted">Facebook Page ID (routing)</p>
        <button onClick={loadPages} disabled={loadingPages} className="flex items-center gap-1 text-xs text-muted2 hover:text-fg">
          <RefreshCw size={11} className={loadingPages ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {looksLikePlaceholder && (
        <p className="mb-2 text-xs text-amber-400">
          Current value "{currentPageId}" doesn't look like a real Meta Page ID (should be all digits) — pick the real
          one below.
        </p>
      )}
      {!looksLikePlaceholder && currentPageId && (
        <p className="mb-2 text-xs text-muted2">
          Currently connected: <span className="text-fg">{currentPageName || currentPageId}</span>
        </p>
      )}

      {loadError && <p className="mb-2 text-xs text-red-400">{loadError}</p>}

      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setSaved(false)
          }}
          disabled={loadingPages || pages.length === 0}
          className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500 disabled:opacity-50"
        >
          <option value="">
            {loadingPages ? 'Loading Pages…' : pages.length === 0 ? 'No Pages visible to this token' : 'Not connected'}
          </option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving || selected === (currentPageId || '')}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          <Check size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {saveError && <p className="mt-1.5 text-xs text-red-400">{saveError}</p>}
      {saved && <p className="mt-1.5 text-xs text-green-400">Connected. Webhook routing and Lead Ads backfill will use this Page going forward.</p>}
      {!loadingPages && !loadError && pages.length === 0 && (
        <p className="mt-1.5 text-xs text-muted">
          The token can't see any Pages yet — in Business Settings, make sure the System User has been added as a
          partner/admin on the Page (Accounts &gt; Pages &gt; that Page &gt; Partners), same as was done for the ad
          account.
        </p>
      )}
    </div>
  )
}
