import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { signSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const rows = await query<{
    id: string
    email: string
    password_hash: string
    role: string
    client_id: string | null
    full_name: string | null
    is_active: boolean
  }>('SELECT id, email, password_hash, role, client_id, full_name, is_active FROM users WHERE email = $1', [email])

  const user = rows[0]
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  if (!user.is_active) {
    return NextResponse.json({ error: 'This account has been deactivated.' }, { status: 401 })
  }

  const token = signSession({
    id: user.id,
    email: user.email,
    role: user.role as any,
    clientId: user.client_id,
    fullName: user.full_name,
  })

  const res = NextResponse.json({
    id: user.id,
    email: user.email,
    role: user.role,
    clientId: user.client_id,
    fullName: user.full_name,
  })
  res.cookies.set('cc_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cc_session', '', { maxAge: 0, path: '/' })
  return res
}
