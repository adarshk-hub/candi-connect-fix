import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'

// Returns every distinct tag used anywhere for a client, so both the
// per-lead tag editor and the broadcast audience builder can offer
// autocomplete/reuse instead of the admin retyping "Hot Lead" three
// slightly different ways.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedClientId = req.nextUrl.searchParams.get('clientId')
  let clientId: string | null = null
  if (AGENCY_ROLES.includes(session.role)) {
    clientId = requestedClientId
  } else {
    clientId = session.clientId
  }
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  const rows = await query<{ tag: string }>(
    'SELECT DISTINCT tag FROM lead_tags WHERE client_id = $1 ORDER BY tag',
    [clientId]
  )
  return NextResponse.json(rows.map((r) => r.tag))
}
