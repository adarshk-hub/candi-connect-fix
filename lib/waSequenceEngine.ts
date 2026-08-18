import { query } from './db'
import { sendTemplateMessage } from './metaWhatsapp'
import { NURTURE_STEPS } from './nurtureSteps'

interface SequenceStep {
  day: number
  templateName: string
  languageCode: string
}

// Per-client template overrides live in wa_sequence_templates. Clients that
// haven't configured their own templates yet fall back to the shared
// NURTURE_STEPS defaults (nurture_day0 / nurture_day2 / ...), same names
// the old Aisensy path used, so nothing breaks for clients mid-migration.
async function getStepsForClient(clientId: string): Promise<SequenceStep[]> {
  const rows = await query<{ day_number: number; template_name: string; language_code: string }>(
    'SELECT day_number, template_name, language_code FROM wa_sequence_templates WHERE client_id = $1 ORDER BY day_number ASC',
    [clientId]
  )
  if (rows.length > 0) {
    return rows.map((r) => ({ day: r.day_number, templateName: r.template_name, languageCode: r.language_code }))
  }
  return NURTURE_STEPS.map((s) => ({ day: s.day, templateName: s.templateName, languageCode: 'en' }))
}

// Creates a wa_sequences row, schedules all remaining days as
// wa_sequence_messages, sends Day 0 immediately, and points
// leads.wa_sequence_id at the new sequence. Safe to call even if a lead
// already has a completed/cancelled sequence — a new one is started
// alongside it (the lead's wa_sequence_id simply moves to the new one).
export async function startSequence(leadId: string): Promise<{ ok: boolean; sequenceId?: string; error?: string }> {
  const lead = (await query('SELECT * FROM leads WHERE id = $1', [leadId]))[0]
  if (!lead) return { ok: false, error: 'Lead not found' }

  const existingActive = (
    await query('SELECT id FROM wa_sequences WHERE lead_id = $1 AND status = $2', [leadId, 'active'])
  )[0]
  if (existingActive) return { ok: false, error: 'Lead already has an active sequence' }

  const steps = await getStepsForClient(lead.client_id)
  if (steps.length === 0) return { ok: false, error: 'No sequence templates configured for this client' }

  const sequence = (
    await query(
      `INSERT INTO wa_sequences (lead_id, client_id, phone_number, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [leadId, lead.client_id, lead.whatsapp_number]
    )
  )[0]

  await query('UPDATE leads SET wa_sequence_id = $1 WHERE id = $2', [sequence.id, leadId])

    const now = new Date()
  for (const step of steps) {
    const scheduledFor = new Date(now.getTime() + step.day * 24 * 60 * 60 * 1000)
    await query(
      `INSERT INTO wa_sequence_messages (sequence_id, day_number, template_name, language_code, scheduled_for, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [sequence.id, step.day, step.templateName, step.languageCode, scheduledFor]
    )
  }

  // Day 0 and Day 2 both fire immediately, back to back, rather than
  // waiting for their scheduled time (Day 2 would otherwise sit 'pending'
  // for two real days before the cron/advanceDueMessages picks it up).
  // Each send marks its own row 'sent' right away, so the later cron pass
  // simply finds nothing pending for either and skips them — no risk of a
  // duplicate send once the real Day 2 time rolls around. Day 4/7/10 are
  // untouched and still follow the normal scheduled cadence from lead
  // creation.
  const day0AndDay2 = await query(
    `SELECT * FROM wa_sequence_messages WHERE sequence_id = $1 AND day_number IN (0, 2) ORDER BY day_number ASC`,
    [sequence.id]
  )
  for (const msg of day0AndDay2) {
    await sendDueMessage(msg)
  }

  return { ok: true, sequenceId: sequence.id }
}

async function sendDueMessage(msg: any): Promise<void> {
  if (!msg) return

  const sequence = (await query('SELECT * FROM wa_sequences WHERE id = $1', [msg.sequence_id]))[0]
  if (!sequence || sequence.status !== 'active') {
    await query(`UPDATE wa_sequence_messages SET status = 'skipped' WHERE id = $1`, [msg.id])
    return
  }

  const lead = (await query('SELECT * FROM leads WHERE id = $1', [sequence.lead_id]))[0]

  let result: { ok: boolean; wamid?: string; error?: string }
  try {
    result = await sendTemplateMessage({
      clientId: sequence.client_id,
      to: sequence.phone_number,
      templateName: msg.template_name,
      languageCode: msg.language_code,
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: lead?.full_name || 'there' }],
        },
      ],
    })
  } catch (err: any) {
    // A row already claimed as 'processing' must not get stuck there if
    // the send call throws — mark it failed so it's visible and retryable
    // rather than silently vanishing from the pending queue forever.
    result = { ok: false, error: err?.message || 'Unexpected error sending template' }
  }

  await query(
    `UPDATE wa_sequence_messages
     SET status = $1, wamid = $2, sent_at = now(), error_text = $3
     WHERE id = $4`,
    [result.ok ? 'sent' : 'failed', result.wamid || null, result.error || null, msg.id]
  )

  await query(
    `INSERT INTO whatsapp_messages
       (lead_id, direction, message_type, body, template_name, status, wamid, sequence_id, sequence_day)
     VALUES ($1, 'outbound', 'template', $2, $3, $4, $5, $6, $7)`,
    [
      sequence.lead_id,
      `[Day ${msg.day_number}] ${msg.template_name} template ${result.ok ? 'sent' : `failed to send: ${result.error || 'unknown error'}`}.`,
      msg.template_name,
      result.ok ? 'sent' : 'failed',
      result.wamid || null,
      sequence.id,
      msg.day_number,
    ]
  )

  await query(
    `INSERT INTO activity_log (lead_id, activity_type, title, description)
     VALUES ($1, 'system', 'Nurture Sequence', $2)`,
    [
      sequence.lead_id,
      `Day ${msg.day_number} (${msg.template_name}) ${result.ok ? 'sent' : 'failed: ' + result.error} via Meta WhatsApp API.`,
    ]
  )

  await query(
    `UPDATE leads SET nurture_day = $1, nurture_started_at = COALESCE(nurture_started_at, now()) WHERE id = $2`,
    [msg.day_number, sequence.lead_id]
  )

  // Last step in the sequence — mark the whole sequence completed.
  const remaining = await query(
    `SELECT id FROM wa_sequence_messages WHERE sequence_id = $1 AND status = 'pending'`,
    [sequence.id]
  )
  if (remaining.length === 0) {
    await query(`UPDATE wa_sequences SET status = 'completed' WHERE id = $1`, [sequence.id])
  }
}

// Polled every ~60s by app/api/cron/wa-sequence-advance.
//
// IMPORTANT: `query()` runs through the pool with no explicit transaction,
// so a bare `SELECT ... FOR UPDATE SKIP LOCKED` on its own does nothing
// useful — Postgres commits (and releases the row lock) the instant that
// single SELECT statement finishes, well before we get around to sending
// the message and marking it 'sent'. Two overlapping cron invocations
// could both select the same due row and both send it.
//
// Fix: claim rows with a single atomic UPDATE ... WHERE id IN (SELECT ...
// FOR UPDATE SKIP LOCKED) statement. The SELECT's lock and the UPDATE that
// consumes it happen inside the *same* statement/implicit-transaction, so
// the row is flipped to 'processing' before the lock is ever released —
// no other concurrent invocation can grab it in between.
export async function advanceDueMessages(): Promise<{ processed: number }> {
  const claimed = await query(
    `UPDATE wa_sequence_messages
     SET status = 'processing'
     WHERE id IN (
       SELECT wsm.id
       FROM wa_sequence_messages wsm
       JOIN wa_sequences ws ON ws.id = wsm.sequence_id
       WHERE wsm.status = 'pending'
         AND wsm.scheduled_for <= now()
         AND ws.status = 'active'
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  )

  for (const msg of claimed) {
    await sendDueMessage(msg)
  }

  return { processed: claimed.length }
}

export async function pauseSequence(sequenceId: string, note?: string): Promise<boolean> {
  const rows = await query(
    `UPDATE wa_sequences SET status = 'paused', paused_note = $1 WHERE id = $2 AND status = 'active' RETURNING id, lead_id`,
    [note || null, sequenceId]
  )
  if (rows.length === 0) return false
  await query('UPDATE leads SET nurture_paused = true WHERE id = $1', [rows[0].lead_id])
  return true
}

// Called automatically when a counsellor sends a manual reply from the CRM
// — finds the lead's active sequence (if any) and pauses it, so the
// automated drip doesn't talk over a human conversation already in
// progress.
export async function pauseSequenceForLead(leadId: string, note?: string): Promise<boolean> {
  const active = (
    await query(`SELECT id FROM wa_sequences WHERE lead_id = $1 AND status = 'active'`, [leadId])
  )[0]
  if (!active) return false
  return pauseSequence(active.id, note || `Paused — counsellor active since ${new Date().toISOString()}`)
}

export async function resumeSequence(sequenceId: string): Promise<boolean> {
  const rows = await query(
    `UPDATE wa_sequences SET status = 'active', paused_note = NULL WHERE id = $1 AND status = 'paused' RETURNING id, lead_id`,
    [sequenceId]
  )
  if (rows.length === 0) return false
  await query('UPDATE leads SET nurture_paused = false WHERE id = $1', [rows[0].lead_id])
  return true
}

// Resumes whichever paused sequence belongs to this lead — mirrors
// pauseSequenceForLead so the leads.nurture_paused PATCH toggle (and any
// other lead-scoped caller) doesn't need to know the sequence's own id.
export async function resumeSequenceForLead(leadId: string): Promise<boolean> {
  const paused = (
    await query(`SELECT id FROM wa_sequences WHERE lead_id = $1 AND status = 'paused'`, [leadId])
  )[0]
  if (!paused) return false
  return resumeSequence(paused.id)
}

export async function cancelSequence(sequenceId: string): Promise<boolean> {
  const rows = await query(
    `UPDATE wa_sequences SET status = 'cancelled' WHERE id = $1 AND status IN ('active', 'paused') RETURNING id`,
    [sequenceId]
  )
  return rows.length > 0
}
