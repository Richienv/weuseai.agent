/**
 * IDataStore — port untuk persistence (subset Supabase yang dipakai provisioning + proxy).
 *
 * Adapter implementations:
 * - stores/mock-store.ts (in-memory)
 * - stores/supabase-store.ts (real)
 */

export type Tier = 'starter' | 'pro'

export type Customer = {
  id: string
  email: string
  telegram_chat_id?: string | null
  display_name?: string | null
}

export type Subscription = {
  id: string
  customer_id: string
  tier: Tier
  xendit_subscription_id?: string | null
  status: 'active' | 'paused' | 'canceled'
}

// Vultr-migration cascade 2026-05-11: 'vultr' + 'digitalocean' added.
// 'idcloudhost' retained for grandfathered customers (Renita + e282ce25)
// per docs/research/2026-05-11-vultr-migration-validation.md §5 hybrid
// strategy. New customers route to 'vultr' (with DO failover) once Step
// 2 cutover flips the VPS_PROVIDER Fly secret.
export type VPSProvider = 'idcloudhost' | 'vultr' | 'digitalocean' | 'mock'

export type VPSInstanceRecord = {
  id: string
  customer_id: string
  /** Provider-agnostic VPS identifier (use this in new code). */
  vps_id: string
  /** Which provider issued vps_id. */
  provider: VPSProvider
  /**
   * @deprecated 2026-05-02 — kept for back-compat with historical rows
   * inserted before the provider-agnostic migration. New code populates
   * `vps_id` + `provider` instead. Will be dropped in Phase 3.
   */
  idcloudhost_vps_id?: string | null
  ip_address?: string | null
  region?: string | null
  status: 'provisioning' | 'running' | 'stopped' | 'failed'
}

export type CreateVPSInstanceInput = Omit<VPSInstanceRecord, 'id'>

export type OpenRouterKeyRecord = {
  customer_id: string
  /** OpenRouter `hash` field. NOT the secret key. */
  openrouter_key_hash: string
  credit_limit_usd_cents: number
  created_at?: string
  last_topped_up_at?: string | null
}

export interface IDataStore {
  getCustomer(id: string): Promise<Customer | null>

  createSubscription(rec: Omit<Subscription, 'id'>): Promise<Subscription>

  findActiveVPSByCustomer(customerId: string): Promise<VPSInstanceRecord | null>
  createVPSInstance(rec: CreateVPSInstanceInput): Promise<VPSInstanceRecord>
  /** Look up by the provider-agnostic vps_id. */
  updateVPSInstance(vpsId: string, patch: Partial<VPSInstanceRecord>): Promise<void>

  getBalance(customerId: string): Promise<number>
  decrementCredits(customerId: string, cents: number): Promise<number>

  // ─── Phase 2A: per-customer OpenRouter key tracking ──────────────────
  /** Insert a customer_openrouter_keys row. Idempotent on customer_id. */
  upsertOpenRouterKey(rec: OpenRouterKeyRecord): Promise<void>
  /** Get the persisted hash + cap for a customer (or null). */
  getOpenRouterKey(customerId: string): Promise<OpenRouterKeyRecord | null>
}
