// PostgREST snapshot fetcher.
//
// Hits the Supabase REST endpoint with the service-role key (`apikey` +
// `Authorization: Bearer …` headers, same convention as
// api/nightly-cleanup.ts). Returns a CustomerSnapshot the derive logic
// can chew on.
//
// Six round-trips in parallel — the customer/sub/invoice/vps/persona
// rows are tiny so this is cheap. Could batch with PostgREST `select=*`
// + foreign-table embedding later; not worth the schema-coupling now.
//
// Tests in tests/fetch.spec.ts inject a stub `fetchImpl` to validate
// the URL composition + header set without hitting the network.

import type { CustomerSnapshot } from './types.ts'

export interface FetchSnapshotEnv {
  supabaseUrl: string
  supabaseServiceKey: string
  /**
   * Optional — defaults to `globalThis.fetch`. Tests inject a stub.
   */
  fetchImpl?: typeof fetch
}

interface DbCustomer {
  id: string
  email: string
  display_name: string | null
  telegram_chat_id: string | null
  telegram_bot_token: string | null
  soul_md_text: string | null
  bundle_versions: Record<string, string> | null
  bundle_update_policy: 'pin' | 'latest' | 'staged'
  pairing_code: string | null
  pairing_code_expires_at: string | null
  created_at: string
}

interface DbSubscription {
  id: string
  tier: 'starter' | 'pro' | 'studio' | null
  status: 'pending' | 'active' | 'paused' | 'canceled' | 'failed' | null
  always_on_enabled: boolean
  hosting_active: boolean
  started_at: string | null
  next_billing_at: string | null
}

interface DbInvoice {
  id: string
  status: 'pending' | 'paid' | 'expired' | 'failed' | null
  amount_idr: number
  paid_at: string | null
  created_at: string
  kind: string
}

interface DbVps {
  id: string
  status: 'provisioning' | 'running' | 'stopped' | 'failed' | null
  ip_address: string | null
  region: string | null
  created_at: string
}

interface DbBundlePull {
  agent_slug: string
  version_requested: string | null
  version_installed: string | null
  status:
    | 'success'
    | 'failed'
    | 'timeout'
    | 'permission_denied'
    | 'storage_unavailable'
  error_detail: string | null
  attempted_at: string
}

interface DbUsageLogRow {
  created_at: string
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function fetchCustomerSnapshot(
  customerId: string,
  env: FetchSnapshotEnv,
): Promise<CustomerSnapshot> {
  if (!isUuidLike(customerId)) {
    throw new Error(`fetchCustomerSnapshot: invalid customer id "${customerId}"`)
  }
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error(
      'fetchCustomerSnapshot: SUPABASE_URL and SUPABASE_SECRET_KEY must be set',
    )
  }
  const f = env.fetchImpl ?? globalThis.fetch
  const headers = {
    apikey: env.supabaseServiceKey,
    Authorization: `Bearer ${env.supabaseServiceKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const base = env.supabaseUrl.replace(/\/$/, '')
  const idEq = `eq.${customerId}`

  const customerUrl = `${base}/rest/v1/customers?id=${idEq}&select=id,email,display_name,telegram_chat_id,telegram_bot_token,soul_md_text,bundle_versions,bundle_update_policy,pairing_code,pairing_code_expires_at,created_at`
  const subscriptionUrl = `${base}/rest/v1/subscriptions?customer_id=${idEq}&select=id,tier,status,always_on_enabled,hosting_active,started_at,next_billing_at&order=started_at.desc&limit=1`
  const invoiceUrl = `${base}/rest/v1/subscription_invoices?customer_id=${idEq}&kind=eq.setup_first_month&select=id,status,amount_idr,paid_at,created_at,kind&order=created_at.desc&limit=1`
  const vpsUrl = `${base}/rest/v1/vps_instances?customer_id=${idEq}&select=id,status,ip_address,region,created_at&order=created_at.desc&limit=1`
  const bundleUrl = `${base}/rest/v1/bundle_pull_attempts?customer_id=${idEq}&select=agent_slug,version_requested,version_installed,status,error_detail,attempted_at&order=attempted_at.desc&limit=200`
  // usage_log: most recent 1 row OR a count for 7d.
  const recentMessagesUrl = `${base}/rest/v1/usage_log?customer_id=${idEq}&select=created_at&order=created_at.desc&limit=200`

  const [
    customerRows,
    subscriptionRows,
    invoiceRows,
    vpsRows,
    bundleRows,
    usageRows,
  ] = await Promise.all([
    fetchJson<DbCustomer[]>(f, customerUrl, headers, 'customers'),
    fetchJson<DbSubscription[]>(f, subscriptionUrl, headers, 'subscriptions'),
    fetchJson<DbInvoice[]>(f, invoiceUrl, headers, 'subscription_invoices'),
    fetchJson<DbVps[]>(f, vpsUrl, headers, 'vps_instances'),
    fetchJson<DbBundlePull[]>(f, bundleUrl, headers, 'bundle_pull_attempts'),
    fetchJson<DbUsageLogRow[]>(f, recentMessagesUrl, headers, 'usage_log'),
  ])

  const customer = customerRows[0]
    ? {
        id: customerRows[0].id,
        email: customerRows[0].email,
        display_name: customerRows[0].display_name,
        telegram_chat_id: customerRows[0].telegram_chat_id,
        telegram_bot_token: customerRows[0].telegram_bot_token,
        soul_md_text: customerRows[0].soul_md_text,
        bundle_versions: customerRows[0].bundle_versions ?? {},
        bundle_update_policy: customerRows[0].bundle_update_policy,
        pairing_code: customerRows[0].pairing_code,
        pairing_code_expires_at: customerRows[0].pairing_code_expires_at,
        created_at: customerRows[0].created_at,
      }
    : null

  const subscription = subscriptionRows[0]
    ? { ...subscriptionRows[0] }
    : null

  const setupInvoice = invoiceRows[0]
    ? {
        id: invoiceRows[0].id,
        status: invoiceRows[0].status,
        amount_idr: invoiceRows[0].amount_idr,
        paid_at: invoiceRows[0].paid_at,
        created_at: invoiceRows[0].created_at,
      }
    : null

  const vps = vpsRows[0] ? { ...vpsRows[0] } : null

  // Compute first-message + 7-day count from usage_log rows. The DESC
  // order means [0] = most recent, [last] = oldest; "first message" is
  // the oldest row we have.
  let firstMessageAt: string | null = null
  let recentMessageCount = 0
  if (usageRows.length > 0) {
    firstMessageAt = usageRows[usageRows.length - 1].created_at
    const cutoff = Date.now() - SEVEN_DAYS_MS
    recentMessageCount = usageRows.filter(
      (r) => Date.parse(r.created_at) >= cutoff,
    ).length
  }

  return {
    customer,
    subscription,
    setupInvoice,
    vps,
    bundlePulls: bundleRows.map((p) => ({ ...p })),
    firstMessageAt,
    recentMessageCount,
  }
}

async function fetchJson<T>(
  f: typeof fetch,
  url: string,
  headers: Record<string, string>,
  tableLabel: string,
): Promise<T> {
  const r = await f(url, { headers })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(
      `fetchCustomerSnapshot[${tableLabel}] HTTP ${r.status}: ${body.slice(0, 200)}`,
    )
  }
  return (await r.json()) as T
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuidLike(s: string): boolean {
  return UUID_RE.test(s)
}
