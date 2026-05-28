/**
 * Supabase client factory for the admin sub-app.
 *
 * Uses SERVICE_ROLE key (bypasses RLS) — same env var names the existing
 * /api/admin/* Vercel Functions read. Prefer SUPABASE_SECRET_KEY (new
 * project naming) and fall back to SUPABASE_SERVICE_ROLE_KEY (legacy).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    '';
  if (!url || !key) {
    throw new Error(
      'getSupabaseAdmin: SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY is unset.',
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
