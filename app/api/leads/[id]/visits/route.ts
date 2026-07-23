import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const rows = await query(
    `SELECT * FROM events WHERE lead_id = $1 AND event_type = 'session_booked' ORDER BY created_at DESC`,
    [params.id]
  )
  return NextResponse.json(rows)
}

// Books a campus visit — "Visit date + time slot booking inside CRM".
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const access = await assertLeadAccess(session, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { eventDate, eventTime, meetingLink } = await req.json()
  if (!eventDate) return NextResponse.json({ error: 'eventDate required' }, { status: 400 })

  try {
    const rows = await query(
      `INSERT INTO events (lead_id, event_type, event_date, event_time, meeting_link, status)
       VALUES ($1, 'session_booked', $2, $3, $4, 'scheduled')
       RETURNING *`,
      [params.id, eventDate, eventTime || null, meetingLink || null]
    )

    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
       VALUES ($1, 'system', 'Visit Scheduled', $2, $3)`,
      [
        params.id,
        `Campus visit booked for ${eventDate}${eventTime ? ` at ${eventTime}` : ''}.`,
        session!.id,
      ]
    )

    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
