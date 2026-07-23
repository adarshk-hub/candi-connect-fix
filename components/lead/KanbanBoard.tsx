'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { tierFromScore, TIER_COLOR } from '@/lib/leadScore'
import { useStages } from '@/lib/StagesContext'
import { SOURCE_LABEL, initials } from '@/lib/types'
import { elapsedLabel } from '@/lib/format'
import LeadSlideOver from './LeadSlideOver'
import KanbanFilters, { KanbanFilterState } from './KanbanFilters'

interface KanbanLead {
  id: string
  full_name: string
  child_name: string | null
  whatsapp_number: string
  pipeline_stage: string
  lead_score: number
  stage_updated_at: string
  source: string
  grade: string | null
  service_interested_in: string | null
  assigned_counsellor_id: string | null
  client_id: string
  client_name: string | null
  counsellor_name: string | null
  created_at: string
}

function CardContent({ lead }: { lead: KanbanLead }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const { stageMaxMinutes } = useStages()
  const tier = tierFromScore(lead.lead_score)
  const maxMinutes = stageMaxMinutes(lead.pipeline_stage, lead.client_id)
  const elapsedMs = now - new Date(lead.stage_updated_at).getTime()
  const overdue = maxMinutes !== null && elapsedMs > maxMinutes * 60000

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{lead.full_name}</p>
          {lead.child_name && <p className="truncate text-xs text-muted2">{lead.child_name}</p>}
        </div>
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-zinc-900"
          style={{ backgroundColor: TIER_COLOR[tier] }}
          title={tier}
        >
          {lead.lead_score}
        </span>
      </div>

      <p className="truncate text-xs text-muted2">{lead.whatsapp_number}</p>

      <div className="flex items-center justify-between text-[11px]">
        <span className="rounded-md bg-card px-2 py-0.5 text-muted2">{SOURCE_LABEL[lead.source] || lead.source}</span>
        {lead.counsellor_name && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-600 text-[10px] text-white"
            title={lead.counsellor_name}
          >
            {initials(lead.counsellor_name)}
          </span>
        )}
      </div>

      <p className={clsx('text-[11px]', overdue ? 'font-semibold text-red-400' : 'text-muted')}>
        {overdue ? '⚠ ' : ''}
        {elapsedLabel(lead.stage_updated_at)} in stage
      </p>
    </>
  )
}

function LeadCard({
  lead,
  placeholder,
  onPointerDown,
}: {
  lead: KanbanLead
  placeholder: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  if (placeholder) {
    // The card's original slot while it's being dragged — an empty outline,
    // like Trello leaves behind, so the eye tracks the floating card instead
    // of a dimmed duplicate sitting in place.
    return <div className="h-[104px] rounded-card border-2 border-dashed border-zinc-600" />
  }

  return (
    <div
      data-lead-card={lead.id}
      onPointerDown={onPointerDown}
      className="touch-none select-none space-y-2 rounded-card border border-border bg-card2 p-3 text-left cursor-grab"
    >
      <CardContent lead={lead} />
    </div>
  )
}

export default function KanbanBoard() {
  const { stagesFor } = useStages()
  const [leads, setLeads] = useState<KanbanLead[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<KanbanFilterState>({ counsellorId: '', program: '', clientId: '', from: '', to: '' })
  // Columns follow the Institution filter when set; otherwise fall back to
  // the primary institute's stage list (see StagesContext for why a single
  // unified column set can't represent every institute's stages at once).
  const COLUMNS = stagesFor(filters.clientId || undefined)
  const [activeLead, setActiveLead] = useState<string | null>(null)
  const [dragLeadId, setDragLeadId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const dragState = useRef<{ leadId: string; moved: boolean; offsetX: number; offsetY: number } | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.counsellorId) params.set('counsellorId', filters.counsellorId)
    if (filters.program) params.set('program', filters.program)
    if (filters.clientId) params.set('clientId', filters.clientId)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    fetch(`/api/leads/kanban?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((data) => {
        // Endpoint now returns { rows, limit, offset } instead of a bare
        // array, since results are paginated (capped at 500/page) to avoid
        // an unbounded query as lead volume grows. The board still renders
        // one page at a time; if a client has more leads than the cap,
        // narrowing with the existing filters (counsellor/program/date) is
        // the way to see the rest until the board itself grows an
        // infinite-scroll/load-more control.
        const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : []
        setLeads(rows)
        setLoading(false)
      })
  }

  useEffect(load, [filters])

  const byStage = useMemo(() => {
    const map: Record<string, KanbanLead[]> = {}
    for (const s of COLUMNS) map[s.key] = []
    for (const l of leads) {
      if (!map[l.pipeline_stage]) map[l.pipeline_stage] = []
      map[l.pipeline_stage].push(l)
    }
    return map
  }, [leads])

  const draggingLead = dragLeadId ? leads.find((l) => l.id === dragLeadId) || null : null

  async function moveLead(leadId: string, newStage: string) {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.pipeline_stage === newStage) return

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage, stage_updated_at: new Date().toISOString() } : l))
    )

    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_stage: newStage }),
    })
    if (!res.ok) load() // revert to server truth on failure
  }

  function positionGhost(x: number, y: number) {
    const el = ghostRef.current
    const offset = dragState.current
    if (!el || !offset) return
    el.style.transform = `translate(${x - offset.offsetX}px, ${y - offset.offsetY}px) rotate(3deg)`
  }

  function onCardPointerDown(leadId: string) {
    return (e: React.PointerEvent) => {
      if (e.button !== 0) return
      // Without preventDefault + suppressing selection, holding and moving
      // the mouse triggers the browser's native text/element selection
      // instead of just tracking the drag. Note: some browsers (notably
      // Safari) suppress the synthesized 'click' event entirely once
      // preventDefault() is called on 'pointerdown' — so "open the card" is
      // handled directly below in endDrag rather than via a native onClick,
      // which would otherwise silently never fire in those browsers.
      e.preventDefault()
      document.body.style.userSelect = 'none'

      const rect = e.currentTarget.getBoundingClientRect()
      const startX = e.clientX
      const startY = e.clientY
      dragState.current = {
        leadId,
        moved: false,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      }
      setDragLeadId(leadId)
      requestAnimationFrame(() => positionGhost(e.clientX, e.clientY))

      // Real mice/trackpads almost never report zero movement between
      // pointerdown and pointerup — without a threshold, that jitter got
      // misread as "the user dragged".
      const DRAG_THRESHOLD_PX = 5

      function onMove(ev: PointerEvent) {
        if (!dragState.current) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (!dragState.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        dragState.current.moved = true
        positionGhost(ev.clientX, ev.clientY)
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        const col = el?.closest<HTMLElement>('[data-stage-col]')
        setDragOverStage(col?.dataset.stageCol || null)
      }

      // Shared cleanup for both a normal release (pointerup) and an aborted
      // gesture (pointercancel — e.g. releasing outside the window, browser
      // interrupting the gesture). Always restoring '' (never a captured
      // "previous" value) guarantees text selection can't get stuck off if
      // cleanup ever runs twice or out of order.
      function endDrag(ev: PointerEvent, released: boolean) {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        document.body.style.userSelect = ''

        const wasMoved = dragState.current?.moved || false

        if (released && dragState.current) {
          if (wasMoved) {
            const el = document.elementFromPoint(ev.clientX, ev.clientY)
            const col = el?.closest<HTMLElement>('[data-stage-col]')
            const targetStage = col?.dataset.stageCol
            if (targetStage) moveLead(dragState.current.leadId, targetStage)
          } else {
            // Released without crossing the drag threshold — treat as a
            // click and open the lead, independent of the browser's own
            // (possibly-suppressed) click event.
            setActiveLead(dragState.current.leadId)
          }
        }

        dragState.current = null
        setDragLeadId(null)
        setDragOverStage(null)
      }

      function onUp(ev: PointerEvent) {
        endDrag(ev, true)
      }
      function onCancel(ev: PointerEvent) {
        endDrag(ev, false)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
    }
  }

  return (
    <div>
      <KanbanFilters value={filters} onChange={setFilters} />

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex select-none gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const columnLeads = byStage[col.key] || []
            return (
              <div
                key={col.key}
                data-stage-col={col.key}
                className={clsx(
                  'flex w-72 shrink-0 flex-col rounded-card border-2 bg-card p-3 transition-colors',
                  dragOverStage === col.key ? 'border-blue-500' : 'border-transparent'
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                    <h3 className="text-sm font-semibold text-fg">{col.label}</h3>
                  </div>
                  <span className="text-xs text-muted">{columnLeads.length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {columnLeads.map((l) => (
                    <LeadCard
                      key={l.id}
                      lead={l}
                      placeholder={dragLeadId === l.id}
                      onPointerDown={onCardPointerDown(l.id)}
                    />
                  ))}
                  {columnLeads.length === 0 && (
                    <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                      No leads
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating "flying card" that follows the cursor while dragging,
          positioned imperatively via ghostRef for smooth 60fps tracking
          without a React re-render on every pointermove. */}
      <div
        ref={ghostRef}
        className={clsx(
          'pointer-events-none fixed left-0 top-0 z-50 w-72 space-y-2 rounded-card border border-blue-400 bg-card2 p-3 text-left shadow-2xl',
          draggingLead ? 'opacity-100' : 'opacity-0'
        )}
        style={{ willChange: 'transform' }}
      >
        {draggingLead && <CardContent lead={draggingLead} />}
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