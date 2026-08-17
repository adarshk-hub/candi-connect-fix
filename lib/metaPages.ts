const GRAPH_API_URL = 'https://graph.facebook.com/v19.0'

export interface MetaPageOption {
  id: string
  name: string
}

// Lists every Facebook Page the connected token can currently see — same
// idea as fetchAccessibleMetaAdAccounts, just for Pages instead of ad
// accounts. Powers the Page picker in Settings so nobody has to go hunting
// for a numeric Page ID by hand (or leave the "demo-page-apex" placeholder
// in place, which silently breaks both live webhook routing and the Lead
// Ads historical backfill).
export async function fetchAccessibleMetaPages(): Promise<MetaPageOption[]> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    throw new Error('META_PAGE_ACCESS_TOKEN is not set on the server.')
  }

  const results: MetaPageOption[] = []
  let url: string | null = `${GRAPH_API_URL}/me/accounts?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`

  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || `Meta Graph API returned ${res.status}`)
    }
    const json: any = await res.json()
    for (const row of json.data || []) {
      results.push({ id: row.id, name: row.name || `Page ${row.id}` })
    }
    url = json.paging?.next || null
  }

  return results
}

// Exchanges the System User token (META_PAGE_ACCESS_TOKEN) for the specific
// Page's own Page Access Token. This is required, not optional — Meta
// rejects several Page-scoped endpoints (leadgen_forms and its /leads
// listing among them) with "(#190) This method must be called with a Page
// Access Token" if you pass a System User token directly, even when that
// System User has full leads_retrieval + pages_manage_ads permission on the
// Page. The fix is this one extra hop: /me/accounts, called with the System
// User token, returns each assigned Page's own access_token in the same
// response — no separate OAuth exchange needed, just asking for the right
// field.
export async function fetchPageAccessToken(pageId: string): Promise<string> {
  const systemUserToken = process.env.META_PAGE_ACCESS_TOKEN
  if (!systemUserToken) {
    throw new Error('META_PAGE_ACCESS_TOKEN is not set on the server.')
  }

  let url: string | null =
    `${GRAPH_API_URL}/me/accounts?fields=id,access_token&limit=200&access_token=${encodeURIComponent(systemUserToken)}`

  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message || `Meta Graph API returned ${res.status}`)
    }
    const json: any = await res.json()
    const match = (json.data || []).find((row: any) => row.id === pageId)
    if (match?.access_token) return match.access_token
    url = json.paging?.next || null
  }

  throw new Error(
    `No Page Access Token found for Page ${pageId} — the System User may not be assigned to this Page (Business Settings > Accounts > Pages > this Page > assign the System User).`
  )
}
