export type ScoreTier = 'HOT LEAD' | 'WARM LEAD' | 'COLD LEAD'

export function tierFromScore(total: number): ScoreTier {
  if (total >= 6) return 'HOT LEAD'
  if (total >= 3) return 'WARM LEAD'
  return 'COLD LEAD'
}

export function tierCaption(tier: ScoreTier): string {
  switch (tier) {
    case 'HOT LEAD':
      return 'Call within 15 minutes'
    case 'WARM LEAD':
      return 'Call within 2 hours'
    case 'COLD LEAD':
      return 'Follow up within 24 hours'
  }
}

export const TIER_COLOR: Record<ScoreTier, string> = {
  'HOT LEAD': '#34d399',
  'WARM LEAD': '#fbbf24',
  'COLD LEAD': '#9ca3af',
}

export function maxAllowedLabel(maxMinutes: number | null): string {
  if (maxMinutes === null) return 'no SLA'
  if (maxMinutes < 60) return `${maxMinutes}min`
  if (maxMinutes % (24 * 60) === 0) return `${maxMinutes / (24 * 60)}d`
  return `${Math.round(maxMinutes / 60)}hr`
}
