'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
import { clsx } from 'clsx'
import LeadSlideOver from '../../components/lead/LeadSlideOver'

interface EventRow {
  id: string
  event_type: 'call_booked' | 'session_booked'
  event_date: string
  event_time: string | null
  status: string
  lead_id: string
  full_name: string
  counsellor_name: string | null
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const EVENT_TYPES = [
  { key: 'call_booked', label: 'Call Booked' },
  { key: 'session_booked', label: 'Session Booked' },
]

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const start = new Date(year, month, 1 - startOffset)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return days
}

export default function CalendarViewPage() {
  const today = new Date()
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month')
  const [selectedDay, setSelectedDay] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['call_booked', 'session_booked'])
  const [counsellors, setCounsellors] = useState<{ id: string; full_name: string }[]>([])
  const [counsellorId, setCounsellorId] = useState('')
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [activeLead, setActiveLead] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/counsellors')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCounsellors(Array.isArray(data) ? data : []))
  }, [])

  useEffect(() => {
    const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    const params = new URLSearchParams()
    params.set('month', month)
    for (const t of selectedTypes) params.append('eventType', t)
    if (counsellorId) params.set('counsellorId', counsellorId)
    fetch(`/api/events?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
  }, [cursor, selectedTypes, counsellorId])

  const days = useMemo(() => monthMatrix(cursor.getFullYear(), cursor.getMonth()), [cursor])

  const eventsByDate = useMemo(() => {
    const map: Record<string, EventRow[]> = {}
    for (const e of events) {
      const key = e.event_date.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [events])

  function toggleType(key: string) {
    setSelectedTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]))
  }

  function goToDay(d: Date) {
    setSelectedDay(d)
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
    }
  }

  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const todayKey = today.toISOString().slice(0, 10)
  const selectedDayKey = selectedDay.toISOString().slice(0, 10)
  const dayLabel = selectedDay.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const daysVisits = useMemo(
    () =>
      events
        .filter((e) => e.event_date.slice(0, 10) === selectedDayKey && e.event_type === 'session_booked')
        .sort((a, b) => (a.event_time || '').localeCompare(b.event_time || '')),
    [events, selectedDayKey]
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Calendar View</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 border-b border-border">
            <button
              onClick={() => setViewMode('month')}
              className={clsx(
                'flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm',
                viewMode === 'month' ? 'border-blue-500 font-medium text-fg' : 'border-transparent text-muted2 hover:text-fg'
              )}
            >
              <LayoutGrid size={14} /> Month
            </button>
            <button
              onClick={() => {
                setViewMode('day')
                goToDay(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
              }}
              className={clsx(
                'flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm',
                viewMode === 'day' ? 'border-blue-500 font-medium text-fg' : 'border-transparent text-muted2 hover:text-fg'
              )}
            >
              <List size={14} /> Day
            </button>
          </div>
          <div className="relative">
            <label className="mb-1 block text-xs text-muted">Event Type</label>
            <button
              onClick={() => setTypeMenuOpen((o) => !o)}
              className="w-48 rounded-md border border-border bg-card2 px-3 py-2 text-left text-sm text-fg"
            >
              {selectedTypes.length === EVENT_TYPES.length
                ? 'All event types'
                : EVENT_TYPES.filter((t) => selectedTypes.includes(t.key))
                    .map((t) => t.label)
                    .join(', ') || 'None'}
            </button>
            {typeMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTypeMenuOpen(false)} />
                <div className="absolute z-20 mt-1 w-48 rounded-card border border-border bg-card2 p-1 shadow-xl">
                  {EVENT_TYPES.map((t) => (
                    <label
                      key={t.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg hover:bg-card"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(t.key)}
                        onChange={() => toggleType(t.key)}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Counsellor</label>
            <select
              value={counsellorId}
              onChange={(e) => setCounsellorId(e.target.value)}
              className="rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg"
            >
              <option value="">All Counsellors</option>
              {counsellors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'day' ? (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const prev = new Date(selectedDay)
                prev.setDate(prev.getDate() - 1)
                goToDay(prev)
              }}
              className="rounded-md border border-border p-2 text-fg"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-lg font-semibold text-fg">{dayLabel}</h2>
            <button
              onClick={() => {
                const next = new Date(selectedDay)
                next.setDate(next.getDate() + 1)
                goToDay(next)
              }}
              className="rounded-md border border-border p-2 text-fg"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {selectedDayKey !== todayKey && (
            <button
              onClick={() => goToDay(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}
              className="rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg"
            >
              Today
            </button>
          )}
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-md border border-border p-2 text-fg"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-lg font-semibold text-fg">{monthLabel}</h2>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-md border border-border p-2 text-fg"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <select
            value={cursor.getFullYear()}
            onChange={(e) => setCursor(new Date(Number(e.target.value), cursor.getMonth(), 1))}
            className="rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg"
          >
            {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {viewMode === 'day' ? (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          {daysVisits.length === 0 ? (
            <p className="px-4 py-10 text-center text-muted">No campus visits scheduled for this day.</p>
          ) : (
            <ul className="divide-y divide-border">
              {daysVisits.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setActiveLead(v.lead_id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-card2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-16 text-sm font-semibold text-fg">{v.event_time?.slice(0, 5) || '—'}</span>
                      <span className="text-sm text-fg">{v.full_name}</span>
                      {v.counsellor_name && <span className="text-xs text-muted2">· {v.counsellor_name}</span>}
                    </div>
                    <span
                      className={clsx(
                        'rounded-md px-2.5 py-0.5 text-xs font-medium',
                        v.status === 'completed'
                          ? 'bg-green-500/20 text-green-300'
                          : v.status === 'no_show'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-blue-500/20 text-blue-300'
                      )}
                    >
                      {v.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
      <div className="overflow-hidden rounded-card border border-border">
        <div className="grid grid-cols-7 bg-card2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = d.toISOString().slice(0, 10)
            const inMonth = d.getMonth() === cursor.getMonth()
            const isToday = key === todayKey
            const dayEvents = eventsByDate[key] || []
            return (
              <div
                key={key}
                className={clsx(
                  'min-h-[110px] border-b border-r border-border p-2',
                  !inMonth && 'bg-card/40',
                  isToday && 'ring-1 ring-inset ring-blue-500'
                )}
              >
                <p className={clsx('mb-1 text-sm', inMonth ? 'text-fg' : 'text-muted', isToday && 'font-bold text-blue-400')}>
                  {d.getDate()}
                </p>
                <div className="space-y-1">
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setActiveLead(e.lead_id)}
                      className={clsx(
                        'block w-full truncate rounded px-1.5 py-0.5 text-left text-xs',
                        e.event_type === 'call_booked' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'
                      )}
                    >
                      {e.event_time?.slice(0, 5) || ''} {e.full_name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}

      {activeLead && <LeadSlideOver leadId={activeLead} onClose={() => setActiveLead(null)} />}
    </div>
  )
}
