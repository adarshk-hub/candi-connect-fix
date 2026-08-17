const GRAPH_API_URL = 'https://graph.facebook.com/v19.0'

export interface HistoricalMetaLead {
  leadgenId: string
  createdTime: string // ISO
  formId: string
  formName: string
  fullName: string
  whatsappNumber: string
  email: string | null
  grade: string | null
  campaignId: string | null
  adsetId: string | null
  adId: string | null
}

// IMPORTANT — a hard limit on Meta's side, not something any code here can
// work around: Meta only retains Lead Ads submission data for 90 days.
// Anything older than that has already been permanently purged from Meta's
// systems by the time this runs, regardless of permissions or token
// validity — the API will simply not return it. If Candid Schools' leads
// predate that window, this can only ever recover the last ~90 days, not
// their full history.
const META_LEAD_RETENTION_DAYS = 90

function fieldValue(fieldData: any[], name: string): string | null {
  const f = fieldData.find((x) => x.name === name)
  return f?.values?.[0] || null
}

// Lists every lead form ever created on the Page, then pages through every
// historical submission for each one. Requires a token with leads_retrieval
// permission that's been added as a partner on the Page itself (Business
// Settings > Accounts > Pages > that Page > Partners) — the same kind of
// asset-assignment step already done for the ad account, just on the Page
// instead.
export async function fetchHistoricalMetaLeads(pageId: string): Promise<HistoricalMetaLead[]> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    throw new Error('META_PAGE_ACCESS_TOKEN is not set on the server.')
  }

  const forms: { id: string; name: string }[] = []
  let formsUrl: string | null = `${GRAPH_API_URL}/${pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${token}`
  while (formsUrl) {
    const res: Response = await fetch(formsUrl)
    if (!res.ok) throw new Error(`Graph API (leadgen_forms) returned ${res.status}: ${await res.text()}`)
    const json: any = await res.json()
    for (const f of json.data || []) forms.push({ id: f.id, name: f.name })
    formsUrl = json.paging?.next || null
  }

  const results: HistoricalMetaLead[] = []

  for (const form of forms) {
    let leadsUrl: string | null =
      `${GRAPH_API_URL}/${form.id}/leads?fields=id,created_time,field_data,ad_id,adset_id,campaign_id&limit=100&access_token=${token}`
    while (leadsUrl) {
      const res: Response = await fetch(leadsUrl)
      if (!res.ok) {
        // A single bad/expired form shouldn't kill the whole backfill —
        // log and move on to the next form.
        console.error(`[meta-backfill] leads fetch failed for form ${form.id}: ${res.status} ${await res.text()}`)
        break
      }
      const json: any = await res.json()
      for (const lead of json.data || []) {
        const fieldData = lead.field_data || []
        results.push({
          leadgenId: lead.id,
          createdTime: lead.created_time,
          formId: form.id,
          formName: form.name,
          fullName: fieldValue(fieldData, 'full_name') || fieldValue(fieldData, 'first_name') || 'Unknown',
          whatsappNumber: fieldValue(fieldData, 'phone_number') || '',
          email: fieldValue(fieldData, 'email'),
          grade: fieldValue(fieldData, 'grade') || fieldValue(fieldData, 'class'),
          campaignId: lead.campaign_id || null,
          adsetId: lead.adset_id || null,
          adId: lead.ad_id || null,
        })
      }
      leadsUrl = json.paging?.next || null
    }
  }

  return results
}

export { META_LEAD_RETENTION_DAYS }
