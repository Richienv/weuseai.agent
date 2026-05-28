'use server';

/**
 * Server actions for the customer detail page.
 *
 * Wired actions (real):
 *   - resendOnboardingEmail — composes the welcome email body (Node-only,
 *     copied from supabase/functions/_shared/email-delivery.ts buildWelcomeEmailBody
 *     because the Deno-flavoured shared module can't be imported here) and
 *     calls sendEmail() from app/lib/email.ts. Stub-tolerant if RESEND_API_KEY
 *     is unset.
 *
 * Stubbed actions (record-only — TODO wire to live endpoints):
 *   - restartGateway — would call the admin-customer-vps-refresh Edge Function.
 *   - markRefunded — would update subscription.status='refunded' + send refund
 *     email + (TODO) deprovision VPS.
 *   - escalateToSupport — would flag the customer for founder priority view.
 *
 * All actions require the cookie (middleware gate). After mutating they
 * revalidate the detail page so the founder sees fresh state immediately.
 */

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '../../lib/supabase';
import { sendEmail } from '../../lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function buildOnboardingResendBody(args: {
  display_name: string;
  tier: string;
  bot_username: string | null;
}): { subject: string; text: string } {
  // Mirrors supabase/functions/_shared/email-delivery.ts buildWelcomeEmailBody.
  // Voice rules: kamu, no exclamation marks, no banned words.
  const botLine = args.bot_username
    ? `https://t.me/${args.bot_username}`
    : 'Buka Telegram dan cari bot kamu (sudah di-pair lewat onboarding).';
  return {
    subject: 'Agent kamu sudah aktif — weuseai.agent',
    text: [
      `Halo ${args.display_name},`,
      ``,
      `Agent weuseai.agent kamu (paket ${args.tier}) sudah aktif.`,
      ``,
      `Kirim pesan pertama ke bot Telegram kamu:`,
      `  ${botLine}`,
      ``,
      `Beberapa hal yang bisa kamu coba di pesan pertama:`,
      `  • "Halo, kenalan dulu" — agent akan ingat preferensi kamu`,
      `  • "Bantu aku draft email ke klien" — produktivitas dasar`,
      `  • "Apa yang kamu bisa bantu?" — daftar kemampuan`,
      ``,
      `Kalau agent belum membalas dalam 5 menit, cek dashboard atau`,
      `hubungi kami via WhatsApp di +62 821-5490-2561.`,
      ``,
      `— weuseai.agent`,
      `Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.`,
    ].join('\n'),
  };
}

export async function resendOnboardingEmail(
  customerId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(customerId)) {
    return { ok: false, error: 'Customer ID tidak valid.' };
  }
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return {
      ok: false,
      error: `Supabase belum dikonfigurasi: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  // Fetch customer + latest subscription tier.
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select(
      'email, display_name, telegram_bot_username, ' +
        'subscriptions(tier, status, started_at)',
    )
    .eq('id', customerId)
    .maybeSingle();
  if (cErr) return { ok: false, error: `Lookup gagal: ${cErr.message}` };
  if (!customer) return { ok: false, error: 'Customer tidak ditemukan.' };

  const c = customer as unknown as {
    email: string;
    display_name: string | null;
    telegram_bot_username: string | null;
    subscriptions: { tier: string; status: string; started_at: string | null }[] | null;
  };
  const subs = c.subscriptions ?? [];
  const active = subs.find((s) => s.status === 'active') ?? subs[0];
  const tier = active?.tier ?? 'starter';
  const displayName = c.display_name || c.email;
  const botUsername = c.telegram_bot_username;

  const body = buildOnboardingResendBody({
    display_name: displayName,
    tier,
    bot_username: botUsername,
  });
  const send = await sendEmail({
    to: c.email,
    subject: body.subject,
    text: body.text,
  });
  revalidatePath(`/customers/${customerId}`);
  if (!send.ok) {
    return { ok: false, error: `Resend gagal: ${send.error}` };
  }
  if (send.stub) {
    return {
      ok: true,
      message: `Welcome email di-skip (RESEND_API_KEY belum di-set di admin project).`,
    };
  }
  return {
    ok: true,
    message: `Welcome email ulang terkirim ke ${c.email}.`,
  };
}

// ── Stub actions ────────────────────────────────────────────────────
// These POST handlers return descriptive TODO messages and don't mutate
// production data. Wire them when the founder needs each — the existing
// endpoints to call are noted in the message.

export async function restartGatewayStub(
  customerId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(customerId)) {
    return { ok: false, error: 'Customer ID tidak valid.' };
  }
  return {
    ok: false,
    error:
      'TODO — wire ke Edge Function admin-customer-vps-refresh. ' +
      'Belum di-implementasi di PR ini supaya scope ringkas.',
  };
}

export async function markRefundedStub(
  customerId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(customerId)) {
    return { ok: false, error: 'Customer ID tidak valid.' };
  }
  return {
    ok: false,
    error:
      'TODO — wire 3 langkah: (1) UPDATE subscriptions.status=refunded, ' +
      '(2) call Edge Function admin-send-refund-email, ' +
      '(3) trigger VPS deprovision. Belum di-implementasi di PR ini.',
  };
}

export async function escalateSupportStub(
  customerId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(customerId)) {
    return { ok: false, error: 'Customer ID tidak valid.' };
  }
  return {
    ok: false,
    error:
      'TODO — perlu kolom baru customers.escalated_at + filter di Tab 2. ' +
      'Belum di-implementasi di PR ini (akan butuh Supabase migration).',
  };
}
