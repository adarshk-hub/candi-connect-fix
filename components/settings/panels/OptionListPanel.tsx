'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, X, Check } from 'lucide-react'

interface OptionItem {
  id: string
  list_key: string
  value: string
  is_active: boolean
  sort_order: number
}

export default function OptionListPanel({
  clientId,
  listKey,
  title,
}: {
  clientId: string
  listKey: string
  title: string
}) {
  const [items, setItems] = useState<OptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function load() {
    setLoading(true)
    fetch(`/api/option-items?clientId=${clientId}&listKey=${listKey}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [clientId, listKey])

  async function addItem() {
    if (!newValue.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/option-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, listKey, value: newValue.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to add')
        return
      }
      setNewValue('')
      setAdding(false)
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(id: string) {
    if (!editValue.trim()) return
    setError('')
    try {
      const res = await fetch(`/api/option-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
        return
      }
      setEditingId(null)
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this item?')) return
    setError('')
    try {
      const res = await fetch(`/api/option-items/${id}`, { method: 'DELETE' })
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
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
        >
          <Plus size={14} /> Add New
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {adding && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-card2 p-3">
          <input
            autoFocus
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="New value"
            className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
          <button
            onClick={addItem}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={() => {
              setAdding(false)
              setNewValue('')
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-fg"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-md border border-border bg-card2 px-4 py-2.5">
            {editingId === item.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-fg outline-none focus:border-blue-500"
              />
            ) : (
              <span className="text-sm text-fg">{item.value}</span>
            )}
            <div className="flex items-center gap-2">
              {editingId === item.id ? (
                <button onClick={() => saveEdit(item.id)} className="rounded-md border border-border p-1.5 text-green-400 hover:bg-card">
                  <Check size={14} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setEditingId(item.id)
                    setEditValue(item.value)
                  }}
                  className="rounded-md border border-border p-1.5 text-muted2 hover:text-fg"
                >
                  <Pencil size={14} />
                </button>
              )}
              <button onClick={() => remove(item.id)} className="rounded-md border border-border p-1.5 text-muted2 hover:text-red-400">
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && !adding && <p className="py-6 text-center text-sm text-muted">No items yet.</p>}
      </div>
    </div>
  )
}
