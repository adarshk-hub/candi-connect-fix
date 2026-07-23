import { query } from './db'
import { sendOperationalTemplate } from './metaWhatsapp'
import { sendEmail, SmtpConfig } from './email'
import { renderEmailTemplate, VISIT_REMINDER_48H_KEY, VISIT_REMINDER_24H_KEY } from './emailTemplates'

interface ReminderResult {
  eventId: string
  leadId: string
  reminder: '48h' | '24h'
  ok: boolean
  error?: string
}

// node-postgres returns DATE columns as JS Date objects representing local
// midnight of that calendar date — NOT plain "YYYY-MM-DD" strings. Naively
// template-concatenating one (`${eventDate}T...`) stringifies it via
// .toString() into an unparseable mess ("Thu Jul 02 2026 00:00:00 GMT+0530
// (India Standard Time)T14:11:52"), so new Date(...) silently returns
// Invalid Date and every reminder-timing comparison evaluates to false.
// Reading the date parts back out with local getters (not toISOString,
// which would shift across the UTC boundary and land on the wrong day)
// reconstructs the intended calendar date correctly before recombining
// with the time-of-day.
function visitDateTime(eventDate: string | Date, eventTime: string | null): Date {
  const d = eventDate instanceof Date ? eventDate : new Date(eventDate)
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const timeStr = (eventTime || '00:00:00').slice(0, 8)
  return new Date(`${dateStr}T${timeStr}`)
}

// Reminders are automated (cron-fired, no human present), so — unlike the
// Email tab's manual sends — there's no preview/edit step here; it goes out
// exactly as rendered by the shared template. Silently no-ops if the lead
// has no email or the client hasn't connected a school mailbox yet.
async function sendReminderEmail(row: {
  lead_id: string
  full_name: string
  email: string | null
  client_id: string
  visitDateLabel: string
}, templateKey: string): Promise<void> {
  if (!row.email) return

  const [client] = await query<{
    name: string
    school_email: string | null
    email_from_name: string | null
    smtp_host: string | null
    smtp_port: number | null
    smtp_user: string | null
    smtp_pass: string | null
  }>(
    `SELECT name, school_email, email_from_name, smtp_host, smtp_port, smtp_user, smtp_pass
     FROM clients WHERE id = $1`,
    [row.client_id]
  )
  if (!client) return

  const { subject, body } = renderEmailTemplate(templateKey, {
    leadName: row.full_name,
    instituteName: client.name,
    visitDate: row.visitDateLabel,
  })

  const config: SmtpConfig = {
    host: client.smtp_host,
    port: client.smtp_port,
    user: client.smtp_user,
    pass: client.smtp_pass,
    fromEmail: client.school_email,
    fromName: client.email_from_name,
  }
  const result = await sendEmail(config, { to: row.email, subject, body })

  await query(
    `INSERT INTO email_messages (lead_id, template_key, subject, body, to_email, status, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.lead_id, templateKey, subject, body, row.email, result.ok ? 'sent' : 'failed', result.error || null]
  )
}

// Scans every still-scheduled campus visit and fires the 48h/24h reminder
// (WhatsApp + email, if the lead has an address and the institute has a
// school mailbox connected) the moment its window arrives, exactly once
// each (guarded by the *_sent_at columns). Meant to be invoked periodically
// by an external scheduler hitting /api/cron/visit-reminders — this app has
// no persistent background worker of its own to fire time-based sends on a
// timer.
export async function sendDueVisitReminders(): Promise<ReminderResult[]> {
  const rows = await query<{
    id: string
    lead_id: string
    event_date: string
    event_time: string | null
    reminder_48h_sent_at: string | null
    reminder_24h_sent_at: string | null
    full_name: string
    whatsapp_number: string
    email: string | null
    client_id: string
  }>(
    `SELECT e.id, e.lead_id, e.event_date, e.event_time, e.reminder_48h_sent_at, e.reminder_24h_sent_at,
            l.full_name, l.whatsapp_number, l.email, l.client_id
     FROM events e
     JOIN leads l ON l.id = e.lead_id
     WHERE e.event_type = 'session_booked' AND e.status = 'scheduled'
       AND (e.reminder_48h_sent_at IS NULL OR e.reminder_24h_sent_at IS NULL)`
  )

  const results: ReminderResult[] = []
  const now = Date.now()

  for (const row of rows) {
    const visitAt = visitDateTime(row.event_date, row.event_time).getTime()
    const visitDateLabel = new Date(visitAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

    if (!row.reminder_48h_sent_at && now >= visitAt - 48 * 60 * 60 * 1000) {
      const result = await sendOperationalTemplate({
        clientId: row.client_id,
        to: row.whatsapp_number,
        slug: 'visit_reminder_48h',
        bodyParams: [row.full_name, visitDateLabel],
      })
      await sendReminderEmail({ ...row, visitDateLabel }, VISIT_REMINDER_48H_KEY)
      await query('UPDATE events SET reminder_48h_sent_at = now() WHERE id = $1', [row.id])
      await query(
        `INSERT INTO activity_log (lead_id, activity_type, title, description)
         VALUES ($1, 'system', 'Visit Reminder Sent', $2)`,
        [row.lead_id, `48-hour visit reminder ${result.ok ? 'sent' : 'failed to send'} via Meta WhatsApp API${row.email ? ' and email' : ''}.`]
      )
      results.push({ eventId: row.id, leadId: row.lead_id, reminder: '48h', ok: result.ok, error: result.error })
    }

    if (!row.reminder_24h_sent_at && now >= visitAt - 24 * 60 * 60 * 1000) {
      const result = await sendOperationalTemplate({
        clientId: row.client_id,
        to: row.whatsapp_number,
        slug: 'visit_reminder_24h',
        bodyParams: [row.full_name, visitDateLabel],
      })
      await sendReminderEmail({ ...row, visitDateLabel }, VISIT_REMINDER_24H_KEY)
      await query('UPDATE events SET reminder_24h_sent_at = now() WHERE id = $1', [row.id])
      await query(
        `INSERT INTO activity_log (lead_id, activity_type, title, description)
         VALUES ($1, 'system', 'Visit Reminder Sent', $2)`,
        [row.lead_id, `24-hour visit reminder ${result.ok ? 'sent' : 'failed to send'} via Meta WhatsApp API${row.email ? ' and email' : ''}.`]
      )
      results.push({ eventId: row.id, leadId: row.lead_id, reminder: '24h', ok: result.ok, error: result.error })
    }
  }

  return results
}
