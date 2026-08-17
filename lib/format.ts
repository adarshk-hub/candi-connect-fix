export function formatLakh(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1).replace(/\.0$/, '')}L`
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `₹${Math.round(amount)}`
}

export function formatDateTime(d: string | Date): string {
  const date = new Date(d)
  // timeZone must be explicit and hardcoded here — this app is India-only,
  // and without it, toLocaleString falls back to whatever timezone the
  // *runtime* happens to be in, not the locale. That's an easy trap:
  // 'en-IN' only controls formatting style (day/month order, etc.), not the
  // actual timezone conversion. A browser physically in India renders this
  // correctly by coincidence (its system clock is already IST), but the
  // exact same code running server-side on Vercel (UTC) is off by 5.5
  // hours — which is exactly the bug this fixes.
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

export function elapsedLabel(from: string | Date): string {
  const ms = Date.now() - new Date(from).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hr`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
