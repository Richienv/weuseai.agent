'use server';

/**
 * Manual-provision server action.
 *
 * Flow:
 *   1. Validate inputs (email, persona slug, amount, payment method).
 *   2. Insert customers row (email + display_name; unique on email — if
 *      email already exists, reuse the existing customer rather than
 *      erroring).
 *   3. Insert subscriptions row (tier inferred from chosen persona; the
 *      lowest tier that grants that persona — same as what a paying
 *      customer would buy).
 *   4. Insert manual_provisions audit row.
 *   5. Send welcome email (stub-tolerant — if RESEND_API_KEY is unset
 *      the send becomes a no-op).
 *   6. Return success with subscription_id.
 *
 * Provisioning (VPS spin-up) is INTENTIONALLY NOT TRIGGERED HERE. The
 * `services/provisioning/spin-up` endpoint requires the customer's
 * Telegram bot token, OpenRouter API key, and SOUL.md content — none
 * of which the manual-provision form collects. The founder runs the
 * normal onboarding flow with the customer after this row exists. See
 * PR body for the rationale + path to wire later if desired.
 */

import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  PERSONA_SLUGS,
  tierForPersonaSlug,
  type Tier,
} from '../lib/personas';
import { buildManualProvisionWelcomeEmail, sendEmail } from '../lib/email';

const PAYMENT_METHODS = [
  'manual_bank_transfer',
  'manual_qris',
  'manual_wise',
  'other',
] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProvisionResult =
  | {
      ok: true;
      message: string;
      customer_id: string;
      subscription_id: string;
      email_status: 'sent' | 'stub' | 'failed';
    }
  | {
      ok: false;
      error: string;
      // Echoed input so the form can re-populate (we don't store this server-side).
      input?: Partial<{
        email: string;
        display_name: string;
        persona_slug: string;
        amount_idr: string;
        payment_method: string;
        payment_reference: string;
        notes: string;
      }>;
    };

export async function provisionCustomerAction(
  _prev: ProvisionResult | null,
  formData: FormData,
): Promise<ProvisionResult> {
  // ── Parse ────────────────────────────────────────────────────────
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase();
  const display_name = (formData.get('display_name') ?? '').toString().trim();
  const persona_slug = (formData.get('persona_slug') ?? '').toString();
  const amount_raw = (formData.get('amount_idr') ?? '').toString().trim();
  const payment_method = (formData.get('payment_method') ?? '').toString();
  const payment_reference =
    (formData.get('payment_reference') ?? '').toString().trim() || null;
  const notes = (formData.get('notes') ?? '').toString().trim() || null;

  const echoed = {
    email,
    display_name,
    persona_slug,
    amount_idr: amount_raw,
    payment_method,
    payment_reference: payment_reference ?? '',
    notes: notes ?? '',
  };

  // ── Validate ─────────────────────────────────────────────────────
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Email customer tidak valid.', input: echoed };
  }
  if (!display_name) {
    return { ok: false, error: 'Nama display wajib diisi.', input: echoed };
  }
  if (!persona_slug || !PERSONA_SLUGS.has(persona_slug)) {
    return { ok: false, error: 'Persona tidak valid.', input: echoed };
  }
  const tier: Tier | null = tierForPersonaSlug(persona_slug);
  if (!tier) {
    return { ok: false, error: 'Tier tidak bisa diturunkan dari persona.', input: echoed };
  }
  const amount_idr = parseInt(amount_raw, 10);
  if (!Number.isFinite(amount_idr) || amount_idr <= 0) {
    return { ok: false, error: 'Jumlah bayar harus angka positif.', input: echoed };
  }
  if (!PAYMENT_METHODS.includes(payment_method as PaymentMethod)) {
    return { ok: false, error: 'Metode bayar tidak valid.', input: echoed };
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return {
      ok: false,
      error: `Konfigurasi Supabase belum lengkap: ${e instanceof Error ? e.message : String(e)}`,
      input: echoed,
    };
  }

  // ── Step 1: upsert customer ──────────────────────────────────────
  // Customers.email is UNIQUE. If the email already exists, reuse —
  // founder may need to re-provision (e.g., upgrade tier) without
  // hitting a 409 wall. The audit row records the manual provision
  // regardless.
  let customer_id: string;
  {
    const existing = await supabase
      .from('customers')
      .select('id, display_name')
      .eq('email', email)
      .maybeSingle();
    if (existing.error) {
      return {
        ok: false,
        error: `Gagal lookup customer: ${existing.error.message}`,
        input: echoed,
      };
    }
    if (existing.data) {
      customer_id = existing.data.id as string;
      // Patch display_name if the existing row had it null.
      if (!existing.data.display_name) {
        await supabase
          .from('customers')
          .update({ display_name })
          .eq('id', customer_id);
      }
    } else {
      const insert = await supabase
        .from('customers')
        .insert({ email, display_name })
        .select('id')
        .single();
      if (insert.error || !insert.data) {
        return {
          ok: false,
          error: `Gagal insert customer: ${insert.error?.message ?? 'unknown error'}`,
          input: echoed,
        };
      }
      customer_id = insert.data.id as string;
    }
  }

  // ── Step 2: insert subscription ─────────────────────────────────
  // source='manual' is NOT a column on subscriptions today; the manual_provisions
  // audit row carries that signal instead. Subscription gets status='active'
  // straight up (manual flow assumes the founder confirmed payment landed
  // before opening this form).
  let subscription_id: string;
  {
    const insertSub = await supabase
      .from('subscriptions')
      .insert({
        customer_id,
        tier,
        status: 'active',
        hosting_active: true,
      })
      .select('id')
      .single();
    if (insertSub.error || !insertSub.data) {
      return {
        ok: false,
        error: `Gagal insert subscription: ${insertSub.error?.message ?? 'unknown'}`,
        input: echoed,
      };
    }
    subscription_id = insertSub.data.id as string;
  }

  // ── Step 3: audit row (manual_provisions) ───────────────────────
  // Best-effort: if the audit insert fails we still surface success
  // for the operator (customer + subscription are already real). We
  // log the audit error in `email_status` channel — UI shows it as an
  // info banner.
  let auditError: string | null = null;
  {
    const auditInsert = await supabase.from('manual_provisions').insert({
      customer_id,
      subscription_id,
      created_by: 'admin', // single-admin model; could be extended later.
      payment_method,
      payment_reference,
      amount_idr,
      persona_slug,
      tier,
      notes,
    });
    if (auditInsert.error) {
      auditError = auditInsert.error.message;
    }
  }

  // ── Step 4: send welcome email ──────────────────────────────────
  const emailBody = buildManualProvisionWelcomeEmail({ display_name, tier });
  const send = await sendEmail({
    to: email,
    subject: emailBody.subject,
    text: emailBody.text,
  });
  let email_status: 'sent' | 'stub' | 'failed';
  if (send.ok && send.stub) email_status = 'stub';
  else if (send.ok) email_status = 'sent';
  else email_status = 'failed';

  // ── Step 5: provisioning trigger ────────────────────────────────
  // INTENTIONALLY STUBBED. See actions.ts module docstring + PR body.

  const baseMsg =
    `Customer ${email} berhasil di-provision. ` +
    `Subscription ID: ${subscription_id}. ` +
    `Cek Tab 2 (Customer List) buat status VPS.`;
  const auditMsg = auditError
    ? ` (Catatan: audit row gagal disimpan — ${auditError})`
    : '';
  const emailMsg =
    email_status === 'sent'
      ? ' Email welcome terkirim.'
      : email_status === 'stub'
        ? ' Email welcome di-skip (RESEND_API_KEY belum di-set).'
        : ' Email welcome gagal terkirim — cek log.';

  // Redirect with a success token so the page can render the confirmation
  // panel cleanly (and the form clears).
  // Using URL params is fine here — message is short, no PII beyond email.
  const params = new URLSearchParams({
    customer_id,
    subscription_id,
    email_status,
    message: baseMsg + auditMsg + emailMsg,
  });
  redirect(`/manual-provision?${params.toString()}`);

  // Unreachable — redirect throws. Kept for type completeness.
  return {
    ok: true,
    message: baseMsg + auditMsg + emailMsg,
    customer_id,
    subscription_id,
    email_status,
  };
}
