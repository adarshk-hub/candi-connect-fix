import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

export type Role = 'agency_admin' | 'agency_staff' | 'client_admin' | 'client_counsellor'

export interface SessionUser {
  id: string
  email: string
  role: Role
  clientId: string | null
  fullName: string | null
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} env var is required and must not be empty.`)
  }
  return value
}

const JWT_SECRET: string = requireEnv('JWT_SECRET', process.env.JWT_SECRET)

export function signSession(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
}

export function getSession(req: NextRequest): SessionUser | null {
  const token = req.cookies.get('cc_session')?.value
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser
  } catch {
    return null
  }
}

export function requireRole(user: SessionUser | null, allowed: Role[]): user is SessionUser {
  return !!user && allowed.includes(user.role)
}

export const AGENCY_ROLES: Role[] = ['agency_admin', 'agency_staff']
export const CLIENT_VIEW_ROLES: Role[] = ['agency_admin', 'agency_staff', 'client_admin']