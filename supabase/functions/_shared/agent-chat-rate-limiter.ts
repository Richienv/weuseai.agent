// agent-chat-rate-limiter — thin wrapper over the durable atomic RPCs
// (agent_chat_rate_check / agent_chat_rate_commit, migration 20260616000000).
// Durable Postgres is authoritative: a Fly in-memory counter is bypassable by
// a restart (dashboard spec §3.5). FAIL-CLOSED — any DB error denies (429),
// never allows.
//
// Takes a minimal RPC client (NOT the esm.sh Supabase client) so this stays
// Node-typecheckable + unit-testable; index.ts passes the real client in.

export type RateReason = 'ok' | 'rate_limited' | 'budget_exceeded' | 'error'

export type RateVerdict = {
  allowed: boolean
  /** seconds the caller should wait before retrying (rate_limited only) */
  retryAfter: number
  reason: RateReason
}

export interface AgentChatRateLimiter {
  /** Atomic check + pre-charge of the clamped token ceiling. */
  check(customerId: string, estTokens: number): Promise<RateVerdict>
  /** Reconcile actual usage: delta = actualTokens - preChargedCeiling (≤0 = refund). */
  commit(customerId: string, deltaTokens: number): Promise<void>
}

/** The slice of the Supabase client we use — keeps this file Deno-free. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

export function createRateLimiter(client: RpcClient): AgentChatRateLimiter {
  return {
    async check(customerId, estTokens) {
      try {
        const { data, error } = await client.rpc('agent_chat_rate_check', {
          p_cid: customerId,
          p_est_tokens: Math.max(0, Math.floor(estTokens)),
        })
        if (error) return { allowed: false, retryAfter: 5, reason: 'error' }
        // The RPC RETURNS TABLE → an array of one row.
        const row = (Array.isArray(data) ? data[0] : data) as
          | { allowed: boolean; retry_after: number; reason: RateReason }
          | undefined
        if (!row) return { allowed: false, retryAfter: 5, reason: 'error' }
        return {
          allowed: !!row.allowed,
          retryAfter: Number(row.retry_after) || 0,
          reason: (row.reason as RateReason) ?? 'error',
        }
      } catch {
        return { allowed: false, retryAfter: 5, reason: 'error' }
      }
    },
    async commit(customerId, deltaTokens) {
      try {
        await client.rpc('agent_chat_rate_commit', {
          p_cid: customerId,
          p_delta: Math.floor(deltaTokens),
        })
      } catch {
        /* metering reconciliation is best-effort; the pre-charge already bounded spend */
      }
    },
  }
}
