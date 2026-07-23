'use client'

import { useEffect, useState } from 'react'
import { initials } from '@/lib/types'

interface Counsellor {
  id: string
  full_name: string
}

const REASSIGN_ROLES = ['agency_admin', 'agency_staff', 'client_admin']

export default function CounsellorAssign({
  leadId,
  currentId,
  currentName,
  onChanged,
}: {
  leadId: string
  currentId: string | null
  currentName: string | null
  onChanged: () => void
}) {
  const [role, setRole] = useState<string | null>(null)
  const [counsellors, setCounsellors] = useState<Counsellor[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRole(data?.role || null))
  }, [])

  useEffect(() => {
    if (role && REASSIGN_ROLES.includes(role)) {
      fetch('/api/counsellors')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setCounsellors(Array.isArray(data) ? data : []))
    }
  }, [role])

  if (!role || !REASSIGN_ROLES.includes(role)) {
    return (
      <p className="flex items-center justify-end gap-2 text-fg">
        {currentName && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-600 text-xs">
            {initials(currentName)}
          </span>
        )}
        {currentName || '—'}
      </p>
    )
  }

  async function reassign(newId: string) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_counsellor_id: newId || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to reassign')
        return
      }
      onChanged()
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="text-right">
      <select
        value={currentId || ''}
        onChange={(e) => reassign(e.target.value)}
        disabled={saving}
        className="rounded-md border border-border bg-card2 px-2 py-1 text-sm text-fg outline-none focus:border-blue-500 disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {counsellors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
