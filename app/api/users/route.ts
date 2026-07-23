import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES, Role } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

const ALL_ROLES: Role[] = ['agency_admin', 'agency_staff', 'client_admin', 'client_counsellor']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!AGENCY_ROLES.includes(session.role) && session.role !== 'client_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientId = req.nextUrl.searchParams.get('clientId')
  const params: any[] = []
  let where = 'WHERE true'
  if (AGENCY_ROLES.includes(session.role)) {
    if (clientId) {
      params.push(clientId)
      where += ` AND client_id = $${params.length}`
    }
  } else {
    // client_admin only ever sees their own institute's users.
    params.push(session.clientId)
    where += ` AND client_id = $${params.length}`
  }

  const rows = await query(
    `SELECT id, full_name, email, role, client_id, is_active, created_at FROM users ${where} ORDER BY full_name`,
    params
  )
  return NextResponse.json(rows)
}

// Generalizes /api/counsellors (which only ever creates client_counsellor
// logins) to every role — agency staff can provision agency_admin/
// agency_staff accounts or any institute's client_admin/client_counsellor;
// a client_admin can only provision accounts scoped to their own institute.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { fullName, email, password, role } = body
  if (!fullName || !email || !password || !role) {
    return NextResponse.json({ error: 'fullName, email, password, and role required' }, { status: 400 })
  }
  if (!ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const isAgencyRole = role === 'agency_admin' || role === 'agency_staff'
  let targetClientId: string | null = null

  if (isAgencyRole) {
    if (!AGENCY_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    targetClientId = AGENCY_ROLES.includes(session.role) ? body.clientId : session.clientId
    if (!targetClientId || !canCustomize(session, targetClientId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10)
    const rows = await query(
      `INSERT INTO users (client_id, email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, full_name, email, role, client_id, is_active, created_at`,
      [targetClientId, email, passwordHash, fullName, role]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
    }
    return handleWriteError(err)
  }
}
