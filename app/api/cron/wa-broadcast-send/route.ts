import { NextRequest, NextResponse } from 'next/server'
import { processNextBatch } from '@/lib/waBroadcast'

// Meant to be hit every ~30-60 seconds by the same external scheduler
// already calling /api/cron/wa-sequence-advance — this app has no
// persistent background worker, so broadcasts are sent in small batches
// across repeated calls to this endpoint rather than all at once in the
// request that creates the broadcast (which would time out for any
// large audience). Protected by the same shared-secret pattern as the
// other cron routes.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processNextBatch(20)
  return NextResponse.json({ ok: true, ...result })
}
