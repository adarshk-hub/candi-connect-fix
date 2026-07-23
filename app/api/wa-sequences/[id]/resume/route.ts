import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { resumeSequence } from '@/lib/waSequenceEngine'

// Manually resume a sequence that was auto-paused when a counsellor
// replied. Note this does NOT reschedule missed days — a paused Day-4
// message that's now overdue will fire on the next cron tick since its
// scheduled_for time has already passed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const sequence = (await query('SELECT lead_id FROM wa_sequences WHERE id = $1', [params.id]))[0]
  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  const access = await assertLeadAccess(session, sequence.lead_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const ok = await resumeSequence(params.id)
  if (!ok) return NextResponse.json({ error: 'Sequence is not paused' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
