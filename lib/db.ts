import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { pgPool?: Pool }

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/candi_connect',
  })

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows
}
