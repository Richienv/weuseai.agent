/**
 * Shared fetch wrapper for calling the main project's /api/admin/*
 * observability endpoints. Reuses OBSERVABILITY_ADMIN_SECRET as the
 * bearer (same env var the admin sub-app already requires for cookie
 * auth — see app/lib/auth.ts).
 *
 * Base URL precedence:
 *   1. ADMIN_API_BASE_URL — explicit override (preview branches, local
 *      dev pointing at the deployed main project, etc.)
 *   2. VERCEL_URL — when the admin sub-app and main app deploy as the
 *      same Vercel project this would be enough; today they're separate
 *      projects so this is rarely set on the admin side. Kept as a
 *      best-effort fallback.
 *   3. Hard fallback to the production landing host.
 */

const PROD_FALLBACK = 'https://weuseai-agent.vercel.app';

export function getAdminApiBase(): string {
  const explicit = process.env.ADMIN_API_BASE_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, '')}`;
  return PROD_FALLBACK;
}

export type AdminFetchResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; detail?: string };

export async function adminGet<T>(path: string): Promise<AdminFetchResult<T>> {
  const secret = process.env.OBSERVABILITY_ADMIN_SECRET ?? '';
  if (!secret) {
    return { ok: false, status: 500, error: 'misconfigured', detail: 'OBSERVABILITY_ADMIN_SECRET unset' };
  }
  const base = getAdminApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      // Server-component fetches default to caching — we want fresh data.
      cache: 'no-store',
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: 'fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  let json: unknown;
  try {
    json = await r.json();
  } catch {
    return { ok: false, status: r.status, error: 'invalid_json' };
  }
  if (!r.ok) {
    const errBody = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
    return {
      ok: false,
      status: r.status,
      error: typeof errBody.error === 'string' ? errBody.error : `http_${r.status}`,
      detail: typeof errBody.detail === 'string' ? errBody.detail : undefined,
    };
  }
  return { ok: true, status: r.status, data: json as T };
}
