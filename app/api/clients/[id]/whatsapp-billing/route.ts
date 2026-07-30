import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { getAllTimePricingAnalytics } from '@/lib/metaWhatsapp'

// Returns an all-time WhatsApp messaging cost summary for this client,
// pulled live from Meta's pricing_analytics (looped month-by-month — see
// lib/metaWhatsapp.ts for why). Optional ?monthsBack=N query param controls
// how far back to look (default 24 months); Meta has no billing data before
// July 1, 2025 (when per-message pricing started), so anything before that
// will simply come back empty.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const monthsBackParam = req.nextUrl.searchParams.get('monthsBack')
  const monthsBack = monthsBackParam ? Math.max(1, Math.min(12, Number(monthsBackParam))) : 12

  const summary = await getAllTimePricingAnalytics(params.id, monthsBack)

  if (!summary) {
    return NextResponse.json(
      { error: 'No WhatsApp config saved for this client yet, or missing WABA ID' },
      { status: 404 }
    )
  }

  return NextResponse.json(summary)
}
