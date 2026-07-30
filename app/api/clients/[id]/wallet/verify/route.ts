import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { creditRecharge } from '@/lib/waWallet'

// Verifies the Razorpay checkout callback's signature server-side
// (never trust amounts/order IDs coming straight from the browser) and,
// only if valid, credits the wallet net of the recharge cut. This is
// the only place a recharge actually touches wa_client_wallet.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = body || {}

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
    return NextResponse.json({ error: 'Missing payment details' }, { status: 400 })
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) {
    return NextResponse.json({ error: 'Razorpay is not configured on the server yet.' }, { status: 500 })
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (expectedSignature !== razorpay_signature) {
    return NextResponse.json({ error: 'Payment verification failed. Please contact support before retrying.' }, { status: 400 })
  }

  const grossAmount = Number(amount) / 100 // amount arrives in paise from the checkout callback

  const result = await creditRecharge({
    clientId: params.id,
    grossAmount,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
  })

  return NextResponse.json({ ok: true, ...result })
}
