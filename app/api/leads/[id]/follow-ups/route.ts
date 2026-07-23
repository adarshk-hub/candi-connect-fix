import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const rows = await query(
    `SELECT f.*, u.full_name AS created_by_name
     FROM follow_ups f
     LEFT JOIN users u ON u.id = f.created_by
     WHERE f.lead_id = $1
     ORDER BY f.follow_up_date DESC, f.created_at DESC`,
    [params.id]
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const access = await assertLeadAccess(session, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { followUpDate, details } = await req.json()
  if (!followUpDate) return NextResponse.json({ error: 'followUpDate required' }, { status: 400 })

  try {
    const rows = await query(
      `INSERT INTO follow_ups (lead_id, follow_up_date, details, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [params.id, followUpDate, details || null, session!.id]
    )

    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
       VALUES ($1, 'system', 'Follow-up scheduled', $2, $3)`,
      [params.id, `Follow-up set for ${followUpDate}${details ? `: "${details}"` : ''}.`, session!.id]
    )

    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
