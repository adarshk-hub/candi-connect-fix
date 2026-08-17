import { NextRequest, NextResponse } from 'next/server'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { fetchAccessibleMetaPages } from '@/lib/metaPages'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !AGENCY_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const pages = await fetchAccessibleMetaPages()
    return NextResponse.json({ pages })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch Pages from Meta' }, { status: 502 })
  }
}
