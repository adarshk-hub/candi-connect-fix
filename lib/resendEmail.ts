export interface ResendSendResult {
  ok: boolean
  messageId?: string
  error?: string
}

// Sends via Resend's REST API directly (no SDK — same lightweight
// approach as the Razorpay integration) using ONE shared, Resend-verified
// sending domain for the whole platform (RESEND_FROM_EMAIL, e.g.
// broadcasts@mail.yourdomain.com). Individual clients don't (and can't,
// without giving us DNS access to their own domain) get their own
// verified sending domain — instead, each school's identity is preserved
// two ways: the display name shows the school's name
// ("Greenwood School <broadcasts@mail.yourdomain.com>"), and Reply-To is
// set to that school's own address (school_email from Settings > Email)
// so replies land in the right inbox even though the technical envelope
// sender is shared infrastructure.
//
// This is unrelated to lib/email.ts, which sends one-off per-lead emails
// through each school's own SMTP mailbox — that path is unaffected and
// still the right choice for personal, one-to-one emails. This one is
// only for bulk broadcast sends, which per-mailbox SMTP isn't built for
// (rate limits, no bounce/suppression handling).
export async function sendResendEmail(params: {
  toEmail: string
  fromName: string // e.g. the school's name
  replyTo?: string | null
  subject: string
  html: string
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !fromEmail) {
    console.log(`[resend:stub] would send "${params.subject}" to ${params.toEmail} from "${params.fromName}"`)
    return { ok: true, messageId: `stub-${Date.now()}` }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${params.fromName} <${fromEmail}>`,
        to: [params.toEmail],
        reply_to: params.replyTo || undefined,
        subject: params.subject,
        html: params.html,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: data?.message || `Resend returned ${res.status}` }
    }
    return { ok: true, messageId: data.id }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Resend request failed' }
  }
}
