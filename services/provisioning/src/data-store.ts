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

export type VPSInstanceRecord = {
  id: string
  customer_id: string
  idcloudhost_vps_id: string
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
  updateVPSInstance(idcloudhostVpsId: string, patch: Partial<VPSInstanceRecord>): Promise<void>

  getBalance(customerId: string): Promise<number>
  decrementCredits(customerId: string, cents: number): Promise<number>
}
