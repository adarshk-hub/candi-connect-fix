import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'

// Institution list for the Kanban board's "Institution" filter — agency
// roles only, since client-scoped roles only ever have one institution.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!AGENCY_ROLES.includes(session.role)) return NextResponse.json([])

  const rows = await query('SELECT id, name FROM clients ORDER BY name')
  return NextResponse.json(rows)
}
