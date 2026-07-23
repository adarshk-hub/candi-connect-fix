import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { syncAdSpend } from '@/lib/adSpendSync'

// Manual "Sync Now" trigger for the Spend Entry page — same underlying sync
// as the /api/cron/ad-spend-sync scheduled job, gated by a logged-in agency
// session instead of the cron shared secret.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await syncAdSpend()
  return NextResponse.json({ ok: true, synced: results.length, results })
}
