/**
 * Supabase-backed implementation of IRefreshEnvStore (Track 3a, 2026-05-10).
 *
 * Reads vps_instances, refresh_env_requests, and decrypts the customer's
 * bot token via Supabase RPC (decrypt_bot_token, defined in migration
 * 20260509200000_telegram_bot_per_customer.sql).
 *
 * All ops use the service-role key; no anon RLS surface.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { IRefreshEnvStore } from '../routes/refresh-env.js'

export type RefreshEnvStoreDeps = {
  supabaseUrl: string
  serviceRoleKey: string
  /** Same key used by complete-onboarding-handler.deps.botTokenEncKey
   *  — passed as enc_key to the decrypt_bot_token RPC. */
  botTokenEncKey: string
}

export function createRefreshEnvStore(
  deps: RefreshEnvStoreDeps,
): IRefreshEnvStore {
  if (!deps.supabaseUrl) {
    throw new Error('createRefreshEnvStore: missing SUPABASE_URL')
  }
  if (!deps.serviceRoleKey) {
    throw new Error('createRefreshEnvStore: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!deps.botTokenEncKey) {
    throw new Error('createRefreshEnvStore: missing BOT_TOKEN_ENC_KEY')
  }

  const supabase: SupabaseClient = createClient(
    deps.supabaseUrl,
    deps.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  return {
    async findActiveVPSByCustomer(customerId) {
      const { data, error } = await supabase
        .from('vps_instances')
        .select('vps_id, ip_address, status')
        .eq('customer_id', customerId)
        .in('status', ['running', 'provisioning'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        vps_id: (data as { vps_id: string }).vps_id,
        ip_address: (data as { ip_address: string | null }).ip_address,
        status: (data as { status: string }).status,
      }
    },

    async findRefreshRequest(requestId) {
      const { data, error } = await supabase
        .from('refresh_env_requests')
        .select('customer_id, outcome, completed_at')
        .eq('request_id', requestId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as {
        customer_id: string
        outcome: unknown
        completed_at: string | null
      }
      return {
        customerId: row.customer_id,
        outcome: row.outcome,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      }
    },

    async recordRefreshRequestStart(requestId, customerId) {
      // Upsert — re-running with the same id is a no-op on started_at.
      // Outcome stays null until recordRefreshRequestComplete fires.
      const { error } = await supabase
        .from('refresh_env_requests')
        .upsert(
          { request_id: requestId, customer_id: customerId },
          { onConflict: 'request_id', ignoreDuplicates: true },
        )
      if (error) throw error
    },

    async recordRefreshRequestComplete(requestId, outcome) {
      const { error } = await supabase
        .from('refresh_env_requests')
        .update({
          outcome: outcome as Record<string, unknown>,
          completed_at: new Date().toISOString(),
        })
        .eq('request_id', requestId)
      if (error) throw error
    },

    async getDecryptedBotToken(customerId) {
      // Step 1: read the encrypted column via service-role.
      const { data, error } = await supabase
        .from('customers')
        .select('telegram_bot_token')
        .eq('id', customerId)
        .maybeSingle()
      if (error) throw error
      const ciphertext = (data as { telegram_bot_token: string | null } | null)
        ?.telegram_bot_token ?? null
      if (!ciphertext) return null
      // Step 2: decrypt via RPC. Mirrors onboarding-store-supabase.ts
      // getDecryptedBotToken — same enc_key contract.
      const { data: plaintext, error: rpcErr } = await supabase.rpc(
        'decrypt_bot_token',
        { encrypted: ciphertext, enc_key: deps.botTokenEncKey },
      )
      if (rpcErr) {
        throw new Error(`decrypt_bot_token rpc failed: ${rpcErr.message}`)
      }
      return typeof plaintext === 'string' ? plaintext : null
    },
  }
}
