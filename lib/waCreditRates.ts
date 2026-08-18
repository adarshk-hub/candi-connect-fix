// Fixed internal rates for the WCC wallet — deliberately NOT tied to
// Meta's live per-conversation/per-message pricing. Edit the numbers
// below whenever you want to change what a message "costs" in credits;
// nothing else in the wallet code needs to change.
//
// Categories map 1:1 to Meta's template categories (MARKETING / UTILITY /
// AUTHENTICATION, lowercased) plus one extra bucket, "session", for
// free-form text replies sent inside an open 24hr customer-service window
// (lib/metaWhatsapp.ts -> sendTextMessage). Media (image/video/document)
// sent as part of a template's HEADER component is billed at the same
// rate as that template's category — there's no separate "media" rate
// since it's still one template send, just with a richer header.
export type WaMessageCategory = 'marketing' | 'utility' | 'authentication' | 'session'

export const WA_CREDIT_RATES: Record<WaMessageCategory, number> = {
  marketing: 0.88,
  utility: 0.35,
  authentication: 0.35,
  // Free — Meta itself doesn't charge for a free-form reply sent inside a
  // window the *user* opened (a "service" conversation on Meta's side),
  // so there's no real cost here to pass through. Only template sends
  // (marketing/utility/authentication) that proactively open or restart
  // a conversation are billed by Meta and carry a rate above.
  session: 0,
}


export const DEFAULT_MESSAGE_CATEGORY: WaMessageCategory = 'utility'

export function getRateForCategory(category: string | null | undefined): number {
  const key = (category || '').toLowerCase() as WaMessageCategory
  return WA_CREDIT_RATES[key] ?? WA_CREDIT_RATES[DEFAULT_MESSAGE_CATEGORY]
}

// The cut withheld on every Razorpay recharge before crediting WCC, e.g.
// a client paying ₹1500 with a 6.67% cut gets ₹1400 credited to their
// wallet balance (the remaining ₹100 is the platform's margin). Adjust
// this single constant to change the cut across all recharges.
export const RECHARGE_CUT_PERCENTAGE = 0.0667

// Preset "quick recharge" amounts shown as buttons in the wallet UI,
// starting low so a client can top up in small amounts if their balance
// (or their previous recharge) has run out.
export const RECHARGE_PRESETS = [100, 500, 1000, 5000] as const

export const MIN_RECHARGE_AMOUNT = 100
