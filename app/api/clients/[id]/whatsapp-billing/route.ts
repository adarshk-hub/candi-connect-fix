import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { getAllTimeTemplateAnalytics } from '@/lib/metaWhatsapp'

// Returns a per-template WhatsApp usage/cost summary for this client,
// pulled live from Meta's template_analytics (Sent/Delivered/Cost per
// template, covering the last 90 days — Meta's max lookback for this
// endpoint). See lib/metaWhatsapp.ts for why this replaced the earlier
// pricing_analytics-based approach.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const summary = await getAllTimeTemplateAnalytics(params.id)

  if (!summary) {
    return NextResponse.json(
      { error: 'No WhatsApp config saved for this client yet, or missing WABA ID' },
      { status: 404 }
    )
  }

  return NextResponse.json(summary)
}
