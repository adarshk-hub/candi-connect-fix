import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { creditRecharge } from '@/lib/waWallet'

// Server-to-server backup for wallet recharges. The primary path is the
// browser's POST /api/clients/[id]/wallet/verify, called from Razorpay
// checkout's success handler — but if the person closes the tab right
// after paying (before that handler runs), Razorpay still has the money
// and the wallet would otherwise never be credited. This webhook covers
// that gap: Razorpay calls it independently of the browser whenever a
// payment is captured, so the wallet gets credited either way.
//
// creditRecharge() is idempotent on razorpay_payment_id (see
// lib/waWallet.ts), so it's safe for both this webhook and the browser
// callback to fire for the same payment — only the first one to land
// actually credits the balance.
//
// Set up in Razorpay Dashboard > Settings > Webhooks:
//   URL: https://<your-domain>/api/webhooks/razorpay
//   Active events: payment.captured
//   Secret: put the same value in RAZORPAY_WEBHOOK_SECRET below.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature')

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set — rejecting all webhook calls')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  if (expectedSignature !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  // Only wallet-recharge payments carry these notes (set in
  // POST /wallet/recharge when the order was created) — anything else
  // hitting this same Razorpay account/webhook is ignored rather than
  // erroring, so this endpoint stays safe to reuse for other payment
  // flows later without conflicts.
  if (payload.event !== 'payment.captured') {
    return NextResponse.json({ ok: true, ignored: payload.event })
  }

  const payment = payload.payload?.payment?.entity
  const clientId: string | undefined = payment?.notes?.clientId
  const purpose: string | undefined = payment?.notes?.purpose

  if (!payment || purpose !== 'wa_wallet_recharge' || !clientId) {
    return NextResponse.json({ ok: true, ignored: 'not a wallet recharge payment' })
  }

  try {
    const result = await creditRecharge({
      clientId,
      grossAmount: Number(payment.amount) / 100, // paise -> rupees
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[razorpay-webhook] Failed to credit recharge', err)
    // Non-2xx tells Razorpay to retry this webhook later rather than
    // silently losing the credit if something transient failed (e.g. a
    // momentary DB outage).
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
