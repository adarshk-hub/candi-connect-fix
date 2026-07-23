import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { startSequence } from '@/lib/waSequenceEngine'

// Manually starts (or, if paused, this just reports the existing state —
// use /api/wa-sequences/[id]/resume to unpause) the Meta WhatsApp nurture
// sequence for this lead right now, rather than requiring the sequence to
// have been auto-started elsewhere. Replaces the old Aisensy-based
// "advance one day at a time" button — the Meta version schedules all
// remaining days up front (see lib/waSequenceEngine.ts) and sends Day 0
// immediately.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const result = await startSequence(params.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
