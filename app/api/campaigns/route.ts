import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params: any[] = []
  let where = `WHERE c.status = 'active'`
  if (!AGENCY_ROLES.includes(session.role)) {
    // client_admin / client_counsellor only ever see their own institution's
    // campaigns — each client is an isolated workspace.
    params.push(session.clientId)
    where += ` AND c.client_id = $${params.length}`
  }

  const rows = await query(
    `SELECT c.id, c.display_name, cl.name AS client_name
     FROM campaigns c
     JOIN clients cl ON cl.id = c.client_id
     ${where}
     ORDER BY cl.name, c.display_name`,
    params
  )
  return NextResponse.json(rows)
}
