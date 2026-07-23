import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const existing = (await query(`SELECT * FROM users WHERE id = $1 AND role = 'client_counsellor'`, [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canCustomize(session, existing.client_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const setClauses: string[] = []
  const values: any[] = []
  if (body.fullName !== undefined) {
    values.push(body.fullName)
    setClauses.push(`full_name = $${values.length}`)
  }
  if (body.email !== undefined) {
    values.push(body.email)
    setClauses.push(`email = $${values.length}`)
  }
  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    values.push(bcrypt.hashSync(body.password, 10))
    setClauses.push(`password_hash = $${values.length}`)
  }
  if (setClauses.length === 0) return NextResponse.json(existing)

  try {
    values.push(params.id)
    const rows = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id, full_name, email, client_id, created_at`,
      values
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
    }
    return handleWriteError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const existing = (await query(`SELECT * FROM users WHERE id = $1 AND role = 'client_counsellor'`, [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canCustomize(session, existing.client_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const assigned = await query('SELECT id FROM leads WHERE assigned_counsellor_id = $1 LIMIT 1', [params.id])
  if (assigned.length > 0) {
    return NextResponse.json(
      { error: 'This counsellor still has leads assigned to them. Reassign those leads first.' },
      { status: 409 }
    )
  }

  await query('DELETE FROM users WHERE id = $1', [params.id])
  return NextResponse.json({ ok: true })
}
