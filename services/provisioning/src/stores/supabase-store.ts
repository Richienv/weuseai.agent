import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  IDataStore,
  Customer,
  Subscription,
  VPSInstanceRecord,
  CreateVPSInstanceInput,
} from '../data-store.js'

/** Supabase adapter. Reads creds from env unless explicitly passed. */
export class SupabaseDataStore implements IDataStore {
  private client: SupabaseClient

  constructor(opts: { url?: string; serviceRoleKey?: string; client?: SupabaseClient } = {}) {
    if (opts.client) {
      this.client = opts.client
      return
    }
    const url = opts.url ?? process.env.SUPABASE_URL
    const key = opts.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SupabaseDataStore: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    this.client = createClient(url, key)
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const { data, error } = await this.client
      .from('customers')
      .select('id, email, telegram_chat_id, display_name')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return (data as Customer | null) ?? null
  }

  async createSubscription(rec: Omit<Subscription, 'id'>): Promise<Subscription> {
    const { data, error } = await this.client
      .from('subscriptions')
      .insert(rec)
      .select()
      .single()
    if (error) throw error
    return data as Subscription
  }

  async findActiveVPSByCustomer(customerId: string): Promise<VPSInstanceRecord | null> {
    const { data, error } = await this.client
      .from('vps_instances')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['provisioning', 'running'])
      .maybeSingle()
    if (error) throw error
    return (data as VPSInstanceRecord | null) ?? null
  }

  async createVPSInstance(rec: CreateVPSInstanceInput): Promise<VPSInstanceRecord> {
    const { data, error } = await this.client
      .from('vps_instances')
      .insert(rec)
      .select()
      .single()
    if (error) throw error
    return data as VPSInstanceRecord
  }

  async updateVPSInstance(
    idcloudhostVpsId: string,
    patch: Partial<VPSInstanceRecord>,
  ): Promise<void> {
    const { error } = await this.client
      .from('vps_instances')
      .update(patch)
      .eq('idcloudhost_vps_id', idcloudhostVpsId)
    if (error) throw error
  }

  async getBalance(customerId: string): Promise<number> {
    const { data, error } = await this.client
      .from('credits')
      .select('balance_usd_cents')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (error) throw error
    return (data as { balance_usd_cents: number } | null)?.balance_usd_cents ?? 0
  }

  async decrementCredits(customerId: string, cents: number): Promise<number> {
    const { data, error } = await this.client.rpc('decrement_credits', {
      p_customer_id: customerId,
      p_cents: cents,
    })
    if (error) throw error
    return (data as number | null) ?? 0
  }
}
