// Client-safe nurture-sequence step definitions — no server-only imports
// (db/query, Aisensy client) so this can be imported from both server code
// (lib/waSequenceEngine.ts) and client components (WhatsAppTab) without
// pulling `pg` into the browser bundle.
export const NURTURE_STEPS = [
  { day: 0, templateName: 'nurture_day0', label: 'Day 0 — Welcome' },
  { day: 2, templateName: 'nurture_day2', label: 'Day 2 — Check-in' },
  { day: 4, templateName: 'nurture_day4', label: 'Day 4 — Value share' },
  { day: 7, templateName: 'nurture_day7', label: 'Day 7 — Social proof' },
  { day: 10, templateName: 'nurture_day10', label: 'Day 10 — Final nudge' },
] as const

export type NurtureDay = (typeof NURTURE_STEPS)[number]['day']

export function nextStep(currentDay: number | null) {
  if (currentDay === null) return NURTURE_STEPS[0]
  const idx = NURTURE_STEPS.findIndex((s) => s.day === currentDay)
  return idx >= 0 && idx < NURTURE_STEPS.length - 1 ? NURTURE_STEPS[idx + 1] : null
}
