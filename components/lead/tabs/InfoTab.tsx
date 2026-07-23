'use client'

import { useEffect, useState } from 'react'
import { Pencil, X, Check } from 'lucide-react'
import { Lead, TIMELINE_LABEL, SOURCE_LABEL, DECISION_MAKER_LABEL } from '@/lib/types'

interface CustomFieldDef {
  id: string
  field_key: string
  label: string
  field_type: 'text' | 'dropdown' | 'date' | 'time' | 'number'
  options: string[] | null
  is_active: boolean
}

type FormState = {
  full_name: string
  child_name: string
  email: string
  whatsapp_number: string
  second_phone: string
  occupation: string
  source: string
  grade: string
  company_name: string
  location: string
  service_interested_in: string
  timeline: string
  decision_maker: string
  competitors_visited: string
  key_concern: string
}

function toFormState(lead: Lead): FormState {
  return {
    full_name: lead.full_name || '',
    child_name: lead.child_name || '',
    email: lead.email || '',
    whatsapp_number: lead.whatsapp_number || '',
    second_phone: lead.second_phone || '',
    occupation: lead.occupation || '',
    source: lead.source || '',
    grade: lead.grade || '',
    company_name: lead.company_name || '',
    location: lead.location || '',
    service_interested_in: lead.service_interested_in || '',
    timeline: lead.timeline || '',
    decision_maker: lead.decision_maker || '',
    competitors_visited: lead.competitors_visited || '',
    key_concern: lead.key_concern || '',
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm text-fg">{value || <span className="text-muted">—</span>}</p>
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder = '—',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Record<string, string>
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
      >
        <option value="">{placeholder}</option>
        {Object.entries(options).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-5 pt-5 first:pt-0 last:border-0">
      <h3 className="mb-3 text-sm font-bold text-fg">{title}</h3>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

export default function InfoTab({ lead, onUpdated }: { lead: Lead; onUpdated?: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<FormState>(() => toFormState(lead))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customDefs, setCustomDefs] = useState<CustomFieldDef[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>(lead.custom_fields || {})

  useEffect(() => {
    fetch(`/api/lead-form-fields?clientId=${lead.client_id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCustomDefs(Array.isArray(data) ? data.filter((f: CustomFieldDef) => f.is_active) : []))
  }, [lead.client_id])

  useEffect(() => {
    setCustomValues(lead.custom_fields || {})
  }, [lead.custom_fields])

  function startEdit() {
    setForm(toFormState(lead))
    setCustomValues(lead.custom_fields || {})
    setError('')
    setEditing(true)
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setCustom(key: string, value: string) {
    setCustomValues((v) => ({ ...v, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, customFields: customValues }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to save')
        return
      }
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
      setSaving(false)
      return
    }
    setSaving(false)
    setEditing(false)
    onUpdated?.()
  }

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted2">Editing lead details</p>
          <div className="flex items-center gap-2">
            {error && <span className="text-sm text-red-400">{error}</span>}
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-fg"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-fg hover:bg-blue-500 disabled:opacity-50"
            >
              <Check size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <Section title="Full Identity">
          <EditField label="Lead Name" value={form.full_name} onChange={(v) => set('full_name', v)} />
          <EditField label="Child Name" value={form.child_name} onChange={(v) => set('child_name', v)} />
          <EditField label="Email" value={form.email} onChange={(v) => set('email', v)} />
          <EditField label="WhatsApp" value={form.whatsapp_number} onChange={(v) => set('whatsapp_number', v)} />
          <EditField label="Phone" value={form.second_phone} onChange={(v) => set('second_phone', v)} />
          <EditField label="City" value={form.location} onChange={(v) => set('location', v)} />
          <EditField label="Occupation" value={form.occupation} onChange={(v) => set('occupation', v)} />
          <Select label="Source" value={form.source} onChange={(v) => set('source', v)} options={SOURCE_LABEL} placeholder="Select source" />
        </Section>

        <Section title="Program Details">
          <Field label="Institution" value={lead.client_name} />
          <EditField
            label="Course"
            value={form.service_interested_in}
            onChange={(v) => set('service_interested_in', v)}
          />
          <EditField label="Child's Class" value={form.grade} onChange={(v) => set('grade', v)} />
          <Select label="Joining timeline" value={form.timeline} onChange={(v) => set('timeline', v)} options={TIMELINE_LABEL} />
        </Section>

        <Section title="Decision & Objections">
          <Select
            label="Decision maker"
            value={form.decision_maker}
            onChange={(v) => set('decision_maker', v)}
            options={DECISION_MAKER_LABEL}
            placeholder="Select decision maker"
          />
          <EditField
            label="Competitors shortlisted"
            value={form.competitors_visited}
            onChange={(v) => set('competitors_visited', v)}
          />
          <div className="col-span-2">
            <label className="text-xs text-muted">Key concern / objection</label>
            <textarea
              value={form.key_concern}
              onChange={(e) => set('key_concern', e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
        </Section>

        <Section title="Other">
          <EditField label="Company Name" value={form.company_name} onChange={(v) => set('company_name', v)} />
        </Section>

        {customDefs.length > 0 && (
          <Section title="Custom Fields">
            {customDefs.map((f) =>
              f.field_type === 'dropdown' ? (
                <Select
                  key={f.field_key}
                  label={f.label}
                  value={customValues[f.field_key] || ''}
                  onChange={(v) => setCustom(f.field_key, v)}
                  options={Object.fromEntries((f.options || []).map((o) => [o, o]))}
                />
              ) : (
                <div key={f.field_key}>
                  <label className="text-xs text-muted">{f.label}</label>
                  <input
                    type={f.field_type === 'date' ? 'date' : f.field_type === 'time' ? 'time' : f.field_type === 'number' ? 'number' : 'text'}
                    value={customValues[f.field_key] || ''}
                    onChange={(e) => setCustom(f.field_key, e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-blue-500"
                  />
                </div>
              )
            )}
          </Section>
        )}

        <Section title="Campaign">
          <Field label="Source campaign" value={lead.campaign_display_name} />
          <Field label="Platform" value={lead.campaign_platform} />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={startEdit}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted2 hover:text-fg"
        >
          <Pencil size={14} /> Edit
        </button>
      </div>

      <Section title="Full Identity">
        <Field label="Lead Name" value={lead.full_name} />
        <Field label="Child Name" value={lead.child_name} />
        <Field label="Email" value={lead.email} />
        <Field label="WhatsApp" value={lead.whatsapp_number} />
        <Field label="Phone" value={lead.second_phone} />
        <Field label="City" value={lead.location} />
        <Field label="Occupation" value={lead.occupation} />
        <Field label="Source" value={SOURCE_LABEL[lead.source] || lead.source} />
      </Section>

      <Section title="Program Details">
        <Field label="Institution" value={lead.client_name} />
        <Field label="Course" value={lead.service_interested_in} />
        <Field label="Child's Class" value={lead.grade} />
        <Field label="Joining timeline" value={lead.timeline ? TIMELINE_LABEL[lead.timeline] : null} />
      </Section>

      <Section title="Decision & Objections">
        <Field label="Decision maker" value={lead.decision_maker ? DECISION_MAKER_LABEL[lead.decision_maker] || lead.decision_maker : null} />
        <Field label="Competitors shortlisted" value={lead.competitors_visited} />
        <div className="col-span-2">
          <Field label="Key concern / objection" value={lead.key_concern} />
        </div>
      </Section>

      <Section title="Other">
        <Field label="Company Name" value={lead.company_name} />
      </Section>

      {customDefs.length > 0 && (
        <Section title="Custom Fields">
          {customDefs.map((f) => (
            <Field key={f.field_key} label={f.label} value={lead.custom_fields?.[f.field_key]} />
          ))}
        </Section>
      )}

      <Section title="Campaign">
        <Field label="Source campaign" value={lead.campaign_display_name} />
        <Field label="Platform" value={lead.campaign_platform} />
      </Section>
    </div>
  )
}
