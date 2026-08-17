import { query } from './db'
import { fetchMetaCampaignSpend, fetchMetaCampaignSpendRange, CampaignSpend } from './metaAdsSpend'
import { fetchGoogleCampaignSpend } from './googleAdsSpend'
import { findOrCreateCampaign } from './leadIntake'

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
//
// Bulk version: does one lookup query for every distinct campaign in this
// batch (not one query per row), then one chunked multi-row upsert instead
// of an individual INSERT per (campaign, week). The original per-row-await
// version was fine for syncAdSpend's single-week volume, but fell over
// during backfillMetaAdSpend — up to 52 weeks times 100+ campaigns is
// thousands of sequential round trips, comfortably past any serverless
// function's time limit, and failed with an opaque timeout rather than a
// real error.
async function applySpendBulk(
  clientId: string,
  platform: 'meta' | 'google',
  // Every (weekStarting, spend row) pair to write in this call — callers
  // pass everything they have in one go rather than looping week by week.
  entries: { weekStarting: string; row: CampaignSpend }[]
): Promise<SyncResult> {
  const result: SyncResult = { clientId, platform, campaignsMatched: 0, campaignsUnmatched: 0, unmatchedNames: [] }
  if (entries.length === 0) return result
  const source = platform === 'meta' ? 'meta_api' : 'google_api'

  const distinctPlatformIds = Array.from(new Set(entries.map((e) => e.row.platformCampaignId)))
  const existing = await query<{ id: string; platform_campaign_id: string }>(
    `SELECT id, platform_campaign_id FROM campaigns
     WHERE client_id = $1 AND platform = $2 AND platform_campaign_id = ANY($3::text[])`,
    [clientId, platform, distinctPlatformIds]
  )

  const idsByPlatformId = new Map<string, string[]>()
  for (const row of existing) {
    const list = idsByPlatformId.get(row.platform_campaign_id) || []
    list.push(row.id)
    idsByPlatformId.set(row.platform_campaign_id, list)
  }

  // Auto-create whatever's still missing — bounded by the number of
  // distinct campaigns (dozens to low hundreds), not the number of
  // (campaign, week) rows, so this loop staying sequential is fine.
  const nameByPlatformId = new Map(entries.map((e) => [e.row.platformCampaignId, e.row.campaignName]))
  for (const platformId of distinctPlatformIds) {
    if (idsByPlatformId.has(platformId)) continue
    const newId = await findOrCreateCampaign({
      clientId,
      platform,
      platformCampaignId: platformId,
      displayName: nameByPlatformId.get(platformId) || platformId,
    })
    idsByPlatformId.set(platformId, [newId])
  }

  const campaignIds: string[] = []
  const weekStartings: string[] = []
  const spendAmounts: number[] = []
  for (const { weekStarting, row } of entries) {
    for (const internalId of idsByPlatformId.get(row.platformCampaignId) || []) {
      campaignIds.push(internalId)
      weekStartings.push(weekStarting)
      spendAmounts.push(row.spend)
      result.campaignsMatched++
    }
  }

  // Chunked multi-row upsert via UNNEST — one round trip per chunk instead
  // of one per row. 2000 rows/chunk keeps well under typical parameter/
  // payload limits while still cutting a ~6,000-row backfill down to a
  // handful of queries instead of ~6,000.
  const CHUNK = 2000
  for (let i = 0; i < campaignIds.length; i += CHUNK) {
    const idsSlice = campaignIds.slice(i, i + CHUNK)
    await query(
      `INSERT INTO ad_spend_weekly (campaign_id, week_starting, spend_amount, source, synced_at)
       SELECT campaign_id, week_starting, spend_amount, source, now()
       FROM UNNEST($1::uuid[], $2::date[], $3::numeric[], $4::text[])
       AS t(campaign_id, week_starting, spend_amount, source)
       ON CONFLICT (campaign_id, week_starting)
       DO UPDATE SET spend_amount = EXCLUDED.spend_amount, source = EXCLUDED.source, synced_at = now()`,
      [
        idsSlice,
        weekStartings.slice(i, i + CHUNK),
        spendAmounts.slice(i, i + CHUNK),
        idsSlice.map(() => source),
      ]
    )
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
      results.push(await applySpendBulk(client.id, 'meta', spend.map((row) => ({ weekStarting, row }))))
    }
    if (client.google_ads_customer_id) {
      const spend = await fetchGoogleCampaignSpend({ customerId: client.google_ads_customer_id, since, until })
      results.push(await applySpendBulk(client.id, 'google', spend.map((row) => ({ weekStarting, row }))))
    }
  }

  return results
}

// Backfills historical spend for every client with a connected Meta ad
// account, covering the `weeksBack` weeks up to and including the current
// one. syncAdSpend() only ever looks at "this week," so an account that's
// been running (or paused) for months has months of real spend sitting in
// Meta that the regular sync has never once asked for — this is the
// one-time (or occasionally re-run) catch-up for that. Google Ads backfill
// isn't implemented here since fetchGoogleCampaignSpend doesn't yet support
// a ranged/bucketed query the way the Meta Insights endpoint does.
export async function backfillMetaAdSpend(weeksBack: number, forDate: Date = new Date()): Promise<SyncResult[]> {
  const currentWeekMonday = mondayOf(forDate)
  const since = addDays(currentWeekMonday, -7 * (weeksBack - 1))
  const until = addDays(currentWeekMonday, 6)

  const clients = await query<{ id: string; meta_ad_account_id: string | null }>(
    `SELECT id, meta_ad_account_id FROM clients WHERE meta_ad_account_id IS NOT NULL`
  )

  const results: SyncResult[] = []

  for (const client of clients) {
    if (!client.meta_ad_account_id) continue
    const weeklyRows = await fetchMetaCampaignSpendRange({ adAccountId: client.meta_ad_account_id, since, until })

    const entries = weeklyRows.map((row) => ({
      weekStarting: row.weekStarting,
      row: { platformCampaignId: row.platformCampaignId, campaignName: row.campaignName, spend: row.spend },
    }))

    results.push(await applySpendBulk(client.id, 'meta', entries))
  }

  return results
}
