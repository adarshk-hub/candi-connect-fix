'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 truncate rounded-md border border-border bg-card px-3 py-2 text-xs text-fg ${mono ? 'font-mono' : ''}`}>
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="shrink-0 rounded-md border border-border p-2 text-muted2 hover:text-fg"
          title="Copy"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

export default function WebhookCard({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: { label: string; value: string }[]
}) {
  return (
    <div className="rounded-card border border-border bg-card2 p-5">
      <h3 className="font-semibold text-fg">{title}</h3>
      <p className="mb-4 mt-1 text-sm text-muted2">{description}</p>
      <div className="space-y-3">
        {rows.map((r) => (
          <CopyRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  )
}
