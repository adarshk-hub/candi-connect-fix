'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Check, X as XIcon, Clock } from 'lucide-react'

interface Visit {
  id: string
  event_date: string
  event_time: string | null
  meeting_link: string | null
  status: 'scheduled' | 'confirmed' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled'
  outcome: 'interested' | 'needs_follow_up' | 'declined' | null
  notes: string | null
  reminder_48h_sent_at: string | null
  reminder_24h_sent_at: string | null
  noshow_reschedule_sent_at: string | null
  created_at: string
}

const OUTCOME_LABEL: Record<string, string> = {
  interested: 'Interested',
  needs_follow_up: 'Needs follow-up',
  declined: 'Declined',
}

const STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  completed: 'bg-green-500/20 text-green-300',
  no_show: 'bg-red-500/20 text-red-300',
  rescheduled: 'bg-amber-500/20 text-amber-300',
  cancelled: 'bg-zinc-600/40 text-zinc-300',
}

// Statuses where the current visit is "resolved" — no longer awaiting a
// show-up decision — so the booking form should reappear to let the
// counsellor schedule the next one (including after a no-show reschedule).
const RESOLVED_STATUSES = ['completed', 'cancelled', 'no_show']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ReminderTick({ label, sentAt }: { label: string; sentAt: string | null }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted2">
      {sentAt ? <Check size={12} className="text-green-400" /> : <Clock size={12} className="text-muted" />}
      {label} {sentAt ? `sent ${fmtDate(sentAt)}` : 'pending'}
    </span>
  )
}

export default function VisitTab({ leadId }: { leadId: string }) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [booking, setBooking] = useState(false)

  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/leads/${leadId}/visits`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const rows = Array.isArray(data) ? data : []
        setVisits(rows)
        setNotesDraft(rows[0]?.notes || '')
        setLoading(false)
      })
  }

  useEffect(load, [leadId])

  const current = visits[0] || null
  const history = visits.slice(1)

  async function bookVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!bookingDate) return
    setBooking(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventDate: bookingDate, eventTime: bookingTime || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to book visit')
        return
      }
      setBookingDate('')
      setBookingTime('')
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setBooking(false)
    }
  }

  async function updateVisit(eventId: string, patch: Record<string, any>) {
    setUpdatingStatus(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${leadId}/visits/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to update visit')
        return
      }
      load()
    } catch (err: any) {
      setError(err?.message || 'Network error — could not reach the server')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function saveNotes() {
    if (!current) return
    setSavingNotes(true)
    await updateVisit(current.id, { notes: notesDraft })
    setSavingNotes(false)
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {!current || RESOLVED_STATUSES.includes(current.status) ? (
        <div className="rounded-card border border-border bg-card2 p-5">
          <p className="mb-4 font-semibold text-fg">
            {current ? 'Schedule another campus visit:' : 'Schedule a campus visit for this lead:'}
          </p>
          <form onSubmit={bookVisit} className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-fg outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Time slot</label>
              <input
                type="time"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-fg outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={booking}
              className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {booking ? 'Booking…' : 'Book Visit'}
            </button>
          </form>
        </div>
      ) : null}

      {current && !RESOLVED_STATUSES.includes(current.status) && (
        <div className="mt-4 rounded-card border border-border bg-card2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-fg">
                {fmtDate(current.event_date)}
                {current.event_time ? ` at ${current.event_time.slice(0, 5)}` : ''}
              </p>
              <span className={clsx('mt-1 inline-block rounded-md px-2.5 py-0.5 text-xs font-medium', STATUS_PILL[current.status])}>
                {current.status === 'scheduled' ? 'Scheduled' : current.status}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateVisit(current.id, { status: 'completed' })}
                disabled={updatingStatus}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                <Check size={14} /> Mark Attended
              </button>
              <button
                onClick={() => updateVisit(current.id, { status: 'no_show' })}
                disabled={updatingStatus}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                <XIcon size={14} /> Mark No-show
              </button>
            </div>
          </div>
          <div className="flex gap-4 border-t border-border pt-3">
            <ReminderTick label="48hr reminder" sentAt={current.reminder_48h_sent_at} />
            <ReminderTick label="24hr reminder" sentAt={current.reminder_24h_sent_at} />
          </div>
        </div>
      )}

      {current && current.status === 'no_show' && (
        <div className="mt-4 rounded-card border border-border bg-card2 p-5">
          <p className="font-semibold text-fg">No-show recorded for {fmtDate(current.event_date)}</p>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted2">
            {current.noshow_reschedule_sent_at ? (
              <>
                <Check size={12} className="text-green-400" /> Reschedule nudge sent {fmtDate(current.noshow_reschedule_sent_at)}
              </>
            ) : (
              <>
                <Clock size={12} className="text-muted" /> Reschedule nudge pending
              </>
            )}
          </p>
        </div>
      )}

      {current && current.status === 'completed' && (
        <div className="mt-4 rounded-card border border-border bg-card2 p-5">
          <p className="mb-3 font-semibold text-fg">
            Visit on {fmtDate(current.event_date)} — <span className="text-green-300">Attended</span>
          </p>

          <p className="mb-1 text-xs text-muted">Outcome</p>
          <div className="mb-4 flex gap-2">
            {Object.entries(OUTCOME_LABEL).map(([key, label]) => (
              <button
                key={key}
                onClick={() => updateVisit(current.id, { outcome: key })}
                disabled={updatingStatus}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50',
                  current.outcome === key ? 'bg-blue-600 text-white' : 'border border-border text-muted2 hover:text-fg'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mb-1 text-xs text-muted">Visit notes</p>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="What was discussed during the visit…"
            rows={3}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="mt-2 rounded-md bg-zinc-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-500 disabled:opacity-50"
          >
            {savingNotes ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Visit History</p>
          <ul className="space-y-2">
            {history.map((v) => (
              <li key={v.id} className="rounded-card border border-border bg-card2 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-fg">
                    {fmtDate(v.event_date)}
                    {v.event_time ? ` at ${v.event_time.slice(0, 5)}` : ''}
                  </p>
                  <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium', STATUS_PILL[v.status])}>{v.status}</span>
                </div>
                {v.outcome && <p className="mt-1 text-xs text-muted2">Outcome: {OUTCOME_LABEL[v.outcome]}</p>}
                {v.notes && <p className="mt-1 text-xs text-muted2">{v.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
