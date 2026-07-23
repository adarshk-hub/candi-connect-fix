import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { assertLeadAccess } from '@/lib/leadAccess'
import { sendEmail } from '@/lib/email'
import { handleWriteError } from '@/lib/apiError'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await assertLeadAccess(getSession(req), params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const rows = await query(
    `SELECT em.*, u.full_name AS sent_by_name
     FROM email_messages em
     LEFT JOIN users u ON u.id = em.sent_by
     WHERE em.lead_id = $1
     ORDER BY em.created_at DESC`,
    [params.id]
  )
  return NextResponse.json(rows)
}

// Fires from the Email tab's Preview/Edit modal — the subject/body here are
// already the (possibly hand-edited) final text the counsellor reviewed,
// not a raw unrendered template, so this just sends exactly what's given.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  const access = await assertLeadAccess(session, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const lead = access.lead

  const { subject, body, templateKey } = await req.json()
  if (!subject || !body) return NextResponse.json({ error: 'subject and body required' }, { status: 400 })
  if (!lead.email) return NextResponse.json({ error: 'This lead has no email address on file.' }, { status: 400 })

  const [client] = await query(
    `SELECT school_email, email_from_name, smtp_host, smtp_port, smtp_user, smtp_pass
     FROM clients WHERE id = $1`,
    [lead.client_id]
  )

  const result = await sendEmail(
    {
      host: client?.smtp_host || null,
      port: client?.smtp_port || null,
      user: client?.smtp_user || null,
      pass: client?.smtp_pass || null,
      fromEmail: client?.school_email || null,
      fromName: client?.email_from_name || null,
    },
    { to: lead.email, subject, body }
  )

  try {
    const rows = await query(
      `INSERT INTO email_messages (lead_id, template_key, subject, body, to_email, status, error, sent_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [params.id, templateKey || null, subject, body, lead.email, result.ok ? 'sent' : 'failed', result.error || null, session!.id]
    )

    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
       VALUES ($1, 'system', 'Email Sent', $2, $3)`,
      [params.id, `"${subject}" ${result.ok ? 'sent' : 'failed to send'} to ${lead.email}.`, session!.id]
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: rows[0] }, { status: 502 })
    }
    return NextResponse.json(rows[0])
  } catch (err: any) {
    return handleWriteError(err)
  }
}
