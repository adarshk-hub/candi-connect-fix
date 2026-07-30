'use client'

import { useEffect, useState } from 'react'
import { IndianRupee, RefreshCw, Wallet, AlertTriangle } from 'lucide-react'

interface CategoryUsage {
  category: string
  count: number
  totalCharged: number
}

interface WalletUsageSummary {
  since: string
  categories: CategoryUsage[]
  totalMessagesSent: number
  totalCharged: number
  totalRecharged: number
  totalCut: number
}

interface WalletTransaction {
  id: string
  type: 'recharge' | 'debit' | 'refund'
  grossAmount: number | null
  cutAmount: number | null
  messageCategory: string | null
  templateName: string | null
  amount: number
  balanceAfter: number
  createdAt: string
}

interface WalletData {
  balance: number
  summary: WalletUsageSummary
  transactions: WalletTransaction[]
}

const RECHARGE_PRESETS = [100, 500, 1000, 5000]

declare global {
  interface Window {
    Razorpay: any
  }
}

// Lazily loads Razorpay's checkout.js only once, right before it's
// actually needed, instead of on every page load.
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function WhatsAppWalletPanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const [recharging, setRecharging] = useState<number | null>(null)

  function loadWallet() {
    setLoading(true)
    fetch(`/api/clients/${clientId}/wallet`)
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error || 'Could not load wallet')
        }
        return r.json()
      })
      .then((d: WalletData) => setData(d))
      .catch((err: any) => setError(err?.message || 'Could not load wallet'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function recharge(amount: number) {
    if (!amount || amount < 100) {
      setError('Minimum recharge amount is ₹100.')
      return
    }
    setRecharging(amount)
    setError('')
    setStatus('')
    try {
      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) {
        setError('Could not load Razorpay checkout. Check your connection and try again.')
        return
      }

      const orderRes = await fetch(`/api/clients/${clientId}/wallet/recharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const order = await orderRes.json().catch(() => ({}))
      if (!orderRes.ok) {
        setError(order.error || 'Could not start the recharge.')
        return
      }

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'WhatsApp Conversation Credits',
        description: `Recharge WCC wallet — ₹${amount}`,
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch(`/api/clients/${clientId}/wallet/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amount: order.amount,
              }),
            })
            const verified = await verifyRes.json().catch(() => ({}))
            if (!verifyRes.ok) {
              setError(verified.error || 'Payment succeeded but verification failed. Contact support.')
              return
            }
            setStatus(`₹${verified.netAmount.toFixed(2)} credited to your wallet (₹${verified.cutAmount.toFixed(2)} platform fee withheld from your ₹${verified.grossAmount.toFixed(2)} payment).`)
            loadWallet()
          } catch (err: any) {
            setError(err?.message || 'Payment succeeded but verification failed. Contact support.')
          }
        },
        modal: {
          ondismiss: () => setRecharging(null),
        },
        theme: { color: '#16a34a' },
      })
      razorpay.open()
    } catch (err: any) {
      setError(err?.message || 'Could not start the recharge.')
    } finally {
      setRecharging(null)
    }
  }

  if (loading) return <p className="text-muted">Loading wallet…</p>

  const balance = data?.balance ?? 0
  const outOfCredits = balance <= 0

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
          <Wallet size={18} /> WhatsApp Conversation Credits (WCC)
        </h2>
        <button
          onClick={loadWallet}
          className="flex items-center gap-2 rounded-md border border-border bg-card2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-card"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <p className="mb-4 text-sm text-muted2">
        A prepaid wallet — every marketing, utility, authentication, broadcast, or media message sent debits this
        balance at a fixed rate. Not connected to Meta's own billing; this is purely internal.
      </p>

      <div className="flex items-center justify-between rounded-md border border-border bg-card2 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted">
            <IndianRupee size={18} />
          </div>
          <div>
            <p className="text-xs text-muted">Current balance</p>
            <p className="text-xl font-bold text-fg">₹ {balance.toFixed(2)}</p>
          </div>
        </div>
        {outOfCredits && (
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
            <AlertTriangle size={13} /> Out of credits
          </span>
        )}
      </div>

      {outOfCredits && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          No messages will send until this wallet is recharged — nurture sequences, operational reminders, and
          manual replies will all be blocked and asked to recharge.
        </p>
      )}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted">Recharge</p>
        <div className="flex flex-wrap gap-2">
          {RECHARGE_PRESETS.map((amt) => (
            <button
              key={amt}
              onClick={() => recharge(amt)}
              disabled={recharging !== null}
              className="rounded-md border border-border bg-card2 px-4 py-2 text-sm font-medium text-fg hover:bg-card disabled:opacity-50"
            >
              {recharging === amt ? 'Opening…' : `+ ₹${amt}`}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={100}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Custom amount (min ₹100)"
            className="w-48 rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
          />
          <button
            onClick={() => recharge(Number(customAmount))}
            disabled={recharging !== null || !customAmount}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            {recharging !== null && recharging === Number(customAmount) ? 'Opening…' : 'Purchase Now'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {status && <p className="mt-4 text-sm text-green-400">{status}</p>}

      {data && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-1 text-sm font-semibold text-fg">Last 30 Days</h3>
          <p className="mb-3 text-xs text-muted2">
            {data.summary.totalMessagesSent.toLocaleString()} messages sent, ₹{data.summary.totalCharged.toFixed(2)}{' '}
            charged. ₹{data.summary.totalRecharged.toFixed(2)} recharged (₹{data.summary.totalCut.toFixed(2)}{' '}
            platform fee withheld).
          </p>

          {data.summary.categories.length === 0 ? (
            <p className="text-sm text-muted">No messages sent in the last 30 days.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Message type</th>
                  <th className="pb-2 font-medium">Sent</th>
                  <th className="pb-2 font-medium">Charged</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.categories.map((c) => (
                  <tr key={c.category} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-2 text-xs capitalize text-fg">{c.category}</td>
                    <td className="py-2 pr-2 text-xs text-muted2">{c.count.toLocaleString()}</td>
                    <td className="py-2 text-xs text-muted2">₹ {c.totalCharged.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {data.transactions.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-fg">Recent Transactions</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Detail</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-2 text-xs text-muted2">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-2 text-xs capitalize text-fg">{t.type}</td>
                      <td className="py-2 pr-2 text-xs text-muted2">
                        {t.type === 'recharge'
                          ? `₹${t.grossAmount?.toFixed(2)} paid, ₹${t.cutAmount?.toFixed(2)} fee`
                          : t.templateName || t.messageCategory || '—'}
                      </td>
                      <td className={`py-2 pr-2 text-xs ${t.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {t.amount >= 0 ? '+' : ''}
                        {t.amount.toFixed(2)}
                      </td>
                      <td className="py-2 text-xs text-muted2">₹ {t.balanceAfter.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
