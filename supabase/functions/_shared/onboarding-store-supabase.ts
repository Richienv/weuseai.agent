// Supabase-backed IOnboardingStore for Edge Functions.
//
// Uses @supabase/supabase-js with the SERVICE_ROLE key (bypasses RLS for
// writes). Read-only paths from the customer's browser go through the
// anon key with the SELECT policy added in migration 20260506000000.
//
// Both complete-onboarding and telegram-bot-webhook entry files share this
// adapter so all DB ops go through the same shape.

// @ts-ignore — Deno-only import; not resolved during Node typecheck.
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

import type {
  CustomerRow,
  IOnboardingStore,
  SubscriptionRow,
} from './types.ts'

export function createOnboardingStore(opts: {
  supabaseUrl: string
  serviceRoleKey: string
}): IOnboardingStore {
  const supabase: SupabaseClient = createClient(
    opts.supabaseUrl,
    opts.serviceRoleKey,
  )

  return {
    async findCustomerById(id) {
      const { data } = await supabase
        .from('customers')
        .select(
          'id, email, display_name, whatsapp_number, telegram_chat_id, telegram_bot_username, pairing_code, pairing_code_expires_at, soul_md_text',
        )
        .eq('id', id)
        .maybeSingle()
      return (data as CustomerRow | null) ?? null
    },

    async findCustomerByPairingCode(code) {
      const { data } = await supabase
        .from('customers')
        .select(
          'id, email, display_name, whatsapp_number, telegram_chat_id, telegram_bot_username, pairing_code, pairing_code_expires_at, soul_md_text',
        )
        .eq('pairing_code', code)
        .maybeSingle()
      return (data as CustomerRow | null) ?? null
    },

    async findActiveOrPendingSubscriptionByCustomer(customerId) {
      // Most recent subscription for this customer in a "billable" state.
      // We accept pending too because xendit-webhook may not have flipped
      // it yet — but in practice the onboarding page only renders after
      // payment-success redirect, which means the webhook has already run
      // OR is racing this read.
      const { data } = await supabase
        .from('subscriptions')
        .select(
          'id, customer_id, tier, status, xendit_invoice_id, always_on_enabled, hosting_active, next_billing_at',
        )
        .eq('customer_id', customerId)
        .in('status', ['active', 'pending_provision', 'pending'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as SubscriptionRow | null) ?? null
    },

    async updateCustomer(id, patch) {
      const { data, error } = await supabase
        .from('customers')
        .update(patch)
        .eq('id', id)
        .select(
          'id, email, display_name, whatsapp_number, telegram_chat_id, telegram_bot_username, pairing_code, pairing_code_expires_at, soul_md_text',
        )
        .single()
      if (error) throw error
      return data as CustomerRow
    },

    async updateSubscription(id, patch) {
      const { data, error } = await supabase
        .from('subscriptions')
        .update(patch)
        .eq('id', id)
        .select(
          'id, customer_id, tier, status, xendit_invoice_id, always_on_enabled, hosting_active, next_billing_at',
        )
        .single()
      if (error) throw error
      return data as SubscriptionRow
    },

    async insertPersonaAudit(input) {
      const { data, error } = await supabase
        .from('customer_persona_audit')
        .insert(input)
        .select('id')
        .single()
      if (error) throw error
      return { id: data.id as number }
    },

    async insertCustomerOpenRouterKey(input) {
      // Upsert on customer_id (the table's primary key). Retries after a
      // partial failure (e.g. spinUp returned 5xx, rollback revoked the
      // OpenRouter key but the row stayed) need to overwrite the stale
      // hash, not collide with it.
      const { error } = await supabase
        .from('customer_openrouter_keys')
        .upsert(input, { onConflict: 'customer_id' })
      if (error) throw error
    },

    // ─── Per-customer bot (Pair-flow Option A, 2026-05-09) ───────────
    //
    // Both methods use Postgres RPC to call the SQL helpers
    // encrypt_bot_token() / decrypt_bot_token() defined in migration
    // 20260509200000_telegram_bot_per_customer.sql. The plaintext token
    // never lives in this codebase outside the validate-bot-token
    // request scope (encrypt) or the provisioning service spinUp
    // payload (decrypt).

    async setBotTokenAndUsername(customer_id, bot_token_plaintext, bot_username) {
      // Step 1: encrypt server-side via RPC. Encrypted text comes back
      // base64-encoded (see migration's encode(...,'base64')).
      const { data: ciphertext, error: encErr } = await supabase.rpc(
        'encrypt_bot_token',
        { plaintext: bot_token_plaintext },
      )
      if (encErr) {
        throw new Error(`encrypt_bot_token rpc failed: ${encErr.message}`)
      }
      if (typeof ciphertext !== 'string' || !ciphertext) {
        throw new Error('encrypt_bot_token returned empty value')
      }
      // Step 2: persist ciphertext + username in one UPDATE.
      const { error: upErr } = await supabase
        .from('customers')
        .update({
          telegram_bot_token: ciphertext,
          telegram_bot_username: bot_username,
        })
        .eq('id', customer_id)
      if (upErr) throw upErr
    },

    async getDecryptedBotToken(customer_id) {
      // Step 1: read the ciphertext via service-role (column-level
      // REVOKE blocks anon, but service-role bypasses RLS + grants).
      const { data, error: selErr } = await supabase
        .from('customers')
        .select('telegram_bot_token')
        .eq('id', customer_id)
        .maybeSingle()
      if (selErr) throw selErr
      const ciphertext = (data as { telegram_bot_token: string | null } | null)
        ?.telegram_bot_token ?? null
      if (!ciphertext) return null
      // Step 2: decrypt via RPC.
      const { data: plaintext, error: decErr } = await supabase.rpc(
        'decrypt_bot_token',
        { ciphertext },
      )
      if (decErr) {
        throw new Error(`decrypt_bot_token rpc failed: ${decErr.message}`)
      }
      return typeof plaintext === 'string' ? plaintext : null
    },
  }
}
