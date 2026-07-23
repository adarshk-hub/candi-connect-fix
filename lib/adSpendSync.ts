import { query } from './db'
import { fetchMetaCampaignSpend, CampaignSpend } from './metaAdsSpend'
import { fetchGoogleCampaignSpend } from './googleAdsSpend'

interface SyncResult {
  clientId: string
  platform: 'meta' | 'google'
  campaignsMatched: number
  campaignsUnmatched: number
  unmatchedNames: string[]
}

// Monday of the week containing `d`, as a YYYY-MM-DD string (no time-of-day
// component, matching how week_starting is stored/keyed elsewhere in the app).
function mondayOf(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Applies fetched platform spend to internal campaign rows and upserts
// ad_spend_weekly. A single real ad-platform campaign can correspond to
// multiple internal `campaigns` rows (Meta Lead Ads auto-creates one per
// unique campaign/adset/ad combo) — matching is done on
// (client_id, platform, platform_campaign_id) only, and the same total spend
// is written against every internal row that shares that platform_campaign_id.
// This is a known simplification: if Meta ever reports adset- or ad-level
// spend instead of campaign-level, this will need to match on those IDs too.
async function applySpend(
  clientId: string,
  platform: 'meta' | 'google',
  weekStarting: string,
  spendRows: CampaignSpend[]
): Promise<SyncResult> {
  const result: SyncResult = { clientId, platform, campaignsMatched: 0, campaignsUnmatched: 0, unmatchedNames: [] }
  const source = platform === 'meta' ? 'meta_api' : 'google_api'

  for (const row of spendRows) {
    const campaigns = await query<{ id: string }>(
      `SELECT id FROM campaigns WHERE client_id = $1 AND platform = $2 AND platform_campaign_id = $3`,
      [clientId, platform, row.platformCampaignId]
    )

    if (campaigns.length === 0) {
      result.campaignsUnmatched++
      result.unmatchedNames.push(row.campaignName)
      continue
    }

    for (const c of campaigns) {
      await query(
        `INSERT INTO ad_spend_weekly (campaign_id, week_starting, spend_amount, source, synced_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (campaign_id, week_starting)
         DO UPDATE SET spend_amount = EXCLUDED.spend_amount, source = EXCLUDED.source, synced_at = now()`,
        [c.id, weekStarting, row.spend, source]
      )
      result.campaignsMatched++
    }
  }

  return result
}

// Syncs ad spend for every client with a connected ad account, for the week
// containing `forDate` (defaults to now). Meant to be invoked by
// /api/cron/ad-spend-sync (scheduled) or a manual "Sync Now" click.
export async function syncAdSpend(forDate: Date = new Date()): Promise<SyncResult[]> {
  const weekStarting = mondayOf(forDate)
  const since = weekStarting
  const until = addDays(weekStarting, 6)

  const clients = await query<{
    id: string
    meta_ad_account_id: string | null
    google_ads_customer_id: string | null
  }>(`SELECT id, meta_ad_account_id, google_ads_customer_id FROM clients WHERE meta_ad_account_id IS NOT NULL OR google_ads_customer_id IS NOT NULL`)

  const results: SyncResult[] = []

  for (const client of clients) {
    if (client.meta_ad_account_id) {
      const spend = await fetchMetaCampaignSpend({ adAccountId: client.meta_ad_account_id, since, until })
      results.push(await applySpend(client.id, 'meta', weekStarting, spend))
    }
    if (client.google_ads_customer_id) {
      const spend = await fetchGoogleCampaignSpend({ customerId: client.google_ads_customer_id, since, until })
      results.push(await applySpend(client.id, 'google', weekStarting, spend))
    }
  }

  return results
}
