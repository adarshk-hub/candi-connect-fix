import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { sendOperationalTemplate } from '@/lib/metaWhatsapp'

const OUTCOME_VALUES = ['interested', 'needs_follow_up', 'declined']

// Show-up confirmation (Attended/No-show), visit notes, and post-visit
// outcome all go through this one PATCH — marking No-show also auto-fires
// the reschedule WhatsApp nudge synchronously (well inside the "within 2
// hours" requirement, since it fires immediately rather than waiting).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; eventId: string } }
) {
  const session = getSession(req)
  const access = await assertLeadAccess(session, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const lead = access.lead

  const existing = (await query('SELECT * FROM events WHERE id = $1 AND lead_id = $2', [
    params.eventId,
    params.id,
  ]))[0]
  if (!existing) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  const body = await req.json()
  const setClauses: string[] = []
  const values: any[] = []

  if (body.status) {
    const validStatuses = ['scheduled', 'confirmed', 'completed', 'no_show', 'rescheduled', 'cancelled']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }
    values.push(body.status)
    setClauses.push(`status = $${values.length}`)
  }
  if ('outcome' in body) {
    if (body.outcome && !OUTCOME_VALUES.includes(body.outcome)) {
      return NextResponse.json({ error: `outcome must be one of: ${OUTCOME_VALUES.join(', ')}` }, { status: 400 })
    }
    values.push(body.outcome || null)
    setClauses.push(`outcome = $${values.length}`)
  }
  if ('notes' in body) {
    values.push(body.notes || null)
    setClauses.push(`notes = $${values.length}`)
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  values.push(params.eventId)
  const rows = await query(`UPDATE events SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  const updated = rows[0]

  if (body.status && body.status !== existing.status) {
    const label = body.status === 'completed' ? 'Attended' : body.status === 'no_show' ? 'No-show' : body.status
    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
       VALUES ($1, 'system', 'Visit Status Updated', $2, $3)`,
      [params.id, `Campus visit marked as "${label}".`, session!.id]
    )
  }

  // Auto no-show reschedule nudge — idempotent via noshow_reschedule_sent_at
  // so re-saving the same event (e.g. adding notes afterward) can't double-send.
  if (body.status === 'no_show' && !existing.noshow_reschedule_sent_at) {
    const result = await sendOperationalTemplate({
      clientId: lead.client_id,
      to: lead.whatsapp_number,
      slug: 'visit_noshow_reschedule',
      destinationName: lead.full_name,
    })
    await query('UPDATE events SET noshow_reschedule_sent_at = now() WHERE id = $1', [params.eventId])
    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description)
       VALUES ($1, 'system', 'Reschedule Nudge Sent', $2)`,
      [params.id, `No-show reschedule message ${result.ok ? 'sent' : 'failed to send'} via Meta WhatsApp API.`]
    )
  }

  return NextResponse.json(updated)
}
