'use client'

import { useEffect, useState } from 'react'
import { Mail, PenSquare } from 'lucide-react'
import { Lead } from '@/lib/types'
import { renderEmailTemplate, EMAIL_TEMPLATE_LABELS } from '@/lib/emailTemplates'
import EmailPreviewModal from '../EmailPreviewModal'

interface EmailMessage {
  id: string
  template_key: string | null
  subject: string
  body: string
  to_email: string
  status: 'sent' | 'failed'
  error: string | null
  sent_by_name: string | null
  created_at: string
}

function fmt(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function EmailTab({ lead }: { lead: Lead }) {
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [modal, setModal] = useState<{ subject: string; body: string; templateKey?: string } | null>(null)

  function load() {
    fetch(`/api/leads/${lead.id}/email`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMessages(Array.isArray(data) ? data : []))
  }

  useEffect(load, [lead.id])

  function openTemplate(key: string) {
    const { subject, body } = renderEmailTemplate(key, {
      leadName: lead.full_name,
      childName: lead.child_name,
      instituteName: lead.client_name,
      counsellorName: lead.counsellor_name,
    })
    setModal({ subject, body, templateKey: key })
  }

  function openCompose() {
    setModal({ subject: '', body: `Hi ${lead.full_name},\n\n` })
  }

  return (
    <div>
      {!lead.email && (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          This lead has no email address on file — add one from the Info tab to enable sending.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(EMAIL_TEMPLATE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => openTemplate(key)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card2 px-3 py-1.5 text-sm text-fg hover:border-blue-500"
          >
            <Mail size={14} /> {label}
          </button>
        ))}
        <button
          onClick={openCompose}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          <PenSquare size={14} /> Compose
        </button>
      </div>

      <div className="space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="rounded-card border border-border bg-card2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-fg">{m.subject}</p>
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                  m.status === 'sent' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                }`}
              >
                {m.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted2">
              To {m.to_email} · {fmt(m.created_at)} {m.sent_by_name ? `· ${m.sent_by_name}` : '· automated'}
            </p>
            {m.error && <p className="mt-1 text-xs text-red-400">{m.error}</p>}
          </div>
        ))}
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">No emails sent yet.</p>}
      </div>

      {modal && (
        <EmailPreviewModal
          leadId={lead.id}
          to={lead.email}
          initialSubject={modal.subject}
          initialBody={modal.body}
          templateKey={modal.templateKey}
          onClose={() => setModal(null)}
          onSent={() => {
            setModal(null)
            load()
          }}
        />
      )}
    </div>
  )
}
