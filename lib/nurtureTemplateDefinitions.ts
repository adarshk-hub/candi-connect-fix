// The 5 education nurture templates from the build spec — actual Meta
// template bodies/variables, not just day-number placeholders. These are
// what NURTURE_STEPS (lib/nurtureSteps.ts) pointed at by name only; this
// file is the source of truth for what actually gets submitted to Meta.
//
// Client-safe (no server-only imports) so it can be shared by the seed
// endpoint (server) and the WhatsApp settings panel (client, for preview).
export interface NurtureTemplateDefinition {
  day: number
  /** Suffix appended to {CLIENT_CODE}_ to form the Meta template name. */
  slug: string
  category: 'UTILITY'
  /** {{1}}, {{2}}... placeholders in order, for reference/preview only. */
  variables: string[]
  body: string
}

export const NURTURE_TEMPLATE_DEFINITIONS: NurtureTemplateDefinition[] = [
  {
    day: 0,
    slug: 'day0_welcome',
    category: 'UTILITY',
    variables: ['parent_name', 'institution_name', 'child_name_or_you'],
    body: 'Hi {{1}}, thanks for your enquiry about {{2}}. Quick question — is {{3}} looking to join this academic year or planning ahead for next year?',
  },
  {
    day: 2,
    slug: 'day2_story',
    category: 'UTILITY',
    variables: ['parent_name', 'exam_name'],
    body: 'We wanted to share something with you, {{1}}. One of our students came to us after struggling at another institute. 14 months later, they cleared {{2}} with a strong score. The one thing that made the difference: small batches and individual doubt-clearing. Would you like to see how this works in person?',
  },
  {
    day: 4,
    slug: 'day4_fee',
    category: 'UTILITY',
    variables: ['parent_name', 'institution_name'],
    body: 'Hi {{1}}, many families ask us whether {{2}} fees are justified. Here is the honest answer: the cost of switching institutes mid-year — in lost time and re-adjustment — is almost always higher than the fee difference. We are not the cheapest option. We are the one where the outcome is most predictable.',
  },
  {
    day: 7,
    slug: 'day7_urgency',
    category: 'UTILITY',
    variables: ['parent_name', 'program_name', 'batch_size', 'date_option_1', 'date_option_2'],
    body: 'Quick update, {{1}} — the {{2}} batch is filling up. We keep batches under {{3}} students to maintain individual attention. If you are seriously considering this, the next step is a 90-minute campus visit — no commitment required. Would {{4}} or {{5}} work?',
  },
  {
    day: 10,
    slug: 'day10_visit',
    category: 'UTILITY',
    variables: ['parent_name', 'counsellor_name', 'institution_name'],
    body: 'Hi {{1}}, this is {{2}} from {{3}}. I noticed we have not connected yet. I would love to personally show you how a regular day works here — not a presentation, just a real look. Most families tell us the visit answered every question they had. Can we find 90 minutes this week?',
  },
]

export { buildTemplateName, defaultClientCode } from './waTemplateNaming'
