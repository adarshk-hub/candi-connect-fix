import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Trackable-redirect target for links embedded in outbound WhatsApp
// messages (e.g. a visit booking link). Records the first click, then
// redirects to the real destination — public/unauthenticated by necessity,
// since it's opened directly from WhatsApp on the parent's phone.
export async function GET(req: NextRequest, { params }: { params: { messageId: string } }) {
  const message = (await query('SELECT link_url, link_clicked_at FROM whatsapp_messages WHERE id = $1', [
    params.messageId,
  ]))[0]

  if (!message || !message.link_url) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  if (!message.link_clicked_at) {
    await query('UPDATE whatsapp_messages SET link_clicked_at = now() WHERE id = $1', [params.messageId])
  }

  return NextResponse.redirect(message.link_url)
}
