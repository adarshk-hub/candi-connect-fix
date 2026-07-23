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

  const rows = await query(
    `SELECT * FROM lead_form_fields ${where} ORDER BY client_id, sort_order ASC`,
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
  const { fieldKey, label, fieldType, options } = body
  if (!fieldKey || !label) return NextResponse.json({ error: 'fieldKey and label required' }, { status: 400 })

  try {
    const [{ maxSort } = { maxSort: -1 }] = await query<{ maxSort: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS "maxSort" FROM lead_form_fields WHERE client_id = $1`,
      [targetClientId]
    )
    const rows = await query(
      `INSERT INTO lead_form_fields (client_id, field_key, label, field_type, options, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [targetClientId, fieldKey, label, fieldType || 'text', options ? JSON.stringify(options) : null, maxSort + 1]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'A field with this key already exists for this institute.' }, { status: 409 })
    }
    return handleWriteError(err)
  }
}
