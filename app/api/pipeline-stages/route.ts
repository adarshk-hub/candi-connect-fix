import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

// Returns every institute's stages the caller is allowed to see: a single
// client's list for client-scoped roles, or — for agency roles — either one
// client's list (?clientId=) or every client's combined list (used by the
// StagesProvider so cross-institute views like the agency leads list can
// look up the right label/color for each lead's own client).
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = req.nextUrl.searchParams.get('clientId')
  const params: any[] = []
  let where = ''

  if (AGENCY_ROLES.includes(session.role)) {
    if (clientId) {
      params.push(clientId)
      where = 'WHERE client_id = $1'
    }
  } else {
    params.push(session.clientId)
    where = 'WHERE client_id = $1'
  }

  const rows = await query(
    `SELECT * FROM pipeline_stages ${where} ORDER BY client_id, sort_order ASC`,
    params
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json()
  const targetClientId = AGENCY_ROLES.includes(session?.role as any) ? body.clientId : session?.clientId

  if (!targetClientId || !canCustomize(session, targetClientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key, label, color, statusGroup, maxMinutes, isColdLane } = body
  if (!key || !label) {
    return NextResponse.json({ error: 'key and label required' }, { status: 400 })
  }

  try {
    const [{ maxSort } = { maxSort: -1 }] = await query<{ maxSort: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS "maxSort" FROM pipeline_stages WHERE client_id = $1`,
      [targetClientId]
    )
    const rows = await query(
      `INSERT INTO pipeline_stages (client_id, key, label, color, status_group, max_minutes, is_cold_lane, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        targetClientId,
        key,
        label,
        color || '#60a5fa',
        statusGroup || 'warm',
        maxMinutes ?? null,
        !!isColdLane,
        maxSort + 1,
      ]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'A stage with this key already exists for this institute.' }, { status: 409 })
    }
    return handleWriteError(err)
  }
}
