'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, X, User } from 'lucide-react'

interface Counsellor {
  id: string
  full_name: string
  email: string
  created_at: string
}

export default function CounsellorsPanel({ clientId }: { clientId: string }) {
  const [counsellors, setCounsellors] = useState<Counsellor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch(`/api/counsellors?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setCounsellors(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [clientId])

  async function remove(c: Counsellor) {
    if (!confirm(`Remove counsellor "${c.full_name}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/counsellors/${c.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to remove')
        return
      }
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-fg">Counsellors</h2>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
        >
          <Plus size={14} /> Add New
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {adding && (
        <CounsellorForm
          clientId={clientId}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            load()
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {counsellors.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="rounded-card border border-border bg-card2 p-4 sm:col-span-2 lg:col-span-3">
              <CounsellorForm
                clientId={clientId}
                existing={c}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null)
                  load()
                }}
              />
            </div>
          ) : (
            <div key={c.id} className="rounded-card border border-border bg-card2 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-600 text-white">
                  <User size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{c.full_name}</p>
                  <p className="truncate text-xs text-muted2">{c.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">Counsellor</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingId(c.id)}
                    className="rounded-md border border-border p-1.5 text-muted2 hover:text-fg"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="rounded-md border border-border p-1.5 text-muted2 hover:text-red-400"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          )
        )}
        {counsellors.length === 0 && !adding && (
          <p className="col-span-full py-6 text-center text-sm text-muted">No counsellors yet.</p>
        )}
      </div>
    </div>
  )
}

function CounsellorForm({
  clientId,
  existing,
  onCancel,
  onSaved,
}: {
  clientId: string
  existing?: Counsellor
  onCancel: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(existing?.full_name || '')
  const [email, setEmail] = useState(existing?.email || '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!fullName.trim() || !email.trim()) return
    if (!existing && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = existing ? `/api/counsellors/${existing.id}` : '/api/counsellors'
      const method = existing ? 'PATCH' : 'POST'
      const body: any = { clientId, fullName, email }
      if (!existing || password) body.password = password
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error || 'Failed to save')
        return
      }
      onSaved()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-3 space-y-3 rounded-md border border-border bg-card2 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Full name</label>
          <input
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Email (username)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">{existing ? 'New password (optional)' : 'Password'}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={existing ? 'Leave blank to keep current' : 'Min 8 characters'}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : existing ? 'Save' : 'Add'}
        </button>
        <button onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-fg">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
