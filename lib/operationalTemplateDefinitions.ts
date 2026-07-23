// Event-triggered WhatsApp templates — not part of the Day 0/2/4/7/10
// nurture cadence, fired instead by lead lifecycle events (visit marked
// done, visit reminder window reached, no-show recorded). These replace
// lib/aisensyTemplates.ts, which only had bare template-name strings with
// no actual body content since the BSP (AiSensy) owned template creation
// on its own dashboard. On direct Meta Cloud API, WE own template content,
// so it has to live here.
export interface OperationalTemplateDefinition {
  slug: string
  category: 'UTILITY'
  variables: string[]
  body: string
}

export const OPERATIONAL_TEMPLATE_DEFINITIONS: OperationalTemplateDefinition[] = [
  {
    slug: 'post_visit_summary',
    category: 'UTILITY',
    variables: ['parent_name'],
    body: 'Hi {{1}}, thank you for visiting us today. It was great meeting you. If any questions came up after the visit, just reply here — we are happy to help.',
  },
  {
    slug: 'visit_reminder_48h',
    category: 'UTILITY',
    variables: ['parent_name', 'visit_date'],
    body: 'Hi {{1}}, a quick reminder — your campus visit is scheduled for {{2}}, just two days from now. Let us know if you need to reschedule.',
  },
  {
    slug: 'visit_reminder_24h',
    category: 'UTILITY',
    variables: ['parent_name', 'visit_date'],
    body: 'Hi {{1}}, your campus visit is coming up tomorrow, {{2}}. We are looking forward to seeing you. Reply here if anything has changed.',
  },
  {
    slug: 'visit_noshow_reschedule',
    category: 'UTILITY',
    variables: ['parent_name'],
    body: 'Hi {{1}}, we missed you at your scheduled visit — hope everything is okay. Would you like to pick a new date? Just reply here and we will find a time that works.',
  },
]

export { buildTemplateName, defaultClientCode } from './waTemplateNaming'
