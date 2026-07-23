'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Filter, Plus, List, LayoutGrid } from 'lucide-react'
import { clsx } from 'clsx'
import { useStages } from '@/lib/StagesContext'
import { SOURCE_LABEL, initials } from '@/lib/types'
import { useColumnWidths } from '@/lib/useColumnWidths'
import ResizableTh from '@/components/ui/ResizableTh'
import LeadSlideOver from '@/components/lead/LeadSlideOver'
import KanbanBoard from '@/components/lead/KanbanBoard'
import AddLeadModal from '@/components/lead/AddLeadModal'

interface LeadRow {
  id: string
  client_id: string
  full_name: string
  child_name: string | null
  whatsapp_number: string
  grade: string | null
  pipeline_stage: string
  source: string
  lead_score: number
  created_at: string
  counsellor_name: string | null
}

const TAB_TITLE: Record<string, string> = {
  warm: 'Warm Leads',
  hot: 'Hot Leads',
  cold: 'Cold Leads',
  enrolled: 'Enrolled',
}

const COLUMN_DEFAULTS = {
  id: 110,
  lead: 220,
  phone: 160,
  grade: 90,
  stage: 140,
  source: 150,
  counsellor: 130,
}

const TOOLBAR_BTN = 'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted2 hover:bg-card2 hover:text-fg'
const TD = 'truncate border-r border-border px-4 py-3 last:border-r-0'

function StagePillView({ stage, clientId }: { stage: string; clientId: string }) {
  const { stageLabel, stageColor } = useStages()
  return (
    <span
      className="inline-block rounded-md px-2.5 py-1 text-xs font-semibold text-zinc-900"
      style={{ backgroundColor: stageColor(stage, clientId) }}
    >
      {stageLabel(stage, clientId)}
    </span>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || ''
  const page = Number(searchParams.get('page') || '1')
  const view = searchParams.get('view') === 'kanban' ? 'kanban' : 'list'

  function setView(v: 'list' | 'kanban') {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'kanban') params.set('view', 'kanban')
    else params.delete('view')
    router.push(`/leads?${params.toString()}`)
  }

  const [leads, setLeads] = useState<LeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(250)
  const [search, setSearch] = useState('')
  const [activeLead, setActiveLead] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingLead, setAddingLead] = useState(false)

  const { widths, setWidth } = useColumnWidths('leads-list', COLUMN_DEFAULTS)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (tab) params.set('tab', tab)
    if (search) params.set('search', search)
    fetch(`/api/leads?${params.toString()}`)
      .then(async (r) => {
        if (r.status === 401) {
          router.push('/login')
          return null
        }
        return r.json()
      })
      .then((data) => {
        if (!data) return
        setLeads(data.leads || [])
        setTotal(data.total || 0)
        setPageSize(data.pageSize || 250)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [tab, page, search, router])

  useEffect(load, [load])

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/leads?${params.toString()}`)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">{TAB_TITLE[tab] || 'All Leads'}</h1>
          <p className="text-muted2">Total Leads {total}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 border-b border-border">
            <button
              onClick={() => setView('list')}
              className={clsx(
                'flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm',
                view === 'list' ? 'border-blue-500 font-medium text-fg' : 'border-transparent text-muted2 hover:text-fg'
              )}
            >
              <List size={14} /> List
            </button>
            <button
              onClick={() => setView('kanban')}
              className={clsx(
                'flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm',
                view === 'kanban' ? 'border-blue-500 font-medium text-fg' : 'border-transparent text-muted2 hover:text-fg'
              )}
            >
              <LayoutGrid size={14} /> Kanban
            </button>
          </div>
          {view === 'list' && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-64 rounded-md border border-border bg-card2 py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-blue-500"
              />
            </div>
          )}
          {view === 'list' && (
            <button className={TOOLBAR_BTN}>
              <Filter size={16} /> Filter
            </button>
          )}
          <button
            onClick={() => setAddingLead(true)}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus size={16} /> Add Lead
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <KanbanBoard />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-sm text-muted2">
            <span>
              Showing {from} to {to} of {total} leads
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
              >
                First
              </button>
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 text-fg">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Last
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-card border border-border bg-card">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border bg-card2 text-left text-xs uppercase tracking-wide text-muted">
                  <ResizableTh width={widths.id} onResize={(w) => setWidth('id', w)}>
                    ID
                  </ResizableTh>
                  <ResizableTh width={widths.lead} onResize={(w) => setWidth('lead', w)}>
                    Lead
                  </ResizableTh>
                  <ResizableTh width={widths.phone} onResize={(w) => setWidth('phone', w)}>
                    Phone
                  </ResizableTh>
                  <ResizableTh width={widths.grade} onResize={(w) => setWidth('grade', w)}>
                    Grade
                  </ResizableTh>
                  <ResizableTh width={widths.stage} onResize={(w) => setWidth('stage', w)}>
                    Stage
                  </ResizableTh>
                  <ResizableTh width={widths.source} onResize={(w) => setWidth('source', w)}>
                    Source
                  </ResizableTh>
                  <ResizableTh width={widths.counsellor} onResize={(w) => setWidth('counsellor', w)}>
                    Counsellor
                  </ResizableTh>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setActiveLead(l.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-card2"
                  >
                    <td style={{ width: widths.id }} className={TD}>
                      <p className="font-mono text-xs text-green-400">{l.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted">
                        {new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </td>
                    <td style={{ width: widths.lead }} className={TD}>
                      <p className="truncate font-medium text-blue-400">{l.full_name}</p>
                      {l.child_name && <p className="truncate text-xs text-muted2">{l.child_name}</p>}
                    </td>
                    <td style={{ width: widths.phone }} className={clsx(TD, 'text-fg')}>
                      {l.whatsapp_number}
                    </td>
                    <td style={{ width: widths.grade }} className={clsx(TD, 'text-muted2')}>
                      {l.grade || '—'}
                    </td>
                    <td style={{ width: widths.stage }} className={TD}>
                      <StagePillView stage={l.pipeline_stage} clientId={l.client_id} />
                    </td>
                    <td style={{ width: widths.source }} className={clsx(TD, 'text-muted2')}>
                      {SOURCE_LABEL[l.source] || l.source}
                    </td>
                    <td style={{ width: widths.counsellor }} className={clsx(TD, 'overflow-visible')}>
                      {l.counsellor_name ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-600 text-xs text-white">
                          {initials(l.counsellor_name)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && leads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      No leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {activeLead && (
            <LeadSlideOver
              leadId={activeLead}
              onClose={() => {
                setActiveLead(null)
                load()
              }}
            />
          )}
        </>
      )}

      {addingLead && (
        <AddLeadModal
          onClose={() => setAddingLead(false)}
          onCreated={() => {
            setAddingLead(false)
            load()
          }}
        />
      )}
    </div>
  )
}
