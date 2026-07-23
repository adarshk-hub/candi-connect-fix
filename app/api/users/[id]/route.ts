import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES, Role } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

const ALL_ROLES: Role[] = ['agency_admin', 'agency_staff', 'client_admin', 'client_counsellor']
const isAgencyRole = (role: string) => role === 'agency_admin' || role === 'agency_staff'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = (await query('SELECT * FROM users WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canManageExisting = isAgencyRole(existing.role)
    ? AGENCY_ROLES.includes(session.role)
    : canCustomize(session, existing.client_id)
  if (!canManageExisting) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // A user editing their own account can't change their own role or
  // deactivate themselves — otherwise the last agency_admin in a session
  // could lock themselves out with a single click.
  if (session.id === params.id && (body.role !== undefined || body.is_active === false)) {
    return NextResponse.json(
      { error: "You can't change your own role or deactivate your own account." },
      { status: 400 }
    )
  }

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
  if (body.role !== undefined) {
    if (!ALL_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    // Flipping a user between an agency-level role and an institute-scoped
    // role would also mean reassigning (or clearing) their client_id — treat
    // that as "create a new account" instead of a same-record role edit.
    if (isAgencyRole(body.role) !== isAgencyRole(existing.role)) {
      return NextResponse.json(
        { error: "Changing between agency and institute roles isn't supported — create a new account instead." },
        { status: 400 }
      )
    }
    if (isAgencyRole(body.role) && !AGENCY_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    values.push(body.role)
    setClauses.push(`role = $${values.length}`)
  }
  if (body.is_active !== undefined) {
    values.push(!!body.is_active)
    setClauses.push(`is_active = $${values.length}`)
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
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}
       RETURNING id, full_name, email, role, client_id, is_active, created_at`,
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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.id === params.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 })
  }

  const existing = (await query('SELECT * FROM users WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canManageExisting = isAgencyRole(existing.role)
    ? AGENCY_ROLES.includes(session.role)
    : canCustomize(session, existing.client_id)
  if (!canManageExisting) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await query('DELETE FROM users WHERE id = $1', [params.id])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err?.code === '23503') {
      return NextResponse.json(
        { error: 'This user has existing activity (leads, messages, or logs) and cannot be deleted — deactivate instead.' },
        { status: 409 }
      )
    }
    return handleWriteError(err)
  }
}
