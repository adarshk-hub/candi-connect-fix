import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { startSequence } from '@/lib/waSequenceEngine'
import { handleWriteError } from '@/lib/apiError'

// Creates a sequence + schedules Day 0/2/4/7/10 messages for a lead, and
// sends Day 0 immediately. This is the entry point that should be called
// right after a new lead is created (from the Meta Lead Ads webhook, the
// landing-page webhook, or manual add) if you want the nurture drip to
// start automatically rather than requiring a manual "Start" click.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const body = await req.json().catch(() => null)
  const leadId: string | undefined = body?.leadId

  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 })

  const access = await assertLeadAccess(session, leadId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  try {
    const result = await startSequence(leadId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (err: any) {
    return handleWriteError(err)
  }
}
