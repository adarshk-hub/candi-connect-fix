import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const logRows = await query(
    `SELECT a.id, a.activity_type, a.title, a.description, a.created_at, u.full_name AS actor_name
     FROM activity_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.lead_id = $1`,
    [params.id]
  )

  // Scheduled/completed calls and visits belong in the "full activity
  // timeline" alongside messages, notes, and stage changes — merged in here
  // as synthetic read-only entries rather than duplicated into activity_log.
  const eventRows = await query(
    `SELECT id, event_type, event_date, event_time, status, created_at
     FROM events WHERE lead_id = $1`,
    [params.id]
  )
  const eventEntries = eventRows.map((e: any) => ({
    id: `event-${e.id}`,
    activity_type: 'system',
    title: e.event_type === 'call_booked' ? 'Call Scheduled' : 'Visit Scheduled',
    description: `${e.event_type === 'call_booked' ? 'Call' : 'Session/visit'} ${e.status} for ${new Date(e.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}${e.event_time ? ` at ${e.event_time.slice(0, 5)}` : ''}.`,
    created_at: e.created_at,
    actor_name: null,
  }))

  const merged = [...logRows, ...eventEntries].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return NextResponse.json(merged)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const access = await assertLeadAccess(session, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { actionType, details } = await req.json()
  if (!details) return NextResponse.json({ error: 'details required' }, { status: 400 })

  try {
    const rows = await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, action_type, description, actor_id)
       VALUES ($1, 'manual', $2, $3, $4, $5) RETURNING *`,
      [params.id, actionType || 'Activity', actionType || null, details, session!.id]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
