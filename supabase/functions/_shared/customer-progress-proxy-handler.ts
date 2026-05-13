/**
 * Phase 2 (2026-05-13): customer-progress-proxy Edge Function handler.
 *
 * Welcome.html polls this anon-JWT-authenticated endpoint every 5 sec
 * during the provisioning wait. The handler validates the customer_id
 * exists in the customers table (Sesi D P0-2 X-CID safety pattern) and
 * forwards the request to the provisioning service's authenticated
 * /customer-progress route, returning the result unchanged.
 *
 * Why a proxy: the Fly /customer-progress route is bearer-protected
 * (admin-only) because the response contains raw stderr from SSH'd
 * commands. The Edge Function fronts it with anon JWT + cid-scoped
 * authorization, so customers see only their own VPS progress.
 *
 * The proxy is read-only — no DB writes, no side effects on the VPS.
 */

export type CustomerProgressProxyInput = {
  customer_id: string
}

export type CustomerProgressProxyResult =
  | {
      ok: true
      vps_id: string | null
      ip_address: string | null
      vps_ip_pending?: boolean
      progress_lines: string[]
      heartbeat_age_sec: number | null
      heartbeat_stale: boolean
      inferred_stage: string
    }
  | { ok: false; status: number; error: string; detail?: string }

export type CustomerProgressProxyDeps = {
  /** Verify the customer_id row exists (Sesi D P0-2 RLS-aware lookup). */
  customerExists(customerId: string): Promise<boolean>
  /** Forward to provisioning /customer-progress with the service token. */
  fetchProgress(
    customerId: string,
  ): Promise<{ ok: boolean; status: number; bodyText: string }>
}

export async function customerProgressProxyHandler(
  input: CustomerProgressProxyInput,
  deps: CustomerProgressProxyDeps,
): Promise<CustomerProgressProxyResult> {
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }

  const exists = await deps.customerExists(input.customer_id)
  if (!exists) {
    // Don't leak whether the customer exists — return 404 either way.
    return {
      ok: false,
      status: 404,
      error: 'customer_not_found',
    }
  }

  let upstream
  try {
    upstream = await deps.fetchProgress(input.customer_id)
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: 'provisioning_unreachable',
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(upstream.bodyText) as Record<string, unknown>
  } catch {
    return {
      ok: false,
      status: 502,
      error: 'provisioning_malformed_response',
      detail: upstream.bodyText.slice(0, 200),
    }
  }

  if (!upstream.ok || body.ok === false) {
    return {
      ok: false,
      status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      error: (body.error as string) ?? 'provisioning_error',
      detail: (body.detail as string) ?? undefined,
    }
  }

  return {
    ok: true,
    vps_id: (body.vps_id as string | null) ?? null,
    ip_address: (body.ip_address as string | null) ?? null,
    vps_ip_pending: body.vps_ip_pending === true ? true : undefined,
    progress_lines: Array.isArray(body.progress_lines) ? (body.progress_lines as string[]) : [],
    heartbeat_age_sec:
      typeof body.heartbeat_age_sec === 'number' ? body.heartbeat_age_sec : null,
    heartbeat_stale: body.heartbeat_stale === true,
    inferred_stage: typeof body.inferred_stage === 'string' ? body.inferred_stage : 'unknown',
  }
}
