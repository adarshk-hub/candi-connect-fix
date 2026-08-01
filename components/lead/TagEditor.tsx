'use client'

import { useEffect, useRef, useState } from 'react'
import { Tag, X, Plus } from 'lucide-react'

export default function TagEditor({ leadId, clientId }: { leadId: string; clientId?: string }) {
  const [tags, setTags] = useState<string[]>([])
  const [allClientTags, setAllClientTags] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function load() {
    fetch(`/api/leads/${leadId}/tags`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTags)
      .catch(() => {})
  }

  useEffect(load, [leadId])

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus()
  }, [adding])

  function startAdding() {
    setAdding(true)
    // Fetch this client's existing tag vocabulary lazily, only when the
    // input actually opens, for lightweight autocomplete via <datalist>.
    const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''
    fetch(`/api/broadcasts/tags${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllClientTags)
      .catch(() => {})
  }

  async function addTag() {
    const tag = input.trim()
    if (!tag) {
      setAdding(false)
      return
    }
    setInput('')
    setAdding(false)
    const prev = tags
    setTags((t) => (t.includes(tag) ? t : [...t, tag].sort()))
    try {
      const res = await fetch(`/api/leads/${leadId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      if (res.ok) setTags(await res.json())
      else setTags(prev)
    } catch {
      setTags(prev)
    }
  }

  async function removeTag(tag: string) {
    const prev = tags
    setTags((t) => t.filter((x) => x !== tag))
    try {
      const res = await fetch(`/api/leads/${leadId}/tags?tag=${encodeURIComponent(tag)}`, { method: 'DELETE' })
      if (res.ok) setTags(await res.json())
      else setTags(prev)
    } catch {
      setTags(prev)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={13} className="text-muted" />
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-border bg-card2 px-2 py-0.5 text-xs text-fg"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="text-muted2 hover:text-red-400">
            <X size={11} />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          ref={inputRef}
          list="tag-suggestions"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={addTag}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTag()
            if (e.key === 'Escape') {
              setInput('')
              setAdding(false)
            }
          }}
          placeholder="Tag name"
          className="w-28 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-fg outline-none focus:border-blue-500"
        />
      ) : (
        <button
          onClick={startAdding}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted2 hover:border-blue-500 hover:text-fg"
        >
          <Plus size={11} /> Add tag
        </button>
      )}

      <datalist id="tag-suggestions">
        {allClientTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}
