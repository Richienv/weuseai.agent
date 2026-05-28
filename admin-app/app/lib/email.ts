/**
 * Email send (Node-side, Next.js sub-app).
 *
 * Mirrors supabase/functions/_shared/email-delivery.ts (sendEmail +
 * buildWelcomeEmailBody) but Node-only — the Deno-flavoured shared
 * module can't be imported from the Next.js sub-app. When RESEND_API_KEY
 * is missing the send becomes a no-op stub, matching the upstream
 * behaviour so the admin app doesn't need its own key in dev/preview.
 *
 * Voice rules (CLAUDE.md): "kamu", no exclamation marks, no banned
 * words (basically/just/literally/etc), calm-premium register.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'noreply@weuseai.agent';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  from?: string;
};

export type SendEmailResult =
  | { ok: true; stub?: false; resend_id: string }
  | { ok: true; stub: true; reason: string }
  | { ok: false; error: string; detail?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!input?.to || typeof input.to !== 'string' || !input.to.includes('@')) {
    return { ok: false, error: 'invalid_to' };
  }
  if (!input?.subject || typeof input.subject !== 'string') {
    return { ok: false, error: 'invalid_subject' };
  }
  if (typeof input?.text !== 'string') {
    return { ok: false, error: 'invalid_text' };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      stub: true,
      reason: 'RESEND_API_KEY not set; would-have-sent email skipped',
    };
  }
  let r: Response;
  try {
    r = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from ?? DEFAULT_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      error: 'resend_fetch_failed',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  if (!r.ok) {
    let detailText = '';
    try {
      detailText = (await r.text()).slice(0, 400);
    } catch {
      /* swallow */
    }
    return {
      ok: false,
      error: 'resend_http_error',
      detail: `HTTP ${r.status}: ${detailText}`,
    };
  }
  let json: { id?: string };
  try {
    json = (await r.json()) as { id?: string };
  } catch {
    return { ok: false, error: 'resend_invalid_response' };
  }
  if (!json.id) return { ok: false, error: 'resend_response_missing_id' };
  return { ok: true, resend_id: json.id };
}

export function buildManualProvisionWelcomeEmail(args: {
  display_name: string;
  tier: string;
}): { subject: string; text: string } {
  // Bahasa, "kamu", no exclamation marks, no banned words.
  // Calm-premium register. Manual-provision flow → customer paid via
  // bank transfer / QRIS manual / Wise. Tell them their agent is being
  // set up and we'll follow up with the onboarding link.
  return {
    subject: 'Pembayaran kamu kami terima — weuseai.agent',
    text: [
      `Halo ${args.display_name},`,
      ``,
      `Pembayaran setup weuseai.agent kamu (paket ${args.tier}) sudah kami terima.`,
      `Terima kasih.`,
      ``,
      `Agent kamu lagi disiapkan. Kami kirim email aktivasi terpisah dengan link`,
      `ke dashboard onboarding begitu siap.`,
      ``,
      `Butuh bantuan atau perlu pengembalian dana?`,
      `Lihat https://weuseai-agent.vercel.app/refund-policy atau balas email ini.`,
      ``,
      `— weuseai.agent`,
      `Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.`,
    ].join('\n'),
  };
}
