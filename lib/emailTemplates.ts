// Email counterpart to lib/aisensyTemplates.ts — same "important stage or
// reminder" trigger points, rendered here (not as opaque provider-side
// template names) since we own the content and want it previewable/editable
// before sending. No server-only imports, so this can run both in the
// browser (for the preview modal) and on the server (for automated
// reminder emails).

export interface EmailTemplateVars {
  leadName: string
  childName?: string | null
  instituteName?: string | null
  counsellorName?: string | null
  visitDate?: string | null
}

export interface RenderedEmail {
  subject: string
  body: string
}

export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  replied: 'Stage 2 Replied',
  call_booked: 'Stage 3 Call Booked',
  visit_booked: 'Stage 4 Visit Booked',
  registered: 'Stage 5 Registered',
  admission: 'Stage 6 Admission',
}

export const VISIT_REMINDER_48H_KEY = 'visit_reminder_48h'
export const VISIT_REMINDER_24H_KEY = 'visit_reminder_24h'
export const POST_VISIT_SUMMARY_KEY = 'post_visit_summary'

export function renderEmailTemplate(key: string, vars: EmailTemplateVars): RenderedEmail {
  const institute = vars.instituteName || 'our institute'
  const child = vars.childName ? vars.childName : null

  switch (key) {
    case 'replied':
      return {
        subject: `Great to connect, ${vars.leadName}!`,
        body: `Hi ${vars.leadName},\n\nThanks for getting back to us about ${child ? `${child}'s` : "your child's"} admission at ${institute}. We're glad to continue the conversation — let us know if you have any questions.\n\nBest,\n${institute}`,
      }
    case 'call_booked':
      return {
        subject: `Your call with ${institute} is booked`,
        body: `Hi ${vars.leadName},\n\nThis confirms your call with our admissions team${vars.counsellorName ? ` (${vars.counsellorName})` : ''}. We look forward to speaking with you soon.\n\nBest,\n${institute}`,
      }
    case 'visit_booked':
      return {
        subject: `Campus visit confirmed — ${institute}`,
        body: `Hi ${vars.leadName},\n\nYour campus visit${vars.visitDate ? ` on ${vars.visitDate}` : ''} is confirmed. We're excited to show you around ${institute}. See you soon!\n\nBest,\n${institute}`,
      }
    case 'registered':
      return {
        subject: `You're registered with ${institute}`,
        body: `Hi ${vars.leadName},\n\nThank you for registering${child ? ` ${child}` : ''} with ${institute}. Our team will follow up shortly with next steps.\n\nBest,\n${institute}`,
      }
    case 'admission':
      return {
        subject: `Welcome to ${institute}!`,
        body: `Hi ${vars.leadName},\n\nCongratulations! We're delighted to confirm ${child ? `${child}'s` : 'your'} admission to ${institute}. Our team will reach out with onboarding details soon.\n\nWarm regards,\n${institute}`,
      }
    case VISIT_REMINDER_48H_KEY:
      return {
        subject: `Reminder: your campus visit in 2 days — ${institute}`,
        body: `Hi ${vars.leadName},\n\nJust a reminder that your campus visit${vars.visitDate ? ` is on ${vars.visitDate}` : ' is coming up'}. We look forward to welcoming you.\n\nBest,\n${institute}`,
      }
    case VISIT_REMINDER_24H_KEY:
      return {
        subject: `Reminder: your campus visit is tomorrow — ${institute}`,
        body: `Hi ${vars.leadName},\n\nYour campus visit${vars.visitDate ? ` is tomorrow, ${vars.visitDate}` : ' is tomorrow'}. See you then!\n\nBest,\n${institute}`,
      }
    case POST_VISIT_SUMMARY_KEY:
      return {
        subject: `Thank you for visiting ${institute}`,
        body: `Hi ${vars.leadName},\n\nThank you for visiting ${institute} today. We hope you enjoyed the tour — please reach out if you have any questions as you consider next steps.\n\nBest,\n${institute}`,
      }
    default:
      return { subject: `Update from ${institute}`, body: `Hi ${vars.leadName},\n\n` }
  }
}
