//Re
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { handleWriteError } from '@/lib/apiError'

// A logo is small enough that a base64 data URL stored directly on the row
// is a reasonable tradeoff given there's no object-storage integration in
// this project — reject anything that would bloat the row unreasonably.
const MAX_LOGO_BYTES = 500 * 1024

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await query(
    `SELECT id, name, logo_data_url, leads_per_page,
            school_email, email_from_name, smtp_host, smtp_port, smtp_user,
            (smtp_pass IS NOT NULL AND smtp_pass != '') AS smtp_pass_set,
            meta_ad_account_id, meta_page_id
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

  if (body.logoDataUrl !== undefined) {
    if (body.logoDataUrl && body.logoDataUrl.length > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'Logo image is too large (max 500KB). Please use a smaller file.' }, { status: 400 })
    }
    values.push(body.logoDataUrl || null)
    setClauses.push(`logo_data_url = $${values.length}`)
  }
  if (body.leadsPerPage !== undefined) {
    const n = Number(body.leadsPerPage)
    if (!Number.isFinite(n) || n < 10 || n > 1000) {
      return NextResponse.json({ error: 'leadsPerPage must be between 10 and 1000' }, { status: 400 })
    }
    values.push(n)
    setClauses.push(`leads_per_page = $${values.length}`)
  }
  if (body.schoolEmail !== undefined) {
    values.push(body.schoolEmail || null)
    setClauses.push(`school_email = $${values.length}`)
  }
  if (body.emailFromName !== undefined) {
    values.push(body.emailFromName || null)
    setClauses.push(`email_from_name = $${values.length}`)
  }
  if (body.smtpHost !== undefined) {
    values.push(body.smtpHost || null)
    setClauses.push(`smtp_host = $${values.length}`)
  }
  if (body.smtpPort !== undefined) {
    const n = body.smtpPort ? Number(body.smtpPort) : null
    if (n !== null && (!Number.isFinite(n) || n < 1 || n > 65535)) {
      return NextResponse.json({ error: 'smtpPort must be a valid port number' }, { status: 400 })
    }
    values.push(n)
    setClauses.push(`smtp_port = $${values.length}`)
  }
  if (body.smtpUser !== undefined) {
    values.push(body.smtpUser || null)
    setClauses.push(`smtp_user = $${values.length}`)
  }
  if (body.smtpPass !== undefined) {
    values.push(body.smtpPass || null)
    setClauses.push(`smtp_pass = $${values.length}`)
  }
  if (body.metaAdAccountId !== undefined) {
    values.push(body.metaAdAccountId || null)
    setClauses.push(`meta_ad_account_id = $${values.length}`)
  }
  if (body.metaPageId !== undefined) {
    values.push(body.metaPageId || null)
    setClauses.push(`meta_page_id = $${values.length}`)
  }
  if (setClauses.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  try {
    values.push(params.id)
    const rows = await query(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${values.length}
       RETURNING id, name, logo_data_url, leads_per_page,
                 school_email, email_from_name, smtp_host, smtp_port, smtp_user,
                 (smtp_pass IS NOT NULL AND smtp_pass != '') AS smtp_pass_set,
                 meta_ad_account_id, meta_page_id`,
      values
    )
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
