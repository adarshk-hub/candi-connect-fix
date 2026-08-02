'use client'

import { useState } from 'react'
import { Radio, MessageCircle, Mail } from 'lucide-react'
import BroadcastComposer from './BroadcastComposer'
import BroadcastHistory from './BroadcastHistory'
import EmailBroadcastComposer from './EmailBroadcastComposer'
import EmailBroadcastHistory from './EmailBroadcastHistory'

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
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  if (!clientId) {
    return <p className="text-muted">No institution to broadcast to yet.</p>
  }

  function switchChannel(next: 'whatsapp' | 'email') {
    setChannel(next)
    setTab('new')
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

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => switchChannel('whatsapp')}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
            channel === 'whatsapp' ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-border bg-card2 text-muted2 hover:text-fg'
          }`}
        >
          <MessageCircle size={16} /> WhatsApp
        </button>
        <button
          onClick={() => switchChannel('email')}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
            channel === 'email' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-border bg-card2 text-muted2 hover:text-fg'
          }`}
        >
          <Mail size={16} /> Email
        </button>
      </div>

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

      {channel === 'whatsapp' ? (
        tab === 'new' ? (
          <BroadcastComposer
            clientId={clientId}
            onSent={() => {
              setTab('history')
              setHistoryRefreshKey((k) => k + 1)
            }}
          />
        ) : (
          <BroadcastHistory clientId={clientId} refreshKey={historyRefreshKey} />
        )
      ) : tab === 'new' ? (
        <EmailBroadcastComposer
          clientId={clientId}
          onSent={() => {
            setTab('history')
            setHistoryRefreshKey((k) => k + 1)
          }}
        />
      ) : (
        <EmailBroadcastHistory clientId={clientId} refreshKey={historyRefreshKey} />
      )}
    </div>
  )
}
