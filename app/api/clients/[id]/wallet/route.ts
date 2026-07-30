import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { getOrCreateWallet, getLast30DaysSummary, getRecentTransactions } from '@/lib/waWallet'

// Returns the client's current WCC wallet balance, a rollup of the last
// 30 days of usage (messages sent per category + amount charged, and
// how much was recharged/cut), and the most recent transactions for the
// ledger table in the UI.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [balance, summary, transactions] = await Promise.all([
    getOrCreateWallet(params.id),
    getLast30DaysSummary(params.id),
    getRecentTransactions(params.id, 50),
  ])

  return NextResponse.json({ balance, summary, transactions })
}
