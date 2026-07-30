'use client'

import { useEffect, useState } from 'react'
import { Check, RefreshCw, Send, MessageSquareText, Plus } from 'lucide-react'
import { NURTURE_TEMPLATE_DEFINITIONS } from '@/lib/nurtureTemplateDefinitions'
import { OPERATIONAL_TEMPLATE_DEFINITIONS } from '@/lib/operationalTemplateDefinitions'
import WhatsAppWalletPanel from './WhatsAppWalletPanel'

interface TemplateRow {
  id: string
  name: string
  category: string
  language: string
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  submitted_at: string
  approved_at: string | null
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-500/10 text-green-400 border-green-500/30',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || 'border-border text-muted'}`}>
      {status}
    </span>
  )
}

export default function WhatsAppSettingsPanel({ clientId }: { clientId: string }) {
  // Config form state
  const [configured, setConfigured] = useState(false)
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [tokenAlreadySet, setTokenAlreadySet] = useState(false)
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('')
  const [verified, setVerified] = useState(false)
  const [testPhone, setTestPhone] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  // Templates state
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedingOps, setSeedingOps] = useState(false)

  // Custom template form state
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('UTILITY')
  const [customBody, setCustomBody] = useState('')
  const [submittingCustom, setSubmittingCustom] = useState(false)

  // Sequence-step template assignment state: day_number -> template_name
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [assignmentsLoading, setAssignmentsLoading] = useState(true)
  const [savingDay, setSavingDay] = useState<number | null>(null)

  function loadConfig() {
    setLoading(true)
    fetch(`/api/clients/${clientId}/whatsapp-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.configured) {
          setConfigured(true)
          setPhoneNumberId(data.phoneNumberId || '')
          setWabaId(data.wabaId || '')
          setDisplayPhoneNumber(data.displayPhoneNumber || '')
          setVerified(!!data.verified)
          setTokenAlreadySet(!!data.accessToken)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  function loadTemplates() {
    setTemplatesLoading(true)
    fetch(`/api/templates/${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setTemplates(rows || []))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }

  function loadAssignments() {
    setAssignmentsLoading(true)
    fetch(`/api/clients/${clientId}/whatsapp-sequence-templates`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { day_number: number; template_name: string }[]) => {
        const map: Record<number, string> = {}
        for (const row of rows || []) map[row.day_number] = row.template_name
        setAssignments(map)
      })
      .catch(() => {})
      .finally(() => setAssignmentsLoading(false))
  }

  useEffect(() => {
    loadConfig()
    loadTemplates()
    loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function saveConfig() {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      if (!phoneNumberId || !wabaId || (!accessToken && !tokenAlreadySet)) {
        setError('Phone Number ID, WABA ID, and an access token are required.')
        return
      }
      const body: any = { phoneNumberId, wabaId, displayPhoneNumber }
      if (accessToken) body.accessToken = accessToken

      const res = await fetch(`/api/clients/${clientId}/whatsapp-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error || 'Failed to save')
        return
      }
      setAccessToken('')
      setStatus('WhatsApp config saved. Send a test message to verify it before launching sequences.')
      loadConfig()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function verify() {
    if (!testPhone) {
      setError('Enter a phone number to send the test message to (with country code).')
      return
    }
    setVerifying(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/clients/${clientId}/verify-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testPhone }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok || !b.ok) {
        setError(b.error || 'Verification failed — check the access token and phone number ID.')
        return
      }
      setStatus('Test message sent successfully — number is verified.')
      setVerified(true)
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setVerifying(false)
    }
  }

  // "Check availability" — polls Meta for the latest approval status of
  // every template still pending for this client and refreshes the table.
  async function syncStatus() {
    setSyncing(true)
    setError('')
    try {
      const res = await fetch(`/api/templates/sync/${clientId}`, { method: 'POST' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error || 'Could not check template availability with Meta.')
        return
      }
      loadTemplates()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSyncing(false)
    }
  }

  async function seedDefaults() {
    setSeeding(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp-templates/seed-defaults`, { method: 'POST' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(b.error || 'Failed to submit the default nurture templates.')
        return
      }
      setStatus(`Submitted ${b.templates?.length || 5} nurture templates to Meta as "${b.clientCode}_*". Approval usually takes a few minutes to a day — use "Check availability" to refresh status.`)
      loadTemplates()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSeeding(false)
    }
  }

  async function seedOperational() {
    setSeedingOps(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp-templates/seed-operational`, { method: 'POST' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(b.error || 'Failed to submit the operational templates.')
        return
      }
      setStatus(`Submitted ${b.templates?.length || 4} operational templates (visit reminders, no-show, post-visit) to Meta as "${b.clientCode}_*".`)
      loadTemplates()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSeedingOps(false)
    }
  }

  // Submits a fully custom template — name, category (Marketing/Utility/
  // Authentication), and body text with {{1}}, {{2}}... variables — via the
  // generic POST /api/templates/submit endpoint, same one the two default
  // buttons above call under the hood, just with user-supplied values
  // instead of a fixed definition list.
  async function submitCustomTemplate() {
    if (!customName.trim() || !customBody.trim()) {
      setError('Template name and body are required.')
      return
    }
    setSubmittingCustom(true)
    setError('')
    setStatus('')
    try {
      const res = await fetch(`/api/templates/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          name: customName.trim(),
          category: customCategory,
          language: 'en',
          components: [{ type: 'BODY', text: customBody.trim() }],
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(b.error || 'Failed to submit template.')
        return
      }
      setStatus(`Submitted "${customName.trim()}" (${customCategory}) to Meta for approval.`)
      setCustomName('')
      setCustomBody('')
      loadTemplates()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSubmittingCustom(false)
    }
  }

  // Reassigns which approved template fires on a given sequence day.
  // Saves immediately on dropdown change (no separate "Save" button per
  // row) since it's a single, low-risk field.
  async function assignTemplate(dayNumber: number, templateName: string) {
    if (!templateName) return
    setSavingDay(dayNumber)
    setError('')
    setStatus('')
    // Optimistic update — the dropdown reflects the choice immediately;
    // reverted below if the save actually fails.
    const previous = assignments[dayNumber]
    setAssignments((prev) => ({ ...prev, [dayNumber]: templateName }))
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp-sequence-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayNumber, templateName, languageCode: 'en' }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAssignments((prev) => ({ ...prev, [dayNumber]: previous }))
        setError(b.error || `Failed to assign template for Day ${dayNumber}.`)
        return
      }
      setStatus(`Day ${dayNumber} will now send "${templateName}".`)
    } catch (err: any) {
      setAssignments((prev) => ({ ...prev, [dayNumber]: previous }))
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSavingDay(null)
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="mb-1 text-lg font-bold text-fg">WhatsApp (Meta Cloud API)</h2>
        <p className="mb-4 text-sm text-muted2">
          Direct to Meta — no AiSensy, no per-client monthly platform fee. Paste the credentials from this
          client&apos;s own WhatsApp Business Account.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Phone Number ID</label>
            <input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="1029384756"
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">WhatsApp Business Account (WABA) ID</label>
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="9182736450"
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Display Phone Number</label>
            <input
              value={displayPhoneNumber}
              onChange={(e) => setDisplayPhoneNumber(e.target.value)}
              placeholder="+91 98201 00000"
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Access Token {tokenAlreadySet && <span className="text-green-400">(already set)</span>}
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={tokenAlreadySet ? 'Leave blank to keep current' : 'EAAG...'}
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            <Check size={16} /> {saving ? 'Saving…' : 'Save WhatsApp Config'}
          </button>
          {configured && (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${verified ? STATUS_STYLES.approved : STATUS_STYLES.pending}`}>
              {verified ? 'Verified' : 'Not verified yet'}
            </span>
          )}
        </div>

        {configured && (
          <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">Send a test message to (with country code)</label>
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="919820100000"
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={verify}
              disabled={verifying}
              className="flex items-center gap-2 rounded-md border border-border bg-card2 px-4 py-2 text-sm font-medium text-fg hover:bg-card disabled:opacity-50"
            >
              <Send size={14} /> {verifying ? 'Sending…' : 'Send Test & Verify'}
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {status && <p className="mt-4 text-sm text-green-400">{status}</p>}
      </div>

      <WhatsAppWalletPanel clientId={clientId} />

      <div className="rounded-card border border-border bg-card p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">Nurture Templates</h2>
          <div className="flex gap-2">
            <button
              onClick={seedDefaults}
              disabled={seeding || !configured}
              title={!configured ? 'Save WhatsApp config first' : ''}
              className="flex items-center gap-2 rounded-md border border-border bg-card2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-card disabled:opacity-50"
            >
              <MessageSquareText size={14} /> {seeding ? 'Submitting…' : 'Submit default 5 templates'}
            </button>
            <button
              onClick={seedOperational}
              disabled={seedingOps || !configured}
              title={!configured ? 'Save WhatsApp config first' : ''}
              className="flex items-center gap-2 rounded-md border border-border bg-card2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-card disabled:opacity-50"
            >
              <MessageSquareText size={14} /> {seedingOps ? 'Submitting…' : 'Submit operational templates'}
            </button>
            <button
              onClick={syncStatus}
              disabled={syncing}
              className="flex items-center gap-2 rounded-md border border-border bg-card2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-card disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Checking…' : 'Check availability'}
            </button>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted2">
          <strong>Default 5</strong> — Day 0/2/4/7/10 of the nurture sequence (welcome, story, fee justification,
          urgency, final visit nudge). <strong>Operational</strong> — post-visit summary, 48h/24h visit reminders,
          and the no-show reschedule nudge, fired by lead lifecycle events rather than the sequence schedule. Meta
          reviews every new template before it can be used — &quot;Check availability&quot; polls Meta for the
          current approval status of anything still pending.
        </p>

        {templatesLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted">
            No templates submitted yet for this client. Click &quot;Submit default 5 templates&quot; to send the
            standard nurture sequence to Meta for approval.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Template</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Submitted</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 font-mono text-xs text-fg">{t.name}</td>
                  <td className="py-2 pr-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-2 pr-2 text-xs text-muted2">
                    {t.submitted_at ? new Date(t.submitted_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2 text-xs text-muted2">{t.rejection_reason || (t.status === 'approved' ? 'Ready to send' : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-1 text-sm font-semibold text-fg">Assign Templates to Sequence Steps</h3>
          <p className="mb-3 text-xs text-muted2">
            Pick which approved template fires on each day of the nurture sequence. Only templates Meta has
            approved for this client show up as options — submit and wait for approval first if a step shows
            "No approved templates yet."
          </p>
          {assignmentsLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <div className="space-y-2">
              {NURTURE_TEMPLATE_DEFINITIONS.map((def, i) => {
                const approvedTemplates = templates.filter((t) => t.status === 'approved')
                const current = assignments[def.day] || ''
                return (
                  <div key={def.day} className="flex items-center gap-3 rounded-md border border-border bg-card2 px-3 py-2">
                    <span className="w-20 shrink-0 text-xs font-medium text-muted">
                      Step {i + 1} · Day {def.day}
                    </span>
                    {approvedTemplates.length === 0 ? (
                      <span className="text-xs text-muted">No approved templates yet</span>
                    ) : (
                      <select
                        value={current}
                        onChange={(e) => assignTemplate(def.day, e.target.value)}
                        disabled={savingDay === def.day}
                        className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-fg outline-none focus:border-blue-500 disabled:opacity-50"
                      >
                        <option value="" disabled>
                          Select a template…
                        </option>
                        {approvedTemplates.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {savingDay === def.day && <RefreshCw size={12} className="shrink-0 animate-spin text-muted" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
            <Plus size={14} /> Create Custom Template
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Template Name</label>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. summer_offer_2026"
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Category</label>
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as any)}
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              >
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-muted">Body — use {'{{1}}'}, {'{{2}}'} for variables</label>
            <textarea
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              rows={3}
              placeholder="Hi {{1}}, we have a special offer on {{2}} this month..."
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={submitCustomTemplate}
            disabled={submittingCustom || !configured}
            title={!configured ? 'Save WhatsApp config first' : ''}
            className="mt-3 flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            <Send size={14} /> {submittingCustom ? 'Submitting…' : 'Submit Template'}
          </button>
        </div>

        <p className="mt-4 text-xs text-muted">
          {NURTURE_TEMPLATE_DEFINITIONS.length} nurture templates ({NURTURE_TEMPLATE_DEFINITIONS.map((d) => `Day ${d.day}`).join(', ')}) +{' '}
          {OPERATIONAL_TEMPLATE_DEFINITIONS.length} operational templates.
        </p>
      </div>
    </div>
  )
}
