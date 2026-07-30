import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canCustomize } from '@/lib/customizeAccess'
import { MIN_RECHARGE_AMOUNT } from '@/lib/waCreditRates'

// Creates a Razorpay order for the amount the client wants to add to
// their WCC wallet. Returns the order id + public key so the browser
// can open Razorpay's checkout widget; the wallet is only actually
// credited once POST /wallet/verify confirms the payment signature —
// creating an order here does not touch the wallet balance.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!canCustomize(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const amount = Number(body?.amount)

  if (!amount || amount < MIN_RECHARGE_AMOUNT) {
    return NextResponse.json({ error: `Minimum recharge amount is ₹${MIN_RECHARGE_AMOUNT}` }, { status: 400 })
  }

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    return NextResponse.json({ error: 'Razorpay is not configured on the server yet.' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay expects paise
        currency: 'INR',
        receipt: `wcc_${params.id}_${Date.now()}`,
        notes: { clientId: params.id, purpose: 'wa_wallet_recharge' },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.description || 'Could not create Razorpay order' }, { status: 502 })
    }

    return NextResponse.json({
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Network error contacting Razorpay' }, { status: 502 })
  }
}
