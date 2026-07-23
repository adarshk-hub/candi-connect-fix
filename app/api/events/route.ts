import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const month = sp.get('month') // YYYY-MM
  const eventTypes = sp.getAll('eventType')
  const counsellorId = sp.get('counsellorId')

  const where: string[] = []
  const params: any[] = []

  if (session.role === 'client_admin') {
    params.push(session.clientId)
    where.push(`l.client_id = $${params.length}`)
  } else if (session.role === 'client_counsellor') {
    params.push(session.id)
    where.push(`l.assigned_counsellor_id = $${params.length}`)
  }

  if (month) {
    params.push(`${month}-01`)
    where.push(`date_trunc('month', e.event_date) = date_trunc('month', $${params.length}::date)`)
  }
  if (eventTypes.length > 0) {
    params.push(eventTypes)
    where.push(`e.event_type = ANY($${params.length})`)
  }
  if (counsellorId) {
    params.push(counsellorId)
    where.push(`l.assigned_counsellor_id = $${params.length}`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = await query(
    `SELECT e.id, e.event_type, e.event_date, e.event_time, e.status,
            l.id AS lead_id, l.full_name, u.full_name AS counsellor_name
     FROM events e
     JOIN leads l ON l.id = e.lead_id
     LEFT JOIN users u ON u.id = l.assigned_counsellor_id
     ${whereSql}
     ORDER BY e.event_date, e.event_time`,
    params
  )
  return NextResponse.json(rows)
}
