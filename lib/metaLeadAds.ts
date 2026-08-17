import crypto from 'crypto'
import { fetchPageAccessToken } from './metaPages'

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0'

export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  // No secret configured yet (pre-launch/dev) — accept everything so the
  // endpoint is testable before real Meta credentials exist.
  if (!appSecret) return true
  if (!signatureHeader) return false

  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface MetaLeadFields {
  fullName: string
  whatsappNumber: string
  email: string | null
  grade: string | null
}

// Fetches the actual submitted field values for a leadgen_id from the Graph
// API. Meta's webhook payload only tells you a lead *exists* (its ID); the
// field data (name/phone/email) requires this separate authenticated call.
// Requires the Page's own Page Access Token, not a raw System User token —
// see fetchPageAccessToken's comment in metaPages.ts; this exchanges it via
// pageId before the actual lead-field lookup, same fix as the historical
// backfill needed. Until META_PAGE_ACCESS_TOKEN is set, returns stub data so
// the rest of the pipeline (dedup, campaign auto-tag, lead creation) is
// fully exercisable.
export async function fetchLeadFields(leadgenId: string, pageId: string): Promise<MetaLeadFields> {
  if (!process.env.META_PAGE_ACCESS_TOKEN) {
    console.log(`[meta:stub] would fetch field_data for leadgen_id ${leadgenId} from Graph API`)
    return {
      fullName: `Meta Lead ${leadgenId.slice(-6)}`,
      whatsappNumber: '9000000000',
      email: null,
      grade: null,
    }
  }

  const token = await fetchPageAccessToken(pageId)
  const res = await fetch(`${GRAPH_API_URL}/${leadgenId}?access_token=${token}`)
  if (!res.ok) {
    throw new Error(`Graph API returned ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  const fields: Record<string, string> = {}
  for (const f of data.field_data || []) {
    fields[f.name] = f.values?.[0] || ''
  }

  return {
    fullName: fields.full_name || fields.first_name || 'Unknown',
    whatsappNumber: fields.phone_number || '',
    email: fields.email || null,
    grade: fields.grade || fields.class || null,
  }
}
