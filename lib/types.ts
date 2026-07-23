export interface Lead {
  id: string
  full_name: string
  child_name: string | null
  whatsapp_number: string
  second_phone: string | null
  email: string | null
  occupation: string | null
  company_name: string | null
  location: string | null
  grade: string | null
  service_interested_in: string | null
  source: string
  timeline: 'this_year' | 'next_year' | 'exploring' | null
  decision_maker: string | null
  competitors_visited: string | null
  key_concern: string | null
  entry_type: string | null
  urgency_score: number
  program_fit_score: number
  engagement_score: number
  lead_score: number
  pipeline_stage: string
  stage_updated_at: string
  created_at: string
  client_id: string
  campaign_id: string | null
  assigned_counsellor_id: string | null
  campaign_display_name: string | null
  campaign_platform: 'meta' | 'google' | null
  counsellor_name: string | null
  counsellor_initials: string | null
  client_name: string | null
  nurture_day: number | null
  nurture_paused: boolean
  custom_fields: Record<string, any>
}

export const TIMELINE_LABEL: Record<string, string> = {
  this_year: 'This academic year',
  next_year: 'Next academic year',
  exploring: 'Just exploring',
}

export const DECISION_MAKER_LABEL: Record<string, string> = {
  parent: 'Parent',
  student: 'Student',
  both: 'Both (parent & student)',
}

export const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  google: 'Google',
  website_contact_form: 'Website Contact Form',
  direct_walkin: 'Direct walkin',
  influencer_referral: 'Influencer referral',
  manual: 'Manual',
  other: 'Other',
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}
