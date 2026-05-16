/**
 * In-memory fake of IOnboardingStore for handler tests.
 *
 * Mirrors the production Supabase shape closely enough to exercise
 * the handler's logic without touching a real DB. Tests can seed
 * customers + subscriptions, then assert on the post-state.
 */

import type {
  CustomerRow,
  IOnboardingStore,
  SubscriptionRow,
} from '../../supabase/functions/_shared/types.ts'

type AuditRow = { id: number; customer_id: string; soul_md_sha256: string }
type OpenRouterRow = {
  customer_id: string
  openrouter_key_hash: string
  credit_limit_usd_cents: number
}

export class FakeOnboardingStore implements IOnboardingStore {
  customers = new Map<string, CustomerRow>()
  subscriptions = new Map<string, SubscriptionRow>()
  audits: AuditRow[] = []
  openrouterKeys = new Map<string, OpenRouterRow>()
  /** Pair-flow Option A (2026-05-09): in-memory ciphertext store keyed by
   *  customer_id. Tests can assert encryption + decryption round-trips
   *  without invoking real pgcrypto. */
  botTokensCiphertext = new Map<string, string>()

  /** Throw on any DB call — useful for tests that assert no DB write. */
  throwOnInsertCustomerOpenRouterKey = false
  /** When true, getDecryptedBotToken throws (simulates RPC failure
   *  / encryption-key misconfiguration). */
  throwOnDecryptBotToken = false
  /** Wait-page race fix (2026-05-16): the status getActiveVPSStatus
   *  returns. Defaults to 'running' so pre-existing tests (which never
   *  seed a VPS) keep exercising the refreshEnv path unchanged. Tests
   *  of the deferral path call seedVPSStatus('provisioning'). */
  vpsStatus: 'provisioning' | 'running' | 'stopped' | 'failed' | null = 'running'
  /** When true, getActiveVPSStatus throws (simulates a status-read
   *  failure — the handler must defer, not crash). */
  throwOnGetActiveVPSStatus = false

  // ── seeders ─────────────────────────────────────────────────────

  seedCustomer(c: Partial<CustomerRow> & { id: string; email: string }): CustomerRow {
    const row: CustomerRow = {
      id: c.id,
      email: c.email,
      display_name: c.display_name ?? null,
      whatsapp_number: c.whatsapp_number ?? null,
      telegram_chat_id: c.telegram_chat_id ?? null,
      telegram_bot_username: c.telegram_bot_username ?? null,
      pairing_code: c.pairing_code ?? null,
      pairing_code_expires_at: c.pairing_code_expires_at ?? null,
      soul_md_text: c.soul_md_text ?? null,
    }
    this.customers.set(c.id, row)
    return row
  }

  seedSubscription(
    s: Partial<SubscriptionRow> & { id: string; customer_id: string; tier: SubscriptionRow['tier'] },
  ): SubscriptionRow {
    const row: SubscriptionRow = {
      id: s.id,
      customer_id: s.customer_id,
      tier: s.tier,
      status: s.status ?? 'pending_provision',
      xendit_invoice_id: s.xendit_invoice_id ?? null,
      always_on_enabled: s.always_on_enabled ?? false,
      hosting_active: s.hosting_active ?? false,
      next_billing_at: s.next_billing_at ?? null,
    }
    this.subscriptions.set(s.id, row)
    return row
  }

  /** Wait-page race fix (2026-05-16): set the status getActiveVPSStatus
   *  will return for this store. */
  seedVPSStatus(
    status: 'provisioning' | 'running' | 'stopped' | 'failed' | null,
  ): void {
    this.vpsStatus = status
  }

  // ── IOnboardingStore impl ───────────────────────────────────────

  async findCustomerById(id: string): Promise<CustomerRow | null> {
    return this.customers.get(id) ?? null
  }

  async findCustomerByPairingCode(code: string): Promise<CustomerRow | null> {
    for (const c of this.customers.values()) {
      if (c.pairing_code === code) return c
    }
    return null
  }

  async findActiveOrPendingSubscriptionByCustomer(
    customerId: string,
  ): Promise<SubscriptionRow | null> {
    for (const s of this.subscriptions.values()) {
      if (
        s.customer_id === customerId &&
        (s.status === 'active' || s.status === 'pending_provision' || s.status === 'pending')
      ) {
        return s
      }
    }
    return null
  }

  async updateCustomer(
    id: string,
    patch: Partial<Omit<CustomerRow, 'id' | 'email'>>,
  ): Promise<CustomerRow> {
    const existing = this.customers.get(id)
    if (!existing) throw new Error(`fake-store: customer ${id} not found`)
    const updated = { ...existing, ...patch }
    this.customers.set(id, updated)
    return updated
  }

  async updateSubscription(
    id: string,
    patch: Partial<SubscriptionRow>,
  ): Promise<SubscriptionRow> {
    const existing = this.subscriptions.get(id)
    if (!existing) throw new Error(`fake-store: subscription ${id} not found`)
    const updated = { ...existing, ...patch }
    this.subscriptions.set(id, updated)
    return updated
  }

  async insertPersonaAudit(input: {
    customer_id: string
    soul_md_sha256: string
  }): Promise<{ id: number }> {
    const row: AuditRow = {
      id: this.audits.length + 1,
      customer_id: input.customer_id,
      soul_md_sha256: input.soul_md_sha256,
    }
    this.audits.push(row)
    return { id: row.id }
  }

  async insertCustomerOpenRouterKey(input: {
    customer_id: string
    openrouter_key_hash: string
    credit_limit_usd_cents: number
  }): Promise<void> {
    if (this.throwOnInsertCustomerOpenRouterKey) {
      throw new Error('fake-store: simulated insert failure')
    }
    this.openrouterKeys.set(input.customer_id, { ...input })
  }

  // ── Per-customer bot (Pair-flow Option A, 2026-05-09) ────────────

  async setBotTokenAndUsername(
    customer_id: string,
    bot_token_plaintext: string,
    bot_username: string,
  ): Promise<void> {
    const existing = this.customers.get(customer_id)
    if (!existing) {
      throw new Error(
        `fake-store: customer ${customer_id} not found (setBotTokenAndUsername)`,
      )
    }
    // Reversible "encryption" so tests round-trip cleanly. Real
    // implementation uses pgcrypto's pgp_sym_encrypt.
    const ciphertext = `enc:${bot_token_plaintext}`
    this.botTokensCiphertext.set(customer_id, ciphertext)
    this.customers.set(customer_id, {
      ...existing,
      telegram_bot_username: bot_username,
    })
  }

  async getDecryptedBotToken(customer_id: string): Promise<string | null> {
    if (this.throwOnDecryptBotToken) {
      throw new Error('fake-store: simulated decrypt failure')
    }
    const ciphertext = this.botTokensCiphertext.get(customer_id)
    if (!ciphertext) return null
    return ciphertext.startsWith('enc:') ? ciphertext.slice(4) : null
  }

  async getActiveVPSStatus(
    _customer_id: string,
  ): Promise<'provisioning' | 'running' | 'stopped' | 'failed' | null> {
    if (this.throwOnGetActiveVPSStatus) {
      throw new Error('fake-store: simulated getActiveVPSStatus failure')
    }
    return this.vpsStatus
  }

  async clearBotPairing(customer_id: string): Promise<void> {
    // Mirror the production UPDATE: wipes ciphertext + telegram_bot_username
    // + telegram_chat_id. Idempotent.
    this.botTokensCiphertext.delete(customer_id)
    const existing = this.customers.get(customer_id)
    if (existing) {
      this.customers.set(customer_id, {
        ...existing,
        telegram_bot_username: null,
        telegram_chat_id: null,
      })
    }
  }
}
