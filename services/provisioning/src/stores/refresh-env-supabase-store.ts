/**
 * Supabase-backed implementation of IRefreshEnvStore (Track 3a, 2026-05-10).
 *
 * Reads vps_instances + refresh_env_requests via service-role.
 *
 * Pivot 2026-05-10: this store no longer decrypts the customer's bot
 * token. Provisioning is a "dumb pipe" — callers (complete-onboarding-
 * handler, admin-customer-vps-refresh) decrypt + supply env values
 * directly. Closes a credential-leak surface (encryption key never
 * leaves Supabase secrets) and means provisioning has no read path on
 * customers.telegram_bot_token.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { IRefreshEnvStore } from '../routes/refresh-env.js'

export type RefreshEnvStoreDeps = {
  supabaseUrl: string
  serviceRoleKey: string
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
  }
}
