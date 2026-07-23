import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

const EDITABLE: Record<string, string> = {
  label: 'label',
  color: 'color',
  statusGroup: 'status_group',
  maxMinutes: 'max_minutes',
  isActive: 'is_active',
  sortOrder: 'sort_order',
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const existing = (await query('SELECT * FROM pipeline_stages WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canCustomize(session, existing.client_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const setClauses: string[] = []
  const values: any[] = []
  for (const [bodyKey, column] of Object.entries(EDITABLE)) {
    if (bodyKey in body) {
      values.push(body[bodyKey])
      setClauses.push(`${column} = $${values.length}`)
    }
  }
  if (setClauses.length === 0) return NextResponse.json(existing)

  try {
    values.push(params.id)
    const rows = await query(
      `UPDATE pipeline_stages SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const existing = (await query('SELECT * FROM pipeline_stages WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canCustomize(session, existing.client_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const inUse = await query('SELECT id FROM leads WHERE client_id = $1 AND pipeline_stage = $2 LIMIT 1', [
    existing.client_id,
    existing.key,
  ])
  if (inUse.length > 0) {
    return NextResponse.json(
      { error: 'This stage still has leads on it. Move them to another stage first, or turn the stage off instead of deleting it.' },
      { status: 409 }
    )
  }

  await query('DELETE FROM pipeline_stages WHERE id = $1', [params.id])
  return NextResponse.json({ ok: true })
}
