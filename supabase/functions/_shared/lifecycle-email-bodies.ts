// lifecycle-email-bodies.ts — Phase A2 PR 1 lifecycle email body builders.
//
// Canonical source-of-truth for these six templates lives at
//   assets/email-templates/<name>.md
// We mirror that prose verbatim into TypeScript string constants below
// because Supabase Edge Functions bundle the .ts at deploy time — they
// can't read assets/ from the Vercel build at request time. The drift
// gate test (tests/email-template-drift.spec.ts) keeps the .md and the
// .ts in lockstep on every CI run.
//
// CLAUDE.md voice rules apply to every line:
//   - Bahasa Indonesia primary, English for technical terms (Telegram,
//     bot, API, VPS)
//   - "kamu" form, never "Anda" or "lo/gue"
//   - Zero exclamation marks in body copy
//   - No banned words (basically, just, literally, honestly, kind of,
//     pretty much, revolutionary, disrupt, 10x, game-changer, next-level)
//   - One idea per sentence
//
// Each builder loads the matching template entry from
// LIFECYCLE_TEMPLATE_SOURCES, substitutes {{handlebars}} variables, and
// returns { subject, text }. Hand the result to sendEmail() from
// email-delivery.ts.

// ─── template source constants (mirror assets/email-templates/*.md) ────

type TemplateSource = {
  subject: string
  body: string
}

/**
 * Six lifecycle templates. Keys match the .md filenames (no extension).
 * Body text is the substring of the .md AFTER the front-matter comment
 * and the `**Subject:** ... ---` separator, verbatim.
 *
 * If you edit either side, run `npm test -- tests/email-template-drift.spec.ts`
 * to confirm both stay in lockstep.
 */
export const LIFECYCLE_TEMPLATE_SOURCES: Record<string, TemplateSource> = {
  welcome: {
    subject: 'Agent kamu siap dipakai — weuseai.agent',
    body: [
      'Halo {{display_name}},',
      '',
      'Setup paket {{tier}} kamu sudah selesai. Agent kamu sudah aktif di server pribadi dan siap merespons di Telegram.',
      '',
      '**Mulai dari sini**',
      '',
      'Buka bot kamu: https://t.me/{{bot_username}}',
      '',
      'Kirim pesan pertama. Bot akan langsung membalas — kamu tidak perlu mengetik `/start`.',
      '',
      '**Tiga hal yang biasanya dicoba pelanggan baru**',
      '',
      '- "Halo, kenalan dulu" — agent akan mengingat preferensi dan gaya kerja kamu.',
      '- "Bantu aku draft email ke klien soal X" — produktivitas dasar untuk hari pertama.',
      '- "Apa saja yang kamu bisa bantu hari ini?" — daftar kemampuan persona {{first_persona}}.',
      '',
      '**Dashboard**',
      '',
      'Ganti persona, cek penggunaan, atau pasang API key kamu sendiri di {{dashboard_url}}.',
      '',
      'Kalau agent belum membalas dalam 5 menit, kirim WhatsApp ke +62 821-5490-2561. Kami akan cek dari sisi server.',
      '',
      '—',
      'Tim weuseai.agent',
      'Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.',
    ].join('\n'),
  },

  'setup-help': {
    subject: 'Setup kamu kelihatannya sempat tersangkut — kami bantu',
    body: [
      'Halo {{display_name}},',
      '',
      'Kami lihat kamu sempat mentok di tahap {{stuck_step}}. Tidak apa-apa, bagian ini memang paling sering bikin pelanggan berhenti sebentar.',
      '',
      '**Coba langkah berikut dulu**',
      '',
      '- Buka kembali halaman onboarding di sini: {{resume_url}}. Progres kamu tersimpan, kamu tidak perlu mengulang dari awal.',
      '- Pastikan tab Telegram kamu pakai akun yang sama dengan yang dipakai saat membuat bot via @BotFather.',
      '- Kalau VPS yang belum siap, tunggu 2 menit lagi lalu refresh — pembuatan server biasanya 60-90 detik di Singapore.',
      '',
      '**Kalau masih mentok**',
      '',
      'Balas email ini dengan satu kalimat tentang apa yang kamu lihat di layar. Screenshot membantu, tapi tidak wajib.',
      '',
      'Untuk respons lebih cepat, WhatsApp ke +62 821-5490-2561 selama Senin-Sabtu, 09.00-21.00 WIB. Sebut nama dan email yang kamu pakai saat checkout supaya kami bisa langsung buka catatan kamu.',
      '',
      '—',
      'Tim weuseai.agent',
      'Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.',
    ].join('\n'),
  },

  'flow-paused': {
    subject: 'Playbook {{playbook_name}} kamu menunggu satu langkah',
    body: [
      'Halo {{display_name}},',
      '',
      'Playbook {{playbook_name}} kamu sudah berjalan, tapi terhenti di satu titik karena {{parked_reason}}. Kami menyimpan progres kamu apa adanya selama menunggu.',
      '',
      '**Yang kami butuhkan dari kamu**',
      '',
      'Buka halaman ini untuk melanjutkan: {{resume_url}}. Setelah kamu kirim yang kami minta, agent akan langsung lanjut ke langkah berikutnya tanpa harus mengulang.',
      '',
      '**Batas waktu**',
      '',
      'Tersisa {{days_remaining}} hari sebelum playbook ini otomatis ditutup. Kalau ditutup, kamu masih bisa memulai ulang dari dashboard, tapi langkah yang sudah selesai harus diulang sebagian.',
      '',
      'Kalau ada kendala atau kamu butuh waktu lebih lama, balas email ini. Kami bisa pause manual sampai kamu siap.',
      '',
      '—',
      'Tim weuseai.agent',
      'Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.',
    ].join('\n'),
  },

  'flow-expired': {
    subject: 'Playbook {{playbook_name}} ditutup otomatis setelah 14 hari',
    body: [
      'Halo {{display_name}},',
      '',
      'Playbook {{playbook_name}} kamu sudah ditutup otomatis hari ini. Run ini berhenti di tahap {{parked_at_label}} dan tidak ada update selama 14 hari, jadi sistem menutupnya supaya tidak menggantung.',
      '',
      '**Tidak ada biaya tambahan**',
      '',
      'Setup fee yang kamu bayar tetap berlaku untuk agent kamu. Yang ditutup hanya satu run playbook, bukan langganan.',
      '',
      '**Kalau mau coba lagi**',
      '',
      'Mulai run baru di sini: {{restart_url}}. Sebagian besar input yang kamu sudah berikan tersimpan di profil kamu, jadi pengulangan biasanya lebih cepat dari awal.',
      '',
      'Kalau yang membuat run ini berhenti adalah kendala dari sisi kami, atau kamu butuh playbook yang lebih cocok, balas email ini. Kami senang ngobrol singkat sebelum kamu mulai ulang. Dashboard kamu tetap aktif di {{dashboard_url}}.',
      '',
      '—',
      'Tim weuseai.agent',
      'Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.',
    ].join('\n'),
  },

  refund: {
    subject: 'Pengembalian dana sudah kami proses — {{invoice_id}}',
    body: [
      'Halo {{display_name}},',
      '',
      'Permintaan pengembalian dana kamu sudah kami proses hari ini. Dana sebesar {{refund_amount_idr}} akan dikembalikan lewat {{refund_method}}, jalur yang sama dengan pembayaran awal.',
      '',
      '**Estimasi waktu**',
      '',
      'Sekitar {{eta_business_days}} hari kerja sampai dana masuk ke akun kamu, tergantung bank atau e-wallet. Kalau lewat 14 hari kerja belum masuk, balas email ini dan kami bantu cek dengan Xendit.',
      '',
      '**Yang terjadi dengan agent kamu**',
      '',
      'Server kamu sudah dihentikan dan data agent dihapus sesuai kebijakan privasi kami. Detail prosedur ada di https://weuseai-agent.vercel.app/refund-policy.',
      '',
      '**Kalau berubah pikiran**',
      '',
      'Kamu selalu boleh kembali. Kalau suatu saat mau coba lagi, kabari kami dan kami siapkan setup baru tanpa biaya pendaftaran ulang.',
      '',
      '—',
      'Tim weuseai.agent',
      'Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.',
    ].join('\n'),
  },

  'support-handoff': {
    subject: 'Tiket {{ticket_id}} sudah kami tangani — kamu bisa lanjut',
    body: [
      'Halo {{display_name}},',
      '',
      'Tiket kamu sudah kami tangani manual dari sisi tim. Berikut ringkasannya.',
      '',
      '**Yang sudah kami lakukan**',
      '',
      '{{summary_done}}',
      '',
      'Kami uji ulang di {{verified_at_label}} dan agent kamu merespons normal saat itu.',
      '',
      '**Yang perlu kamu lakukan**',
      '',
      '{{action_required}}',
      '',
      'Kalau ada hal yang masih terasa janggal, balas email ini dan sebut tiket {{ticket_id}}. Konteks kamu sudah kami catat, jadi kamu tidak perlu menjelaskan dari awal lagi.',
      '',
      '—',
      'Tim weuseai.agent',
      'Dioperasikan oleh Richie Kidnovell, berbasis di Jakarta.',
    ].join('\n'),
  },
}

// ─── substitution helper ───────────────────────────────────────────────

/**
 * Substitute every `{{key}}` placeholder in `s` with `vars[key]`.
 * Throws if a `{{key}}` survives un-replaced — typed builders below
 * always pass every variable the template declares, so the throw is a
 * developer-visible signal that the .md grew a new variable the .ts
 * builder hasn't been updated for.
 */
function substitute(s: string, vars: Record<string, string | number>): string {
  let out = s
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v))
  }
  const leftover = out.match(/\{\{[a-z_]+\}\}/i)
  if (leftover) {
    throw new Error(
      `lifecycle-email-bodies: unsubstituted template variable ${leftover[0]} ` +
        `— add the missing key to the caller's args.`,
    )
  }
  return out
}

function render(
  name: keyof typeof LIFECYCLE_TEMPLATE_SOURCES | string,
  vars: Record<string, string | number>,
): { subject: string; text: string } {
  const src = LIFECYCLE_TEMPLATE_SOURCES[name]
  if (!src) {
    throw new Error(`lifecycle-email-bodies: unknown template "${name}"`)
  }
  return {
    subject: substitute(src.subject, vars),
    text: substitute(src.body, vars),
  }
}

// ─── typed builders ─────────────────────────────────────────────────────

/**
 * welcome.md — Customer paid + completed onboarding form, agent activated.
 *
 * Note: complete-onboarding already calls buildWelcomeEmailBody from
 * email-delivery.ts (the earlier inline string). This lifecycle variant
 * exists for handlers that want the markdown-canonical version (e.g.
 * future re-send flows). The existing welcome path is NOT migrated in
 * PR 1 to avoid changing shipped behavior — see PR notes.
 */
export function buildLifecycleWelcomeEmailBody(args: {
  display_name: string
  tier: string
  bot_username: string
  first_persona: string
  dashboard_url: string
}): { subject: string; text: string } {
  return render('welcome', { ...args })
}

/**
 * setup-help.md — Customer is stuck mid-onboarding (e.g. bot token,
 * VPS boot, API key). Sent by the retry-pending-provisions handler at
 * the 24-hour stuck threshold (PR 4 wires this).
 */
export function buildSetupHelpEmailBody(args: {
  display_name: string
  stuck_step: string
  resume_url: string
}): { subject: string; text: string } {
  return render('setup-help', { ...args })
}

/**
 * flow-paused.md — Daily cron sends this when a customer_flow_state row
 * has been parked at awaiting_customer / escalated for ~7 days and the
 * 14-day TTL is halfway gone (PR 2 wires the cron).
 */
export function buildFlowPausedEmailBody(args: {
  display_name: string
  playbook_name: string
  parked_reason: string
  days_remaining: number
  resume_url: string
}): { subject: string; text: string } {
  return render('flow-paused', { ...args })
}

/**
 * flow-expired.md — flow-state-ttl-sweep fires this when a parked
 * playbook row hits its 14-day TTL and is auto-aborted (PR 3 wires
 * the notifier).
 */
export function buildFlowExpiredEmailBody(args: {
  display_name: string
  playbook_name: string
  parked_at_label: string
  restart_url: string
  dashboard_url: string
}): { subject: string; text: string } {
  return render('flow-expired', { ...args })
}

/**
 * refund.md — Admin manual trigger after a refund has been initiated
 * with Xendit (PR 5 wires the admin endpoint).
 */
export function buildRefundEmailBody(args: {
  display_name: string
  invoice_id: string
  refund_amount_idr: string
  refund_method: string
  eta_business_days: number
}): { subject: string; text: string } {
  return render('refund', { ...args })
}

/**
 * support-handoff.md — Admin manual trigger after handling a ticket
 * outside the agent (PR 5 wires the admin endpoint).
 */
export function buildSupportHandoffEmailBody(args: {
  display_name: string
  ticket_id: string
  summary_done: string
  action_required: string
  verified_at_label: string
}): { subject: string; text: string } {
  return render('support-handoff', { ...args })
}
