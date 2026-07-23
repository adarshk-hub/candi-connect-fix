import { NextRequest, NextResponse } from 'next/server'
import { sendDueVisitReminders } from '@/lib/visitReminders'

// Meant to be hit periodically (e.g. hourly) by an external scheduler —
// cron-job.org, your hosting platform's cron feature, etc. — same pattern
// as /api/cron/nurture-advance. Protected by a shared secret rather than a
// user session, since the caller is a machine, not a logged-in user.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await sendDueVisitReminders()
  return NextResponse.json({ ok: true, sent: results.length, results })
}