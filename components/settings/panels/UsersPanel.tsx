'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, X, User, Ban, CheckCircle2 } from 'lucide-react'

type Role = 'agency_admin' | 'agency_staff' | 'client_admin' | 'client_counsellor'

interface UserRow {
  id: string
  full_name: string
  email: string
  role: Role
  client_id: string | null
  is_active: boolean
  created_at: string
}

const ROLE_LABEL: Record<Role, string> = {
  agency_admin: 'Agency Admin',
  agency_staff: 'Agency Staff',
  client_admin: 'Institute Admin',
  client_counsellor: 'Counsellor',
}

export default function UsersPanel({
  currentUserId,
  isAgency,
  clients,
}: {
  currentUserId: string
  isAgency: boolean
  clients: { id: string; name: string }[]
}) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setUsers(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [])

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name

  async function toggleActive(u: UserRow) {
    setError('')
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u.is_active }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to update')
        return
      }
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  async function remove(u: UserRow) {
    if (!confirm(`Delete user "${u.full_name}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to delete')
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
        <h2 className="text-lg font-bold text-fg">Users</h2>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
        >
          <Plus size={14} /> Add New
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {adding && (
        <UserForm
          isAgency={isAgency}
          clients={clients}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            load()
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) =>
          editingId === u.id ? (
            <div key={u.id} className="rounded-card border border-border bg-card2 p-4 sm:col-span-2 lg:col-span-3">
              <UserForm
                isAgency={isAgency}
                clients={clients}
                existing={u}
                isSelf={u.id === currentUserId}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null)
                  load()
                }}
              />
            </div>
          ) : (
            <div key={u.id} className="rounded-card border border-border bg-card2 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-600 text-white">
                  <User size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {u.full_name} {!u.is_active && <span className="text-xs text-red-400">(inactive)</span>}
                  </p>
                  <p className="truncate text-xs text-muted2">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                  {ROLE_LABEL[u.role]}
                </span>
                {isAgency && u.client_id && (
                  <span className="truncate text-xs text-muted2">{clientName(u.client_id)}</span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingId(u.id)}
                    className="rounded-md border border-border p-1.5 text-muted2 hover:text-fg"
                  >
                    <Pencil size={13} />
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => toggleActive(u)}
                      title={u.is_active ? 'Deactivate' : 'Reactivate'}
                      className="rounded-md border border-border p-1.5 text-muted2 hover:text-amber-400"
                    >
                      {u.is_active ? <Ban size={13} /> : <CheckCircle2 size={13} />}
                    </button>
                  )}
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => remove(u)}
                      className="rounded-md border border-border p-1.5 text-muted2 hover:text-red-400"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        )}
        {users.length === 0 && !adding && (
          <p className="col-span-full py-6 text-center text-sm text-muted">No users yet.</p>
        )}
      </div>
    </div>
  )
}

function UserForm({
  isAgency,
  clients,
  existing,
  isSelf,
  onCancel,
  onSaved,
}: {
  isAgency: boolean
  clients: { id: string; name: string }[]
  existing?: UserRow
  isSelf?: boolean
  onCancel: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(existing?.full_name || '')
  const [email, setEmail] = useState(existing?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(existing?.role || (isAgency ? 'agency_staff' : 'client_counsellor'))
  const [clientId, setClientId] = useState(existing?.client_id || clients[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAgencyRole = (r: Role) => r === 'agency_admin' || r === 'agency_staff'

  // Editing an existing user only offers roles within the same tier — the
  // API rejects flipping a user between an agency-level role and an
  // institute-scoped role (that would also mean reassigning client_id).
  const roleOptions: Role[] = existing
    ? isAgencyRole(existing.role)
      ? ['agency_admin', 'agency_staff']
      : ['client_admin', 'client_counsellor']
    : isAgency
      ? ['agency_admin', 'agency_staff', 'client_admin', 'client_counsellor']
      : ['client_admin', 'client_counsellor']

  const needsClientPicker = isAgency && (role === 'client_admin' || role === 'client_counsellor')

  async function save() {
    if (!fullName.trim() || !email.trim()) return
    if (!existing && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = existing ? `/api/users/${existing.id}` : '/api/users'
      const method = existing ? 'PATCH' : 'POST'
      const body: any = { fullName, email }
      if (!existing || password) body.password = password
      if (!existing) {
        body.role = role
        if (needsClientPicker) body.clientId = clientId
      } else if (!isSelf) {
        body.role = role
      }
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
        {(!existing || !isSelf) && (
          <div>
            <label className="mb-1 block text-xs text-muted">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        )}
        {!existing && needsClientPicker && (
          <div>
            <label className="mb-1 block text-xs text-muted">Institute</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
      {existing && !isSelf && (
        <p className="text-xs text-muted">
          Role can't be changed between an agency role and an institute role — create a new account for that.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
