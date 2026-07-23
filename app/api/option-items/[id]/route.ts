import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const existing = (await query('SELECT * FROM client_option_items WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canCustomize(session, existing.client_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { value, isActive, sortOrder } = await req.json()
  const setClauses: string[] = []
  const values: any[] = []
  if (value !== undefined) {
    values.push(value)
    setClauses.push(`value = $${values.length}`)
  }
  if (isActive !== undefined) {
    values.push(isActive)
    setClauses.push(`is_active = $${values.length}`)
  }
  if (sortOrder !== undefined) {
    values.push(sortOrder)
    setClauses.push(`sort_order = $${values.length}`)
  }
  if (setClauses.length === 0) return NextResponse.json(existing)

  try {
    values.push(params.id)
    const rows = await query(
      `UPDATE client_option_items SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const existing = (await query('SELECT * FROM client_option_items WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canCustomize(session, existing.client_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await query('DELETE FROM client_option_items WHERE id = $1', [params.id])
  return NextResponse.json({ ok: true })
}
