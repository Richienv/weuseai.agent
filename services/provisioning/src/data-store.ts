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

export type VPSProvider = 'idcloudhost' | 'mock'

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

export interface IDataStore {
  getCustomer(id: string): Promise<Customer | null>

  createSubscription(rec: Omit<Subscription, 'id'>): Promise<Subscription>

  findActiveVPSByCustomer(customerId: string): Promise<VPSInstanceRecord | null>
  createVPSInstance(rec: CreateVPSInstanceInput): Promise<VPSInstanceRecord>
  /** Look up by the provider-agnostic vps_id. */
  updateVPSInstance(vpsId: string, patch: Partial<VPSInstanceRecord>): Promise<void>

  getBalance(customerId: string): Promise<number>
  decrementCredits(customerId: string, cents: number): Promise<number>
}
