import { NextRequest, NextResponse } from 'next/server'
import { processNextBatch } from '@/lib/emailBroadcast'

// Meant to be hit every ~30-60 seconds by the same external scheduler
// already calling the WhatsApp broadcast/sequence cron endpoints.
// Protected by the same shared-secret pattern as the other cron routes.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processNextBatch(20)
  return NextResponse.json({ ok: true, ...result })
}
