'use client'

import { useEffect, useState } from 'react'
import { X, ClipboardList, History, CalendarDays, MessageCircle, MapPin, Mail } from 'lucide-react'
import { clsx } from 'clsx'
import { Lead, SOURCE_LABEL } from '@/lib/types'
import { formatDateTime } from '@/lib/format'
import StagePill from './StagePill'
import ScoreAndSla from './ScoreAndSla'
import CounsellorAssign from './CounsellorAssign'
import InfoTab from './tabs/InfoTab'
import FollowUpTab from './tabs/FollowUpTab'
import HistoryTab from './tabs/HistoryTab'
import WhatsAppTab from './tabs/WhatsAppTab'
import VisitTab from './tabs/VisitTab'
import EmailTab from './tabs/EmailTab'
import TagEditor from './TagEditor'

type TabKey = 'info' | 'whatsapp' | 'email' | 'visit' | 'followup' | 'history'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'info', label: 'Info', icon: ClipboardList },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'visit', label: 'Visit', icon: MapPin },
  { key: 'followup', label: 'Follow Up', icon: CalendarDays },
  { key: 'history', label: 'History', icon: History },
]

export default function LeadSlideOver({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [tab, setTab] = useState<TabKey>('info')

  function load() {
    fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then(setLead)
  }

  useEffect(load, [leadId])

  async function changeStage(next: string) {
    if (!lead) return
    setLead({ ...lead, pipeline_stage: next })
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: next }),
      })
    } finally {
      load() // reconcile with server truth whether the request succeeded or not
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-card shadow-2xl">
        {!lead ? (
          <div className="p-8 text-muted">Loading…</div>
        ) : (
          <>
            <div className="border-b border-border p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-fg">{lead.full_name}</h2>
                  <p className="mt-1 text-sm text-muted">Lead ID: {lead.id.slice(0, 8)}</p>
                  <p className="text-sm text-muted">Created {formatDateTime(lead.created_at)}</p>
                </div>
                <button onClick={onClose} className="text-muted2 hover:text-fg">
                  <X size={22} />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted">Lead Name</p>
                    <p className="text-fg">{lead.full_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Child Name</p>
                    <p className="text-fg">{lead.child_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Phone</p>
                    <p className="text-fg">{lead.whatsapp_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Email</p>
                    <p className="text-fg">{lead.email || '—'}</p>
                  </div>
                </div>
                <div className="space-y-3 text-right">
                  <div className="flex justify-end">
                    <StagePill stage={lead.pipeline_stage} clientId={lead.client_id} onChange={changeStage} />
                  </div>
                  <div>
                    <p className="text-xs text-muted">Source</p>
                    <p className="text-fg">{SOURCE_LABEL[lead.source] || lead.source}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Counsellor</p>
                    <CounsellorAssign
                      leadId={lead.id}
                      currentId={lead.assigned_counsellor_id}
                      currentName={lead.counsellor_name}
                      onChanged={load}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <TagEditor leadId={lead.id} clientId={lead.client_id} />
              </div>
            </div>

            <ScoreAndSla lead={lead} />

            <div className="flex border-b border-border bg-card2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-2 border-b-2 py-4 text-sm font-medium',
                    tab === t.key ? 'border-blue-500 text-fg' : 'border-transparent text-muted2 hover:text-fg'
                  )}
                >
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 p-6">
              {tab === 'info' && <InfoTab lead={lead} onUpdated={load} />}
              {tab === 'whatsapp' && (
                <WhatsAppTab
                  leadId={lead.id}
                  nurtureDay={lead.nurture_day}
                  nurturePaused={lead.nurture_paused}
                  onLeadChanged={load}
                />
              )}
              {tab === 'email' && <EmailTab lead={lead} />}
              {tab === 'visit' && <VisitTab leadId={lead.id} />}
              {tab === 'followup' && <FollowUpTab leadId={lead.id} />}
              {tab === 'history' && <HistoryTab leadId={lead.id} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
