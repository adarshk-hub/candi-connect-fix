import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { fetchAccessibleMetaAdAccounts } from '@/lib/metaAdAccounts'

// Powers the ad-account picker in Settings — lets an agency user connect a
// client to a real ad account by choosing it from a list of everything the
// server's Meta token can currently see, instead of typing a raw numeric ID
// found by digging through Ads Manager's URL bar.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const accounts = await fetchAccessibleMetaAdAccounts()
    return NextResponse.json({ accounts })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch ad accounts from Meta' }, { status: 502 })
  }
}
