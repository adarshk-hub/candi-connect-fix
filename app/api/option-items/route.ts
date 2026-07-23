import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

// list_key is free text ('lead_source' | 'service' | 'company_type' | any
// future list an institute wants) — this one generic table/route serves all
// of them so a new customizable list never needs a schema change.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const listKey = sp.get('listKey')
  const clientId = sp.get('clientId')
  const params: any[] = []
  const where: string[] = []

  if (AGENCY_ROLES.includes(session.role)) {
    if (clientId) {
      params.push(clientId)
      where.push(`client_id = $${params.length}`)
    }
  } else {
    params.push(session.clientId)
    where.push(`client_id = $${params.length}`)
  }
  if (listKey) {
    params.push(listKey)
    where.push(`list_key = $${params.length}`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = await query(
    `SELECT * FROM client_option_items ${whereSql} ORDER BY client_id, list_key, sort_order ASC`,
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
  const { listKey, value } = body
  if (!listKey || !value) return NextResponse.json({ error: 'listKey and value required' }, { status: 400 })

  try {
    const [{ maxSort } = { maxSort: -1 }] = await query<{ maxSort: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS "maxSort" FROM client_option_items WHERE client_id = $1 AND list_key = $2`,
      [targetClientId, listKey]
    )
    const rows = await query(
      `INSERT INTO client_option_items (client_id, list_key, value, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
      [targetClientId, listKey, value, maxSort + 1]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'This value already exists in the list.' }, { status: 409 })
    }
    return handleWriteError(err)
  }
}
