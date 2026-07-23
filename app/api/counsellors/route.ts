import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = req.nextUrl.searchParams.get('clientId')
  const params: any[] = []
  let where = `WHERE role = 'client_counsellor'`
  if (AGENCY_ROLES.includes(session.role)) {
    if (clientId) {
      params.push(clientId)
      where += ` AND client_id = $${params.length}`
    }
  } else {
    // Each institution only sees its own counsellors — not other clients'.
    params.push(session.clientId)
    where += ` AND client_id = $${params.length}`
  }

  const rows = await query(
    `SELECT id, full_name, email, client_id, created_at FROM users ${where} ORDER BY full_name`,
    params
  )
  return NextResponse.json(rows)
}

// First user-creation endpoint in the app — creates a client_counsellor
// login for an institute. Only agency staff or that institute's own
// client_admin may do this (canCustomize), matching who's allowed to touch
// any other per-institute customization.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json()
  const targetClientId = AGENCY_ROLES.includes(session?.role as any) ? body.clientId : session?.clientId

  if (!targetClientId || !canCustomize(session, targetClientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { fullName, email, password } = body
  if (!fullName || !email || !password) {
    return NextResponse.json({ error: 'fullName, email, and password required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10)
    const rows = await query(
      `INSERT INTO users (client_id, email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4,'client_counsellor')
       RETURNING id, full_name, email, client_id, created_at`,
      [targetClientId, email, passwordHash, fullName]
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
    }
    return handleWriteError(err)
  }
}
