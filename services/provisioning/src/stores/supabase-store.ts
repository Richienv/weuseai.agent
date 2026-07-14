import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  IDataStore,
  Customer,
  Subscription,
  VPSInstanceRecord,
  CreateVPSInstanceInput,
  OpenRouterKeyRecord,
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
    // H4 (security audit, 2026-06-14): order + limit(1), NOT .maybeSingle().
    // .maybeSingle() throws PGRST116 the instant a customer has >1 active row,
    // which made BOTH spin-up idempotency AND tear-down crash with an opaque
    // error — an orphaned ~$5/mo VPS that could never be reaped + a customer
    // who could never re-spin. The partial unique index
    // vps_instances_one_active_per_customer (migration 20260614010000) now
    // prevents >1 active row, but reading the most-recent row is correct +
    // resilient regardless.
    const { data, error } = await this.client
      .from('vps_instances')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['provisioning', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    return ((data as VPSInstanceRecord[] | null)?.[0]) ?? null
  }

  async createVPSInstance(rec: CreateVPSInstanceInput): Promise<VPSInstanceRecord> {
    // Dual-write idcloudhost_vps_id during the deprecation window so any
    // legacy reader (dashboard, ad-hoc SQL) sees the same value.
    const insertable =
      rec.provider === 'idcloudhost'
        ? { ...rec, idcloudhost_vps_id: rec.vps_id }
        : rec
    const { data, error } = await this.client
      .from('vps_instances')
      .insert(insertable)
      .select()
      .single()
    if (error) throw error
    return data as VPSInstanceRecord
  }

  async updateVPSInstance(
    vpsId: string,
    patch: Partial<VPSInstanceRecord>,
  ): Promise<void> {
    const { error } = await this.client
      .from('vps_instances')
      .update(patch)
      .eq('vps_id', vpsId)
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

  async upsertOpenRouterKey(rec: OpenRouterKeyRecord): Promise<void> {
    const { error } = await this.client
      .from('customer_openrouter_keys')
      .upsert({
        customer_id: rec.customer_id,
        openrouter_key_hash: rec.openrouter_key_hash,
        credit_limit_usd_cents: rec.credit_limit_usd_cents,
        last_topped_up_at: rec.last_topped_up_at ?? null,
      })
    if (error) throw error
  }

  async getOpenRouterKey(customerId: string): Promise<OpenRouterKeyRecord | null> {
    const { data, error } = await this.client
      .from('customer_openrouter_keys')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (error) throw error
    return (data as OpenRouterKeyRecord | null) ?? null
  }
}
