import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await query(
    `SELECT capi_enabled, meta_pixel_id, meta_capi_test_event_code, capi_stage_events
     FROM clients WHERE id = $1`,
    [params.id]
  )
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const setClauses: string[] = []
  const values: any[] = []

  if (body.capiEnabled !== undefined) {
    values.push(!!body.capiEnabled)
    setClauses.push(`capi_enabled = $${values.length}`)
  }
  if (body.metaPixelId !== undefined) {
    values.push(body.metaPixelId || null)
    setClauses.push(`meta_pixel_id = $${values.length}`)
  }
  if (body.metaCapiTestEventCode !== undefined) {
    values.push(body.metaCapiTestEventCode || null)
    setClauses.push(`meta_capi_test_event_code = $${values.length}`)
  }
  if (body.capiStageEvents !== undefined) {
    if (typeof body.capiStageEvents !== 'object' || body.capiStageEvents === null) {
      return NextResponse.json({ error: 'capiStageEvents must be an object' }, { status: 400 })
    }
    values.push(JSON.stringify(body.capiStageEvents))
    setClauses.push(`capi_stage_events = $${values.length}`)
  }
  if (setClauses.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  try {
    values.push(params.id)
    const rows = await query(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${values.length}
       RETURNING capi_enabled, meta_pixel_id, meta_capi_test_event_code, capi_stage_events`,
      values
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
