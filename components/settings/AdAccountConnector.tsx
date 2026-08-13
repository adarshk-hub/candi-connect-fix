'use client'

import { useEffect, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'

interface AdAccountOption {
  id: string
  name: string
  accountStatus: number | null
}

// Lets an agency user connect an institute to a real Meta ad account by
// picking it from a live list (fetched via the server's Meta token) instead
// of typing a raw numeric account ID. Sits in the Ad Spend Sync card on the
// main Settings page, replacing what used to be a read-only "not
// configured" line with no way to actually set it from the UI.
export default function AdAccountConnector({
  clientId,
  currentAdAccountId,
}: {
  clientId: string
  currentAdAccountId: string | null
}) {
  const [accounts, setAccounts] = useState<AdAccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(currentAdAccountId || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  function loadAccounts() {
    setLoadingAccounts(true)
    setLoadError('')
    fetch('/api/meta/ad-accounts')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data?.error || 'Failed to load ad accounts')
        return data
      })
      .then((data) => setAccounts(data.accounts || []))
      .catch((err) => setLoadError(err?.message || 'Could not reach Meta — check META_MARKETING_API_ACCESS_TOKEN is set.'))
      .finally(() => setLoadingAccounts(false))
  }

  useEffect(() => {
    loadAccounts()
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
        body: JSON.stringify({ metaAdAccountId: selected || null }),
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

  const currentAccountName = accounts.find((a) => a.id === currentAdAccountId)?.name

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-muted">Meta Ad Account</p>
        <button
          onClick={loadAccounts}
          disabled={loadingAccounts}
          className="flex items-center gap-1 text-xs text-muted2 hover:text-fg"
          title="Refresh list"
        >
          <RefreshCw size={11} className={loadingAccounts ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {currentAdAccountId && (
        <p className="mb-2 text-xs text-muted2">
          Currently connected: <span className="text-fg">{currentAccountName || `act_${currentAdAccountId}`}</span>
        </p>
      )}

      {loadError && (
        <p className="mb-2 text-xs text-red-400">
          {loadError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setSaved(false)
          }}
          disabled={loadingAccounts || accounts.length === 0}
          className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500 disabled:opacity-50"
        >
          <option value="">
            {loadingAccounts ? 'Loading ad accounts…' : accounts.length === 0 ? 'No ad accounts visible to this token' : 'Not connected'}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (act_{a.id}){a.accountStatus !== 1 ? ' — inactive' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving || selected === (currentAdAccountId || '')}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          <Check size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {saveError && <p className="mt-1.5 text-xs text-red-400">{saveError}</p>}
      {saved && <p className="mt-1.5 text-xs text-green-400">Connected. Ad-spend sync and reporting will use this account going forward.</p>}
      {!loadingAccounts && !loadError && accounts.length === 0 && (
        <p className="mt-1.5 text-xs text-muted">
          The token can't see any ad accounts yet — in Business Settings, make sure the Conversions API System User has
          been added as a partner/admin on the ad account you want to connect.
        </p>
      )}
    </div>
  )
}
