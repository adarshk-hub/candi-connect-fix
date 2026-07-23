import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

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

  const rows = await query(`SELECT * FROM client_field_settings ${where}`, params)
  return NextResponse.json(rows)
}

// Upsert — one row per (client, field_key). Editing an already-overridden
// built-in field just updates the same row instead of accumulating history.
export async function PUT(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json()
  const targetClientId = AGENCY_ROLES.includes(session?.role as any) ? body.clientId : session?.clientId

  if (!targetClientId || !canCustomize(session, targetClientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { fieldKey, label, isVisible } = body
  if (!fieldKey) return NextResponse.json({ error: 'fieldKey required' }, { status: 400 })

  try {
    const rows = await query(
      `INSERT INTO client_field_settings (client_id, field_key, label, is_visible)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (client_id, field_key)
       DO UPDATE SET label = EXCLUDED.label, is_visible = EXCLUDED.is_visible
       RETURNING *`,
      [targetClientId, fieldKey, label ?? null, isVisible ?? true]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
