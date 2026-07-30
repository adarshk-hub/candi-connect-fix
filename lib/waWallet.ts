import { query } from './db'
import { getRateForCategory, RECHARGE_CUT_PERCENTAGE, WaMessageCategory } from './waCreditRates'

export interface WalletDebitResult {
  ok: boolean
  balanceAfter?: number
  charged?: number
  error?: string
}

// Ensures a wallet row exists for a client (idempotent) and returns the
// current balance. Every client implicitly starts at ₹0 — no free trial
// balance — so sends are blocked until a recharge happens.
export async function getOrCreateWallet(clientId: string): Promise<number> {
  const row = (
    await query<{ balance: string }>(
      `INSERT INTO wa_client_wallet (client_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (client_id) DO NOTHING
       RETURNING balance`,
      [clientId]
    )
  )[0]
  if (row) return Number(row.balance)

  const existing = (
    await query<{ balance: string }>('SELECT balance FROM wa_client_wallet WHERE client_id = $1', [clientId])
  )[0]
  return existing ? Number(existing.balance) : 0
}

export async function getWalletBalance(clientId: string): Promise<number> {
  const row = (
    await query<{ balance: string }>('SELECT balance FROM wa_client_wallet WHERE client_id = $1', [clientId])
  )[0]
  return row ? Number(row.balance) : 0
}

// Atomically debits the wallet for one successfully-sent message. Uses a
// single conditional UPDATE (balance >= cost) so two concurrent sends
// can never push the balance negative — if the balance has already run
// out (including mid-race with another send), this returns ok:false and
// the caller must not treat the message as sent/billed.
export async function debitForMessage(params: {
  clientId: string
  category: WaMessageCategory | string
  templateName?: string
  wamid?: string
}): Promise<WalletDebitResult> {
  await getOrCreateWallet(params.clientId)
  const cost = getRateForCategory(params.category)

  const updated = (
    await query<{ balance: string }>(
      `UPDATE wa_client_wallet
         SET balance = balance - $2, updated_at = now()
       WHERE client_id = $1 AND balance >= $2
       RETURNING balance`,
      [params.clientId, cost]
    )
  )[0]

  if (!updated) {
    return { ok: false, error: 'Insufficient WhatsApp credits. Please recharge your wallet to keep sending messages.' }
  }

  const balanceAfter = Number(updated.balance)
  await query(
    `INSERT INTO wa_wallet_transactions
       (client_id, type, message_category, template_name, wamid, amount, balance_after)
     VALUES ($1, 'debit', $2, $3, $4, $5, $6)`,
    [params.clientId, params.category, params.templateName || null, params.wamid || null, -cost, balanceAfter]
  )

  return { ok: true, balanceAfter, charged: cost }
}

// Refunds a message's cost if it was pre-debited but Meta's send API
// then rejected it (so the client isn't charged for a message that
// never actually went out).
export async function refundMessage(params: {
  clientId: string
  category: WaMessageCategory | string
  templateName?: string
}): Promise<void> {
  const cost = getRateForCategory(params.category)

  const updated = (
    await query<{ balance: string }>(
      `UPDATE wa_client_wallet
         SET balance = balance + $2, updated_at = now()
       WHERE client_id = $1
       RETURNING balance`,
      [params.clientId, cost]
    )
  )[0]
  if (!updated) return

  await query(
    `INSERT INTO wa_wallet_transactions
       (client_id, type, message_category, template_name, amount, balance_after)
     VALUES ($1, 'refund', $2, $3, $4, $5)`,
    [params.clientId, params.category, params.templateName || null, cost, Number(updated.balance)]
  )
}

// Attaches the Meta wamid to the most recent matching debit row once a
// send succeeds, purely for traceability in the transaction ledger —
// best-effort, never blocks or throws on the caller.
export async function attachWamidToLatestDebit(params: {
  clientId: string
  templateName: string
  wamid: string
}): Promise<void> {
  try {
    await query(
      `UPDATE wa_wallet_transactions
         SET wamid = $1
       WHERE id = (
         SELECT id FROM wa_wallet_transactions
         WHERE client_id = $2 AND template_name = $3 AND wamid IS NULL AND type = 'debit'
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [params.wamid, params.clientId, params.templateName]
    )
  } catch {
    // Non-critical — the debit itself already succeeded and was logged.
  }
}

export interface RechargeResult {
  balanceAfter: number
  grossAmount: number
  cutAmount: number
  netAmount: number
}

// Looks up a recharge transaction by Razorpay payment id, if one was
// already recorded — used to make creditRecharge idempotent when both
// the browser's POST /wallet/verify callback and the Razorpay webhook
// (app/api/webhooks/razorpay) try to credit the same payment.
async function findRechargeByPaymentId(razorpayPaymentId: string): Promise<RechargeResult | null> {
  const row = (
    await query<{ gross_amount: string; cut_amount: string; amount: string; balance_after: string }>(
      `SELECT gross_amount, cut_amount, amount, balance_after
       FROM wa_wallet_transactions
       WHERE type = 'recharge' AND razorpay_payment_id = $1
       LIMIT 1`,
      [razorpayPaymentId]
    )
  )[0]
  if (!row) return null
  return {
    balanceAfter: Number(row.balance_after),
    grossAmount: Number(row.gross_amount),
    cutAmount: Number(row.cut_amount),
    netAmount: Number(row.amount),
  }
}

// Credits a Razorpay recharge to the wallet, withholding the platform
// cut (see RECHARGE_CUT_PERCENTAGE) before crediting the rest. Called
// only after the Razorpay payment signature has been verified — either
// by POST /wallet/verify (browser callback) or the Razorpay webhook
// (server-to-server backup for when the browser callback never fires,
// e.g. the tab closes right after payment). Idempotent: calling this
// twice for the same razorpayPaymentId credits the wallet only once —
// the second call just returns the original result.
export async function creditRecharge(params: {
  clientId: string
  grossAmount: number
  razorpayOrderId: string
  razorpayPaymentId: string
}): Promise<RechargeResult> {
  const existing = await findRechargeByPaymentId(params.razorpayPaymentId)
  if (existing) return existing

  await getOrCreateWallet(params.clientId)

  const cutAmount = Math.round(params.grossAmount * RECHARGE_CUT_PERCENTAGE * 100) / 100
  const netAmount = Math.round((params.grossAmount - cutAmount) * 100) / 100

  const updated = (
    await query<{ balance: string }>(
      `UPDATE wa_client_wallet
         SET balance = balance + $2, updated_at = now()
       WHERE client_id = $1
       RETURNING balance`,
      [params.clientId, netAmount]
    )
  )[0]

  const balanceAfter = Number(updated.balance)

  try {
    await query(
      `INSERT INTO wa_wallet_transactions
         (client_id, type, gross_amount, cut_amount, razorpay_order_id, razorpay_payment_id, amount, balance_after)
       VALUES ($1, 'recharge', $2, $3, $4, $5, $6, $7)`,
      [params.clientId, params.grossAmount, cutAmount, params.razorpayOrderId, params.razorpayPaymentId, netAmount, balanceAfter]
    )
  } catch (err: any) {
    // Unique-violation on razorpay_payment_id means the webhook and the
    // browser callback raced each other and both reached this point —
    // the balance update above already double-applied, so undo it and
    // return whichever row actually won the race.
    if (err?.code === '23505') {
      await query(
        `UPDATE wa_client_wallet SET balance = balance - $2, updated_at = now() WHERE client_id = $1`,
        [params.clientId, netAmount]
      )
      const winner = await findRechargeByPaymentId(params.razorpayPaymentId)
      if (winner) return winner
    }
    throw err
  }

  return { balanceAfter, grossAmount: params.grossAmount, cutAmount, netAmount }
}

export interface WalletTransactionRow {
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

export async function getRecentTransactions(clientId: string, limit = 50): Promise<WalletTransactionRow[]> {
  const rows = await query<any>(
    `SELECT id, type, gross_amount, cut_amount, message_category, template_name, amount, balance_after, created_at
     FROM wa_wallet_transactions
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [clientId, limit]
  )
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    grossAmount: r.gross_amount !== null ? Number(r.gross_amount) : null,
    cutAmount: r.cut_amount !== null ? Number(r.cut_amount) : null,
    messageCategory: r.message_category,
    templateName: r.template_name,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    createdAt: r.created_at,
  }))
}

export interface CategoryUsage {
  category: string
  count: number
  totalCharged: number
}

export interface WalletUsageSummary {
  since: string
  categories: CategoryUsage[]
  totalMessagesSent: number
  totalCharged: number
  totalRecharged: number
  totalCut: number
}

// Powers the "last 30 days" view: how many template messages went out
// per category and what they cost, plus how much was topped up and how
// much of that was the platform's cut.
export async function getLast30DaysSummary(clientId: string): Promise<WalletUsageSummary> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)

  const debitRows = await query<{ category: string; count: string; total: string }>(
    `SELECT message_category AS category, COUNT(*) AS count, SUM(-amount) AS total
     FROM wa_wallet_transactions
     WHERE client_id = $1 AND type = 'debit' AND created_at >= $2
     GROUP BY message_category
     ORDER BY total DESC`,
    [clientId, since]
  )

  const rechargeRow = (
    await query<{ gross: string; cut: string }>(
      `SELECT COALESCE(SUM(gross_amount), 0) AS gross, COALESCE(SUM(cut_amount), 0) AS cut
       FROM wa_wallet_transactions
       WHERE client_id = $1 AND type = 'recharge' AND created_at >= $2`,
      [clientId, since]
    )
  )[0]

  const categories: CategoryUsage[] = debitRows.map((r) => ({
    category: r.category || 'unknown',
    count: Number(r.count),
    totalCharged: Number(r.total),
  }))

  return {
    since: since.toISOString(),
    categories,
    totalMessagesSent: categories.reduce((sum, c) => sum + c.count, 0),
    totalCharged: categories.reduce((sum, c) => sum + c.totalCharged, 0),
    totalRecharged: Number(rechargeRow?.gross || 0),
    totalCut: Number(rechargeRow?.cut || 0),
  }
}
