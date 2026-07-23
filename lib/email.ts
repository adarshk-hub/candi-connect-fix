import nodemailer from 'nodemailer'

interface SendResult {
  ok: boolean
  error?: string
}

export interface SmtpConfig {
  host: string | null
  port: number | null
  user: string | null
  pass: string | null
  fromEmail: string | null
  fromName: string | null
}

// Sends via the institute's own mailbox (SMTP), not a shared agency-wide
// provider — each school configures its own account in Settings > Customize
// > School Email so recipients see mail genuinely coming from the school,
// not a third-party sender. Until a client has host/user/pass/fromEmail
// set, sends are logged and treated as successful without hitting the
// network, matching the stub pattern used for Aisensy/Meta elsewhere in
// this project — so the Email tab is fully usable in dev before any real
// mailbox is connected.
export async function sendEmail(config: SmtpConfig, params: { to: string; subject: string; body: string }): Promise<SendResult> {
  if (!config.host || !config.user || !config.pass || !config.fromEmail) {
    console.log(
      `[email:stub] would send "${params.subject}" to ${params.to} from ${config.fromEmail || '<school_email unset>'}`
    )
    return { ok: true }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    })
    await transporter.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      to: params.to,
      subject: params.subject,
      text: params.body,
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Email send failed' }
  }
}
