'use client'

import { useEffect, useState } from 'react'

export interface KanbanFilterState {
  counsellorId: string
  program: string
  clientId: string
  from: string
  to: string
}

export default function KanbanFilters({
  value,
  onChange,
}: {
  value: KanbanFilterState
  onChange: (v: KanbanFilterState) => void
}) {
  const [counsellors, setCounsellors] = useState<{ id: string; full_name: string }[]>([])
  const [programs, setPrograms] = useState<string[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/counsellors')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCounsellors(Array.isArray(d) ? d : []))
    fetch('/api/programs')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPrograms(Array.isArray(d) ? d : []))
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClients(Array.isArray(d) ? d : []))
  }, [])

  function set<K extends keyof KanbanFilterState>(key: K, v: string) {
    onChange({ ...value, [key]: v })
  }

  const selectClass =
    'rounded-md border border-border bg-card2 px-2 py-1.5 text-sm text-fg outline-none focus:border-blue-500'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <select value={value.counsellorId} onChange={(e) => set('counsellorId', e.target.value)} className={selectClass}>
        <option value="">All Counsellors</option>
        {counsellors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </select>

      <select value={value.program} onChange={(e) => set('program', e.target.value)} className={selectClass}>
        <option value="">All Programs</option>
        {programs.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {clients.length > 0 && (
        <select value={value.clientId} onChange={(e) => set('clientId', e.target.value)} className={selectClass}>
          <option value="">All Institutions</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-1.5 text-sm text-muted2">
        From
        <input
          type="date"
          value={value.from}
          onChange={(e) => set('from', e.target.value)}
          className="rounded-md border border-border bg-card2 px-2 py-1.5 text-sm text-fg"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted2">
        To
        <input
          type="date"
          value={value.to}
          onChange={(e) => set('to', e.target.value)}
          className="rounded-md border border-border bg-card2 px-2 py-1.5 text-sm text-fg"
        />
      </label>

      {(value.counsellorId || value.program || value.clientId || value.from || value.to) && (
        <button
          onClick={() => onChange({ counsellorId: '', program: '', clientId: '', from: '', to: '' })}
          className="text-sm text-blue-400 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
