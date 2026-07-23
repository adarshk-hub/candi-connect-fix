import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const search = sp.get('search')?.trim() || ''

  const where: string[] = []
  const params: any[] = []

  if (session.role === 'client_admin') {
    params.push(session.clientId)
    where.push(`l.client_id = $${params.length}`)
  } else if (session.role === 'client_counsellor') {
    params.push(session.id)
    where.push(`l.assigned_counsellor_id = $${params.length}`)
  }

  if (from) {
    params.push(from)
    where.push(`f.follow_up_date >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    where.push(`f.follow_up_date <= $${params.length}`)
  }
  if (search) {
    params.push(`%${search}%`)
    const i = params.length
    where.push(`(l.full_name ILIKE $${i} OR l.whatsapp_number ILIKE $${i})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = await query(
    `SELECT f.id, f.follow_up_date, f.details, f.status AS fu_status,
            l.id AS lead_id, l.client_id, l.full_name, l.whatsapp_number, l.grade, l.pipeline_stage, l.lead_score,
            u.full_name AS counsellor_name
     FROM follow_ups f
     JOIN leads l ON l.id = f.lead_id
     LEFT JOIN users u ON u.id = l.assigned_counsellor_id
     ${whereSql}
     ORDER BY f.follow_up_date ASC, f.created_at ASC`,
    params
  )

  return NextResponse.json(rows)
}
