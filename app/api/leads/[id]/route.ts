import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSession, AGENCY_ROLES } from '@/lib/auth'
import { getStageLabel } from '@/lib/stagesServer'
import { DECISION_MAKER_LABEL } from '@/lib/types'
import { sendOperationalTemplate } from '@/lib/metaWhatsapp'
import { sendEmail } from '@/lib/email'
import { renderEmailTemplate, POST_VISIT_SUMMARY_KEY } from '@/lib/emailTemplates'
import { pauseSequenceForLead, resumeSequenceForLead } from '@/lib/waSequenceEngine'

const LEAD_QUERY = `
  SELECT
    l.*,
    c.display_name AS campaign_display_name,
    c.platform AS campaign_platform,
    u.full_name AS counsellor_name,
    cl.name AS client_name
  FROM leads l
  LEFT JOIN campaigns c ON c.id = l.campaign_id
  LEFT JOIN users u ON u.id = l.assigned_counsellor_id
  LEFT JOIN clients cl ON cl.id = l.client_id
  WHERE l.id = $1
`

// Fields the Info tab's edit form is allowed to write. Keyed to the exact
// leads columns so we can build a whitelisted, dynamic UPDATE below.
// assigned_counsellor_id is handled separately below — it needs its own
// permission gate (not every role that can edit info fields may reassign).
const EDITABLE_FIELDS = [
  'full_name',
  'child_name',
  'whatsapp_number',
  'second_phone',
  'email',
  'occupation',
  'company_name',
  'location',
  'grade',
  'service_interested_in',
  'source',
  'timeline',
  'decision_maker',
  'competitors_visited',
  'key_concern',
] as const

const FIELD_LABEL: Record<string, string> = {
  full_name: 'Lead Name',
  child_name: 'Child Name',
  whatsapp_number: 'WhatsApp',
  second_phone: 'Phone',
  email: 'Email',
  occupation: 'Occupation',
  company_name: 'Company Name',
  location: 'City',
  grade: "Child's Class",
  service_interested_in: 'Course',
  source: 'Source',
  timeline: 'Joining timeline',
  decision_maker: 'Decision maker',
  competitors_visited: 'Competitors shortlisted',
  key_concern: 'Key concern',
}

const DECISION_MAKER_VALUES = Object.keys(DECISION_MAKER_LABEL)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await query(LEAD_QUERY, [params.id])
  const lead = rows[0]
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.role === 'client_admin' && lead.client_id !== session.clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (session.role === 'client_counsellor' && lead.assigned_counsellor_id !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(lead)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = (await query('SELECT * FROM leads WHERE id = $1', [params.id]))[0]
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAgency = AGENCY_ROLES.includes(session.role)
  const isOwningCounsellor =
    session.role === 'client_counsellor' && existing.assigned_counsellor_id === session.id
  const isOwningClientAdmin = session.role === 'client_admin' && existing.client_id === session.clientId
  if (!isAgency && !isOwningCounsellor && !isOwningClientAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  let updated = existing

  // Stage change (from the header's stage pill) — keeps its own activity entry.
  if (body.pipeline_stage) {
    const rows = await query('UPDATE leads SET pipeline_stage = $1 WHERE id = $2 RETURNING *', [
      body.pipeline_stage,
      params.id,
    ])
    updated = rows[0]

    if (body.pipeline_stage !== existing.pipeline_stage) {
      const fromLabel = await getStageLabel(existing.client_id, existing.pipeline_stage)
      const toLabel = await getStageLabel(existing.client_id, body.pipeline_stage)
      const commentSuffix = body.comment ? ` Comment: "${body.comment}".` : ''
      await query(
        `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
         VALUES ($1, 'system', 'Stage Updated', $2, $3)`,
        [
          params.id,
          `Stage changed from "${fromLabel}" to "${toLabel}" via table.${commentSuffix} Current Stage is "${toLabel}".`,
          session.id,
        ]
      )

      // Auto-send a post-visit summary the moment a visit is marked done —
      // no counsellor action required.
      if (body.pipeline_stage === 'visit_done') {
        const result = await sendOperationalTemplate({
          clientId: existing.client_id,
          to: existing.whatsapp_number,
          slug: 'post_visit_summary',
          destinationName: existing.full_name,
        })
        await query(
          `INSERT INTO whatsapp_messages (lead_id, direction, message_type, body, template_name, status)
           VALUES ($1, 'outbound', 'template', 'Post-visit summary sent.', $2, $3)`,
          [params.id, 'post_visit_summary', result.ok ? 'sent' : 'failed']
        )
        await query(
          `INSERT INTO activity_log (lead_id, activity_type, title, description)
           VALUES ($1, 'system', 'Post-Visit Summary Sent', $2)`,
          [params.id, `Auto-triggered by stage change to "Visit Done". ${result.ok ? 'Sent' : `Failed: ${result.error}`} via Meta WhatsApp API.`]
        )

        // Same auto-trigger fires the email counterpart, if the lead has an
        // address and the institute has a school mailbox connected —
        // silently no-ops otherwise (no email to send to / no sender set up).
        if (existing.email) {
          const [client] = await query(
            `SELECT name, school_email, email_from_name, smtp_host, smtp_port, smtp_user, smtp_pass
             FROM clients WHERE id = $1`,
            [existing.client_id]
          )
          if (client) {
            const { subject, body: emailBody } = renderEmailTemplate(POST_VISIT_SUMMARY_KEY, {
              leadName: existing.full_name,
              instituteName: client.name,
            })
            const emailResult = await sendEmail(
              {
                host: client.smtp_host,
                port: client.smtp_port,
                user: client.smtp_user,
                pass: client.smtp_pass,
                fromEmail: client.school_email,
                fromName: client.email_from_name,
              },
              { to: existing.email, subject, body: emailBody }
            )
            await query(
              `INSERT INTO email_messages (lead_id, template_key, subject, body, to_email, status, error)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [params.id, POST_VISIT_SUMMARY_KEY, subject, emailBody, existing.email, emailResult.ok ? 'sent' : 'failed', emailResult.error || null]
            )
          }
        }
      }
    }
  }

  // Nurture sequence pause/resume — any role with write access to this lead
  // (agency, owning counsellor, owning client_admin) can take manual control
  // of the thread without losing the sequence's current day position. This
  // toggle drives the real Meta wa_sequences row (see lib/waSequenceEngine.ts);
  // leads.nurture_paused itself is just a denormalized read for the UI.
  if ('nurture_paused' in body && typeof body.nurture_paused === 'boolean') {
    if (body.nurture_paused) {
      await pauseSequenceForLead(params.id, `Paused manually by ${session.fullName || session.email}`)
    } else {
      await resumeSequenceForLead(params.id)
    }

    const rows = await query('UPDATE leads SET nurture_paused = $1 WHERE id = $2 RETURNING *', [
      body.nurture_paused,
      params.id,
    ])
    updated = rows[0]
    await query(
      `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
       VALUES ($1, 'system', 'Nurture Sequence', $2, $3)`,
      [params.id, body.nurture_paused ? 'Sequence paused.' : 'Sequence resumed.', session.id]
    )
  }

  // Counsellor reassignment — restricted to agency roles and the owning
  // client_admin; a counsellor cannot reassign a lead away from themselves.
  if ('assigned_counsellor_id' in body) {
    if (!isAgency && !isOwningClientAdmin) {
      return NextResponse.json({ error: 'Forbidden: cannot reassign counsellor' }, { status: 403 })
    }
    const newCounsellorId: string | null = body.assigned_counsellor_id || null
    if (newCounsellorId) {
      const counsellor = (await query(
        `SELECT id, full_name, client_id FROM users WHERE id = $1 AND role = 'client_counsellor'`,
        [newCounsellorId]
      ))[0]
      if (!counsellor || counsellor.client_id !== existing.client_id) {
        return NextResponse.json({ error: 'Invalid counsellor for this client' }, { status: 400 })
      }
    }
    if (newCounsellorId !== existing.assigned_counsellor_id) {
      const rows = await query('UPDATE leads SET assigned_counsellor_id = $1 WHERE id = $2 RETURNING *', [
        newCounsellorId,
        params.id,
      ])
      updated = rows[0]

      const [fromName, toName] = await Promise.all([
        existing.assigned_counsellor_id
          ? query('SELECT full_name FROM users WHERE id = $1', [existing.assigned_counsellor_id]).then((r) => r[0]?.full_name)
          : Promise.resolve(null),
        newCounsellorId
          ? query('SELECT full_name FROM users WHERE id = $1', [newCounsellorId]).then((r) => r[0]?.full_name)
          : Promise.resolve(null),
      ])
      await query(
        `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
         VALUES ($1, 'system', 'Counsellor Reassigned', $2, $3)`,
        [params.id, `Counsellor changed from "${fromName || 'Unassigned'}" to "${toName || 'Unassigned'}".`, session.id]
      )
    }
  }

  // Info-tab field edits — whitelisted, dynamic UPDATE + a single diff-summary activity entry.
  const fieldUpdates = EDITABLE_FIELDS.filter((f) => f in body)
  if (fieldUpdates.length > 0) {
    if (body.decision_maker && !DECISION_MAKER_VALUES.includes(body.decision_maker)) {
      return NextResponse.json(
        { error: `decision_maker must be one of: ${DECISION_MAKER_VALUES.join(', ')}` },
        { status: 400 }
      )
    }

    const setClauses: string[] = []
    const values: any[] = []
    const changes: string[] = []

    for (const field of fieldUpdates) {
      const newValue = body[field] === '' ? null : body[field]
      if (newValue !== existing[field]) {
        values.push(newValue)
        setClauses.push(`${field} = $${values.length}`)
        changes.push(`${FIELD_LABEL[field]}: "${existing[field] ?? '—'}" → "${newValue ?? '—'}"`)
      }
    }

    if (setClauses.length > 0) {
      values.push(params.id)
      const rows = await query(
        `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      )
      updated = rows[0]

      await query(
        `INSERT INTO activity_log (lead_id, activity_type, title, description, actor_id)
         VALUES ($1, 'system', 'Lead Info Updated', $2, $3)`,
        [params.id, changes.join('; '), session.id]
      )
    }
  }

  // Institute-defined custom field values — merged into the JSONB column
  // rather than replaced wholesale, so a save from a stale form doesn't
  // clobber values for fields the user's screen didn't render.
  if (body.customFields && typeof body.customFields === 'object') {
    const merged = { ...(existing.custom_fields || {}), ...body.customFields }
    const rows = await query('UPDATE leads SET custom_fields = $1 WHERE id = $2 RETURNING *', [
      JSON.stringify(merged),
      params.id,
    ])
    updated = rows[0]
  }

  return NextResponse.json(updated)
}
