'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Search, Filter } from 'lucide-react'
import { clsx } from 'clsx'
import { tierFromScore } from '@/lib/leadScore'
import { useStages } from '@/lib/StagesContext'
import { useColumnWidths } from '@/lib/useColumnWidths'
import ResizableTh from '@/components/ui/ResizableTh'
import LeadSlideOver from '@/components/lead/LeadSlideOver'

interface FollowUpRow {
  id: string
  follow_up_date: string
  details: string | null
  fu_status: string
  lead_id: string
  client_id: string
  full_name: string
  whatsapp_number: string
  grade: string | null
  pipeline_stage: string
  lead_score: number
  counsellor_name: string | null
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const COLUMN_DEFAULTS = {
  id: 100,
  parent: 160,
  phone: 150,
  grade: 90,
  stage: 140,
  status: 100,
  counsellor: 130,
  followUp: 220,
  fuStatus: 100,
  view: 90,
}

const TOOLBAR_BTN = 'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted2 hover:bg-card2 hover:text-fg'
const TD = 'truncate border-r border-border px-4 py-3 last:border-r-0'

// Defaults to "today onward" rather than "today only" — a follow-up
// scheduled for any future date should be visible the moment it's created,
// not just on the day it's due. Counsellors can still narrow the range
// with the date pickers if they want just today's worklist.
export default function FollowUpsPage() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [activeLead, setActiveLead] = useState<string | null>(null)
  const { widths, setWidth } = useColumnWidths('follow-ups', COLUMN_DEFAULTS)
  const { stageLabel, stageColor } = useStages()

  function load() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (search) params.set('search', search)
    fetch(`/api/follow-ups?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
  }

  useEffect(load, [from, to, search])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
          <CalendarDays size={22} /> Follow-ups
        </h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search follow-ups..."
            className="w-64 rounded-md border border-border bg-card2 py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted2">
          From:
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-border bg-card2 px-2 py-1 text-fg"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted2">
          To:
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-border bg-card2 px-2 py-1 text-fg"
          />
        </label>
        <button className={clsx('ml-auto', TOOLBAR_BTN)}>
          <Filter size={16} /> Filter
        </button>
      </div>

      <p className="mb-2 text-sm text-muted2">Follow-ups Found: {rows.length}</p>

      <div className="overflow-x-auto rounded-card border border-border bg-card">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-border bg-card2 text-left text-xs uppercase tracking-wide text-muted">
              <ResizableTh width={widths.id} onResize={(w) => setWidth('id', w)}>
                ID
              </ResizableTh>
              <ResizableTh width={widths.parent} onResize={(w) => setWidth('parent', w)}>
                Parent
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
              <ResizableTh width={widths.status} onResize={(w) => setWidth('status', w)}>
                Status
              </ResizableTh>
              <ResizableTh width={widths.counsellor} onResize={(w) => setWidth('counsellor', w)}>
                Counsellor
              </ResizableTh>
              <ResizableTh width={widths.followUp} onResize={(w) => setWidth('followUp', w)}>
                Follow-up
              </ResizableTh>
              <ResizableTh width={widths.fuStatus} onResize={(w) => setWidth('fuStatus', w)}>
                F/U Status
              </ResizableTh>
              <ResizableTh width={widths.view} onResize={(w) => setWidth('view', w)}>
                View Details
              </ResizableTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-card2">
                <td style={{ width: widths.id }} className={clsx(TD, 'font-mono text-xs text-green-400')}>
                  {r.lead_id.slice(0, 8)}
                </td>
                <td style={{ width: widths.parent }} className={clsx(TD, 'text-fg')}>
                  {r.full_name}
                </td>
                <td style={{ width: widths.phone }} className={clsx(TD, 'text-muted2')}>
                  {r.whatsapp_number}
                </td>
                <td style={{ width: widths.grade }} className={clsx(TD, 'text-muted2')}>
                  {r.grade || '—'}
                </td>
                <td style={{ width: widths.stage }} className={TD}>
                  <span
                    className="inline-block rounded-md px-2.5 py-1 text-xs font-semibold text-zinc-900"
                    style={{ backgroundColor: stageColor(r.pipeline_stage, r.client_id) }}
                  >
                    {stageLabel(r.pipeline_stage, r.client_id)}
                  </span>
                </td>
                <td style={{ width: widths.status }} className={clsx(TD, 'text-muted2')}>
                  {tierFromScore(r.lead_score)}
                </td>
                <td style={{ width: widths.counsellor }} className={clsx(TD, 'text-muted2')}>
                  {r.counsellor_name || '—'}
                </td>
                <td style={{ width: widths.followUp }} className={clsx(TD, 'text-muted2')}>
                  {new Date(r.follow_up_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {r.details ? ` — ${r.details}` : ''}
                </td>
                <td style={{ width: widths.fuStatus }} className={clsx(TD, 'capitalize text-muted2')}>
                  {r.fu_status}
                </td>
                <td style={{ width: widths.view }} className="border-r border-border px-4 py-3 last:border-r-0">
                  <button onClick={() => setActiveLead(r.lead_id)} className="text-blue-400 hover:underline">
                    View
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted">
                  No follow-ups scheduled from {new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {to ? ` to ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ' onward'}
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
    </div>
  )
}
