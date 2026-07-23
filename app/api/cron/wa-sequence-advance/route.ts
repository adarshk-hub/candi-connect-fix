import { NextRequest, NextResponse } from 'next/server'
import { advanceDueMessages } from '@/lib/waSequenceEngine'

// Meant to be hit every ~60 seconds by an external scheduler (cron-job.org,
// your hosting platform's cron feature, etc.) — this app has no persistent
// background worker of its own. Replaces /api/cron/nurture-advance; point
// your scheduler here once the Meta WhatsApp cutover is live, and retire
// the old endpoint. Protected by the same shared-secret pattern.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await advanceDueMessages()
  return NextResponse.json({ ok: true, ...result })
}
