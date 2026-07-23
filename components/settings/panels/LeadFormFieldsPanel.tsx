'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Pencil, X, Check } from 'lucide-react'

// Same built-in leads columns the Info tab / Add Lead form expose — kept in
// sync with EDITABLE_FIELDS + FIELD_LABEL in app/api/leads/[id]/route.ts.
const BUILT_IN_FIELDS: { key: string; defaultLabel: string }[] = [
  { key: 'full_name', defaultLabel: 'Lead Name' },
  { key: 'child_name', defaultLabel: 'Child Name' },
  { key: 'whatsapp_number', defaultLabel: 'WhatsApp' },
  { key: 'second_phone', defaultLabel: 'Phone' },
  { key: 'email', defaultLabel: 'Email' },
  { key: 'occupation', defaultLabel: 'Occupation' },
  { key: 'company_name', defaultLabel: 'Company Name' },
  { key: 'location', defaultLabel: 'City' },
  { key: 'grade', defaultLabel: "Child's Class" },
  { key: 'service_interested_in', defaultLabel: 'Course' },
  { key: 'timeline', defaultLabel: 'Joining timeline' },
  { key: 'decision_maker', defaultLabel: 'Decision maker' },
  { key: 'competitors_visited', defaultLabel: 'Competitors shortlisted' },
  { key: 'key_concern', defaultLabel: 'Key concern' },
]

interface FieldSetting {
  field_key: string
  label: string | null
  is_visible: boolean
}

interface CustomField {
  id: string
  field_key: string
  label: string
  field_type: 'text' | 'dropdown' | 'date' | 'time' | 'number'
  options: string[] | null
  is_active: boolean
}

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function LeadFormFieldsPanel({ clientId }: { clientId: string }) {
  const [settings, setSettings] = useState<Record<string, FieldSetting>>({})
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingBuiltIn, setEditingBuiltIn] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      fetch(`/api/field-settings?clientId=${clientId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/lead-form-fields?clientId=${clientId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([settingRows, fieldRows]) => {
        const map: Record<string, FieldSetting> = {}
        for (const s of settingRows) map[s.field_key] = s
        setSettings(map)
        setCustomFields(Array.isArray(fieldRows) ? fieldRows : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(load, [clientId])

  async function saveBuiltIn(fieldKey: string, patch: { label?: string; isVisible?: boolean }) {
    setError('')
    const current = settings[fieldKey]
    const builtIn = BUILT_IN_FIELDS.find((f) => f.key === fieldKey)
    try {
      const res = await fetch('/api/field-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          fieldKey,
          label: patch.label ?? current?.label ?? builtIn?.defaultLabel,
          isVisible: patch.isVisible ?? current?.is_visible ?? true,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
        return
      }
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    }
  }

  async function toggleCustom(field: CustomField) {
    setError('')
    try {
      const res = await fetch(`/api/lead-form-fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !field.is_active }),
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

  async function removeCustom(field: CustomField) {
    if (!confirm(`Delete custom field "${field.label}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/lead-form-fields/${field.id}`, { method: 'DELETE' })
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
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="mb-1 text-lg font-bold text-fg">Built-in Fields</h2>
        <p className="mb-4 text-sm text-muted2">Rename or hide fields already built into the lead form.</p>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <div className="space-y-2">
          {BUILT_IN_FIELDS.map((f) => {
            const setting = settings[f.key]
            const label = setting?.label || f.defaultLabel
            const visible = setting?.is_visible ?? true
            return (
              <div key={f.key} className="flex items-center justify-between rounded-md border border-border bg-card2 px-4 py-2.5">
                {editingBuiltIn === f.key ? (
                  <input
                    autoFocus
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveBuiltIn(f.key, { label: editingLabel })
                        setEditingBuiltIn(null)
                      }
                    }}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-fg outline-none focus:border-blue-500"
                  />
                ) : (
                  <span className={clsx('text-sm', visible ? 'text-fg' : 'text-muted line-through')}>{label}</span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveBuiltIn(f.key, { isVisible: !visible })}
                    className={clsx(
                      'rounded-md border px-3 py-1 text-xs font-semibold',
                      visible ? 'border-green-500 text-green-400' : 'border-border text-muted2'
                    )}
                  >
                    {visible ? 'ON' : 'OFF'}
                  </button>
                  {editingBuiltIn === f.key ? (
                    <button
                      onClick={() => {
                        saveBuiltIn(f.key, { label: editingLabel })
                        setEditingBuiltIn(null)
                      }}
                      className="rounded-md border border-border p-1.5 text-green-400 hover:bg-card"
                    >
                      <Check size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingBuiltIn(f.key)
                        setEditingLabel(label)
                      }}
                      className="rounded-md border border-border p-1.5 text-muted2 hover:text-fg"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-fg">Custom Fields</h2>
            <p className="text-sm text-muted2">Add fields specific to this institute — shown on Add Lead and the lead's Info tab.</p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
          >
            <Plus size={14} /> Add New
          </button>
        </div>

        {adding && (
          <NewFieldForm
            clientId={clientId}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false)
              load()
            }}
          />
        )}

        <div className="space-y-2">
          {customFields.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border border-border bg-card2 px-4 py-2.5">
              <div>
                <span className={clsx('text-sm', f.is_active ? 'text-fg' : 'text-muted line-through')}>{f.label}</span>
                <span className="ml-2 rounded-md bg-card px-2 py-0.5 text-xs text-muted2">{f.field_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleCustom(f)}
                  className={clsx(
                    'rounded-md border px-3 py-1 text-xs font-semibold',
                    f.is_active ? 'border-green-500 text-green-400' : 'border-border text-muted2'
                  )}
                >
                  {f.is_active ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => removeCustom(f)} className="rounded-md border border-border p-1.5 text-muted2 hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
          {customFields.length === 0 && !adding && <p className="py-6 text-center text-sm text-muted">No custom fields yet.</p>}
        </div>
      </div>
    </div>
  )
}

function NewFieldForm({ clientId, onCancel, onSaved }: { clientId: string; onCancel: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<CustomField['field_type']>('text')
  const [optionsText, setOptionsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    setError('')
    try {
      const options = fieldType === 'dropdown' ? optionsText.split(',').map((s) => s.trim()).filter(Boolean) : undefined
      const res = await fetch('/api/lead-form-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, fieldKey: slugify(label), label, fieldType, options }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to add field')
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
          <label className="mb-1 block text-xs text-muted">Field name</label>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Current School"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Type</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomField['field_type'])}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="time">Time</option>
            <option value="dropdown">Dropdown</option>
          </select>
        </div>
        {fieldType === 'dropdown' && (
          <div>
            <label className="mb-1 block text-xs text-muted">Options (comma-separated)</label>
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Option A, Option B"
              className="w-64 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
        )}
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
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
