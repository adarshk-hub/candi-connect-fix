import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { SessionUser } from './auth'

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} env var is required and must not be empty.`)
  }
  return value
}

const JWT_SECRET: string = requireEnv('JWT_SECRET', process.env.JWT_SECRET)

export function getServerSession(): SessionUser | null {
  const token = cookies().get('cc_session')?.value
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser
  } catch {
    return null
  }
}