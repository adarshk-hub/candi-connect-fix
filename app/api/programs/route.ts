import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'

// Distinct "Course" values in use, for the Kanban board's "Program" filter.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where: string[] = [`service_interested_in IS NOT NULL`]
  const params: any[] = []

  if (session.role === 'client_admin') {
    params.push(session.clientId)
    where.push(`client_id = $${params.length}`)
  } else if (session.role === 'client_counsellor') {
    params.push(session.id)
    where.push(`assigned_counsellor_id = $${params.length}`)
  }

  const rows = await query<{ service_interested_in: string }>(
    `SELECT DISTINCT service_interested_in FROM leads WHERE ${where.join(' AND ')} ORDER BY service_interested_in`,
    params
  )
  return NextResponse.json(rows.map((r) => r.service_interested_in))
}
