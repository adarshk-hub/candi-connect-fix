import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const counsellorId = sp.get('counsellorId')
  const program = sp.get('program')
  const clientId = sp.get('clientId')
  const from = sp.get('from')
  const to = sp.get('to')

  const where: string[] = []
  const params: any[] = []

  if (session.role === 'client_admin') {
    params.push(session.clientId)
    where.push(`l.client_id = $${params.length}`)
  } else if (session.role === 'client_counsellor') {
    params.push(session.id)
    where.push(`l.assigned_counsellor_id = $${params.length}`)
  } else if (AGENCY_ROLES.includes(session.role) && clientId) {
    // Institution filter only makes sense for agency roles, who otherwise
    // see leads across every client.
    params.push(clientId)
    where.push(`l.client_id = $${params.length}`)
  }

  if (counsellorId) {
    params.push(counsellorId)
    where.push(`l.assigned_counsellor_id = $${params.length}`)
  }
  if (program) {
    params.push(program)
    where.push(`l.service_interested_in = $${params.length}`)
  }
  if (from) {
    params.push(from)
    where.push(`l.created_at >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    where.push(`l.created_at <= $${params.length}::date + interval '1 day'`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // Pagination: the kanban board previously returned every matching lead in
  // a single response with no limit, which was fine at a few hundred leads
  // but degrades in both query time and payload size as volume grows.
  // limit is capped so a caller can't request an unbounded page by mistake.
  const DEFAULT_LIMIT = 200
  const MAX_LIMIT = 500
  const rawLimit = parseInt(sp.get('limit') || '', 10)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT
  const rawOffset = parseInt(sp.get('offset') || '', 10)
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0

  params.push(limit)
  const limitParamIdx = params.length
  params.push(offset)
  const offsetParamIdx = params.length

  const rows = await query(
    `SELECT l.id, l.full_name, l.child_name, l.whatsapp_number, l.pipeline_stage,
            l.lead_score, l.stage_updated_at, l.source, l.grade, l.service_interested_in,
            l.assigned_counsellor_id, l.client_id, l.created_at,
            u.full_name AS counsellor_name,
            cl.name AS client_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_counsellor_id
     LEFT JOIN clients cl ON cl.id = l.client_id
     ${whereSql}
     ORDER BY l.stage_updated_at ASC
     LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
    params
  )

  return NextResponse.json({ rows, limit, offset })
}