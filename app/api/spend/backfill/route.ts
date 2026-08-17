import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { backfillMetaAdSpend } from '@/lib/adSpendSync'

// Backfilling many weeks across many campaigns means more Meta API pages to
// walk through than a single-week sync — give it real headroom rather than
// the platform's short default. (Vercel Hobby plan caps this at 60s; Pro/
// Enterprise allow higher if this ever isn't enough for a very large
// account.)
export const maxDuration = 60

// One-off (or occasionally re-run) catch-up for historical spend that the
// regular weekly sync never covers — see the comment on backfillMetaAdSpend
// for why that gap exists.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const weeksBack = Math.min(Math.max(Number(body.weeks) || 12, 1), 104) // cap at 2 years to bound one request

  try {
    const results = await backfillMetaAdSpend(weeksBack)
    return NextResponse.json({ ok: true, weeksRequested: weeksBack, results })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Backfill failed' }, { status: 502 })
  }
}
