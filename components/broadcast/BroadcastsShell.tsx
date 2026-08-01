'use client'

import { useState } from 'react'
import { Radio } from 'lucide-react'
import BroadcastComposer from './BroadcastComposer'
import BroadcastHistory from './BroadcastHistory'

interface Institute {
  id: string
  name: string
}

export default function BroadcastsShell({
  institutes,
  lockedToClientId,
}: {
  institutes: Institute[]
  lockedToClientId: string | null
}) {
  const [clientId, setClientId] = useState(lockedToClientId || institutes[0]?.id || '')
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  if (!clientId) {
    return <p className="text-muted">No institution to broadcast to yet.</p>
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Radio size={22} className="text-fg" />
        <h1 className="text-2xl font-bold text-fg">Broadcasts</h1>
      </div>

      {!lockedToClientId && (
        <div className="mb-5">
          <label className="mb-1 block text-xs text-muted">Institute</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-72 rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
          >
            {institutes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-5 flex gap-1 border-b border-border">
        {(['new', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-blue-500 text-fg' : 'border-transparent text-muted2 hover:text-fg'
            }`}
          >
            {t === 'new' ? 'New Broadcast' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'new' ? (
        <BroadcastComposer
          clientId={clientId}
          onSent={() => {
            setTab('history')
            setHistoryRefreshKey((k) => k + 1)
          }}
        />
      ) : (
        <BroadcastHistory clientId={clientId} refreshKey={historyRefreshKey} />
      )}
    </div>
  )
}
