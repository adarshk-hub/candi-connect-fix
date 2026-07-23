'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { ArrowUp, ArrowDown, Pencil, Plus, X } from 'lucide-react'

interface Stage {
  id: string
  key: string
  label: string
  color: string
  status_group: 'warm' | 'hot' | 'cold' | 'won'
  max_minutes: number | null
  is_cold_lane: boolean
  is_active: boolean
  sort_order: number
}

const STATUS_LABEL: Record<string, string> = { warm: 'Warm', hot: 'Hot', cold: 'Cold', won: 'Won' }
const STATUS_PILL: Record<string, string> = {
  warm: 'bg-blue-500/20 text-blue-300',
  hot: 'bg-amber-500/20 text-amber-300',
  cold: 'bg-zinc-600/40 text-zinc-300',
  won: 'bg-green-500/20 text-green-300',
}

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function LeadStagesPanel({ clientId }: { clientId: string }) {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/pipeline-stages?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setStages(Array.isArray(data) ? data.sort((a, b) => a.sort_order - b.sort_order) : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [clientId])

  async function patchStage(id: string, patch: Record<string, any>) {
    setError('')
    try {
      const res = await fetch(`/api/pipeline-stages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to update stage')
        return
      }
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  async function move(stage: Stage, dir: -1 | 1) {
    const idx = stages.findIndex((s) => s.id === stage.id)
    const swapWith = stages[idx + dir]
    if (!swapWith) return
    await Promise.all([
      patchStage(stage.id, { sortOrder: swapWith.sort_order }),
      patchStage(swapWith.id, { sortOrder: stage.sort_order }),
    ])
  }

  async function removeStage(stage: Stage) {
    if (!confirm(`Delete stage "${stage.label}"? This can't be undone.`)) return
    setError('')
    try {
      const res = await fetch(`/api/pipeline-stages/${stage.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to delete stage')
        return
      }
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="rounded-card border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-5">
        <h2 className="text-lg font-bold text-fg">Lead Stages</h2>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          <Plus size={14} /> Add Stage
        </button>
      </div>
      {error && <p className="px-5 pt-3 text-sm text-red-400">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card2 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 w-24">Move</th>
            <th className="px-5 py-3">Stage Name</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 w-40">Actions</th>
          </tr>
        </thead>
        <tbody>
          {adding && (
            <NewStageRow
              onCancel={() => setAdding(false)}
              onSaved={() => {
                setAdding(false)
                load()
              }}
              clientId={clientId}
            />
          )}
          {stages.map((s, i) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              {editingId === s.id ? (
                <EditRow
                  stage={s}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null)
                    load()
                  }}
                />
              ) : (
                <>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => move(s, -1)}
                        disabled={i === 0}
                        className="rounded p-1 text-muted2 hover:text-fg disabled:opacity-30"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => move(s, 1)}
                        disabled={i === stages.length - 1}
                        className="rounded p-1 text-muted2 hover:text-fg disabled:opacity-30"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-block rounded-md px-3 py-1 text-xs font-semibold text-zinc-900"
                      style={{ backgroundColor: s.color }}
                    >
                      {s.label}
                    </span>
                    <p className="mt-1 text-xs text-muted">Key: {s.key}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx('rounded-md px-2.5 py-1 text-xs font-medium', STATUS_PILL[s.status_group])}>
                      {STATUS_LABEL[s.status_group]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patchStage(s.id, { isActive: !s.is_active })}
                        className={clsx(
                          'rounded-md border px-3 py-1 text-xs font-semibold',
                          s.is_active ? 'border-green-500 text-green-400' : 'border-border text-muted2'
                        )}
                      >
                        {s.is_active ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => setEditingId(s.id)}
                        className="rounded-md border border-border p-1.5 text-muted2 hover:text-fg"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => removeStage(s)}
                        className="rounded-md border border-border p-1.5 text-muted2 hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EditRow({ stage, onCancel, onSaved }: { stage: Stage; onCancel: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(stage.label)
  const [color, setColor] = useState(stage.color)
  const [statusGroup, setStatusGroup] = useState(stage.status_group)
  const [maxMinutes, setMaxMinutes] = useState(stage.max_minutes?.toString() || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/pipeline-stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          color,
          statusGroup,
          maxMinutes: maxMinutes ? Number(maxMinutes) : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
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
    <td colSpan={4} className="px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 rounded-md border border-border bg-card2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Status group</label>
          <select
            value={statusGroup}
            onChange={(e) => setStatusGroup(e.target.value as Stage['status_group'])}
            className="rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          >
            <option value="warm">Warm</option>
            <option value="hot">Hot</option>
            <option value="cold">Cold</option>
            <option value="won">Won</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">SLA (minutes, blank = none)</label>
          <input
            type="number"
            min="0"
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(e.target.value)}
            className="w-32 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-fg">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </td>
  )
}

function NewStageRow({
  clientId,
  onCancel,
  onSaved,
}: {
  clientId: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState('')
  const [statusGroup, setStatusGroup] = useState<Stage['status_group']>('warm')
  const [color, setColor] = useState('#60a5fa')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, key: slugify(label), label, color, statusGroup }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to add stage')
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
    <tr className="border-b border-border bg-card2/40">
      <td colSpan={4} className="px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Stage name</label>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Nurture"
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 rounded-md border border-border bg-card"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Status group</label>
            <select
              value={statusGroup}
              onChange={(e) => setStatusGroup(e.target.value as Stage['status_group'])}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
            >
              <option value="warm">Warm</option>
              <option value="hot">Hot</option>
              <option value="cold">Cold</option>
              <option value="won">Won</option>
            </select>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-fg">
            Cancel
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </td>
    </tr>
  )
}
