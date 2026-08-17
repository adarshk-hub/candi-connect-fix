import { query } from './db'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export interface ConversationWindow {
  open: boolean
  lastInboundAt: string | null
  hoursRemaining: number | null
}

// Meta only allows free-form ("session") messages inside the 24-hour
// customer service window, which opens the moment the client messages in
// and closes 24 hours after their most recent inbound message. Outside
// that window, only approved templates can be sent. This is the single
// source of truth for that check — computed from the DB (not trusted from
// the client) so both the send route and any status endpoint agree.
export async function getConversationWindow(leadId: string): Promise<ConversationWindow> {
  const row = (
    await query<{ created_at: string }>(
      `SELECT created_at FROM whatsapp_messages
       WHERE lead_id = $1 AND direction = 'inbound'
       ORDER BY created_at DESC LIMIT 1`,
      [leadId]
    )
  )[0]

  if (!row) {
    return { open: false, lastInboundAt: null, hoursRemaining: null }
  }

  const lastInboundAt = new Date(row.created_at)
  const elapsedMs = Date.now() - lastInboundAt.getTime()
  const open = elapsedMs < TWENTY_FOUR_HOURS_MS

  return {
    open,
    lastInboundAt: lastInboundAt.toISOString(),
    hoursRemaining: open ? Math.max(0, (TWENTY_FOUR_HOURS_MS - elapsedMs) / (60 * 60 * 1000)) : 0,
  }
}
