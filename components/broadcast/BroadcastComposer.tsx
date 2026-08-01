'use client'

import { useEffect, useState } from 'react'
import { Send, Users, RefreshCw, Tag as TagIcon, AlertTriangle } from 'lucide-react'

interface TemplateRow {
  id: string
  name: string
  category: string
  status: string
}

interface StageRow {
  key: string
  label: string
  color: string
}

interface AudienceLead {
  id: string
  full_name: string
  child_name: string | null
  whatsapp_number: string
  pipeline_stage: string
}

export default function BroadcastComposer({ clientId, onSent }: { clientId: string; onSent: () => void }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [stages, setStages] = useState<StageRow[]>([])
  const [allTags, setAllTags] = useState<string[]>([])

  const [name, setName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [languageCode, setLanguageCode] = useState('en')
  const [personalizeField, setPersonalizeField] = useState<'none' | 'full_name' | 'child_name'>('none')

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagsMode, setTagsMode] = useState<'any' | 'all'>('any')
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [lastContactedFrom, setLastContactedFrom] = useState('')
  const [lastContactedTo, setLastContactedTo] = useState('')

  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewSample, setPreviewSample] = useState<AudienceLead[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/templates/${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TemplateRow[]) => setTemplates((rows || []).filter((t) => t.status === 'approved')))
      .catch(() => {})

    fetch(`/api/pipeline-stages?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setStages)
      .catch(() => {})

    fetch(`/api/broadcasts/tags?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllTags)
      .catch(() => {})

    // Reset the audience/preview state whenever the institute changes.
    setPreviewCount(null)
    setPreviewSample([])
    setSelectedTags([])
    setSelectedStages([])
  }, [clientId])

  function currentFilters() {
    return {
      tags: selectedTags,
      tagsMode,
      stageKeys: selectedStages,
      createdFrom: createdFrom || null,
      createdTo: createdTo || null,
      lastContactedFrom: lastContactedFrom || null,
      lastContactedTo: lastContactedTo || null,
    }
  }

  async function runPreview() {
    setPreviewing(true)
    setError('')
    try {
      const res = await fetch('/api/broadcasts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, filters: currentFilters() }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(b.error || 'Could not preview audience.')
        return
      }
      setPreviewCount(b.count)
      setPreviewSample(b.sample || [])
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setPreviewing(false)
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
    setPreviewCount(null)
  }

  function toggleStage(key: string) {
    setSelectedStages((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    setPreviewCount(null)
  }

  async function send() {
    if (!name.trim() || !templateName) {
      setError('Broadcast name and template are required.')
      return
    }
    if (!previewCount) {
      setError('Preview the audience before sending — click "Preview Audience" first.')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          templateName,
          languageCode,
          personalizeField,
          filters: currentFilters(),
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(b.error || 'Could not create broadcast.')
        return
      }
      onSent()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-bold text-fg">Message</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Broadcast Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Open House Reminder — Aug 2026"
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Template</label>
            <select
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            >
              <option value="">Select an approved template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-amber-400">No approved templates yet — submit one in WhatsApp settings first.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Personalize With</label>
            <select
              value={personalizeField}
              onChange={(e) => setPersonalizeField(e.target.value as any)}
              className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
            >
              <option value="none">None (template sent as-is)</option>
              <option value="full_name">Lead's full name → {'{{1}}'}</option>
              <option value="child_name">Child's name → {'{{1}}'}</option>
            </select>
            <p className="mt-1 text-xs text-muted2">Only fills the template's first {'{{1}}'} variable, if it has one.</p>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-fg">
          <Users size={18} /> Audience
        </h2>
        <p className="mb-4 text-sm text-muted2">All filters below combine together (AND) — leave any blank to not filter by it.</p>

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <TagIcon size={13} /> Tags
            </label>
            {selectedTags.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted2">
                Match
                <select
                  value={tagsMode}
                  onChange={(e) => {
                    setTagsMode(e.target.value as any)
                    setPreviewCount(null)
                  }}
                  className="rounded border border-border bg-card2 px-1 py-0.5 text-xs text-fg"
                >
                  <option value="any">any</option>
                  <option value="all">all</option>
                </select>
                selected tags
              </div>
            )}
          </div>
          {allTags.length === 0 ? (
            <p className="text-xs text-muted">No tags used yet for this institute — add tags from a lead's card first.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    selectedTags.includes(tag)
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-border bg-card2 text-muted2 hover:text-fg'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-muted">Pipeline Stage</label>
          <div className="flex flex-wrap gap-1.5">
            {stages.map((s) => (
              <button
                key={s.key}
                onClick={() => toggleStage(s.key)}
                style={selectedStages.includes(s.key) ? { borderColor: s.color, color: s.color } : undefined}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  selectedStages.includes(s.key) ? 'bg-card2' : 'border-border bg-card2 text-muted2 hover:text-fg'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Lead Created Between</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={createdFrom}
                onChange={(e) => {
                  setCreatedFrom(e.target.value)
                  setPreviewCount(null)
                }}
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              />
              <span className="text-xs text-muted2">to</span>
              <input
                type="date"
                value={createdTo}
                onChange={(e) => {
                  setCreatedTo(e.target.value)
                  setPreviewCount(null)
                }}
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Last Contacted Between</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={lastContactedFrom}
                onChange={(e) => {
                  setLastContactedFrom(e.target.value)
                  setPreviewCount(null)
                }}
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              />
              <span className="text-xs text-muted2">to</span>
              <input
                type="date"
                value={lastContactedTo}
                onChange={(e) => {
                  setLastContactedTo(e.target.value)
                  setPreviewCount(null)
                }}
                className="w-full rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
          <button
            onClick={runPreview}
            disabled={previewing}
            className="flex items-center gap-2 rounded-md border border-border bg-card2 px-4 py-2 text-sm font-medium text-fg hover:bg-card disabled:opacity-50"
          >
            <RefreshCw size={14} className={previewing ? 'animate-spin' : ''} /> {previewing ? 'Counting…' : 'Preview Audience'}
          </button>
          {previewCount !== null && (
            <span className="text-sm text-fg">
              <strong>{previewCount.toLocaleString()}</strong> matching lead{previewCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {previewCount !== null && previewCount === 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-400">
            <AlertTriangle size={14} /> No leads match these filters — adjust the audience above.
          </p>
        )}

        {previewSample.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted">Sample (most recent {previewSample.length}):</p>
            <ul className="space-y-1 text-xs text-muted2">
              {previewSample.map((l) => (
                <li key={l.id}>
                  {l.full_name} — {l.whatsapp_number} ({l.pipeline_stage})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={send}
        disabled={sending || !previewCount}
        className="flex items-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
      >
        <Send size={16} /> {sending ? 'Queuing…' : `Send Broadcast${previewCount ? ` to ${previewCount.toLocaleString()} leads` : ''}`}
      </button>
      <p className="text-xs text-muted2">
        Sends happen gradually in the background and draw from this institute's WCC wallet, same as any other
        template message — a broadcast will stop partway and mark the rest "insufficient credit" if the wallet
        runs out.
      </p>
    </div>
  )
}
