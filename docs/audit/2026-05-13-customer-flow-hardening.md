# Customer Flow Hardening Audit — Pass 1 (Sesi D, 2026-05-13)

**Auditor:** Sesi D (read-only walk; no PRs, no code changes — findings only).
**Scope:** landing → checkout → Xendit invoice → webhook → welcome polling → VPS provisioning → Hermes install → BotFather pairing → first `/<persona>` response. Customer perspective throughout.
**Repo state:** `origin/main` @ `83a99c8` (post-pass-3 P0/P1 fix cascade).
**Methodology:** read every step of the payment-to-product-delivery flow as a first-time customer would experience it. State both **what the customer sees today** and **proposed Bahasa copy + recovery action** for each finding.

> **Tone bar:** Signal Red / Oxblood / Void Black premium-calm Bahasa per CLAUDE.md voice rules. No backend tech names visible to the customer (no "VPS", "Hermes", "Edge Function", "webhook"). No exclamation marks. `kamu`, never `Anda`.

---

## Executive summary

| Severity | Count | Theme |
|---|---|---|
| **P0** (wall, no recovery) | 0 | No dead-end paths found; recovery exists everywhere, even if degraded. |
| **P1** (jargon error / wall with unclear next step) | 7 | Raw English error codes leak to UI; failed-Xendit-redirect drops customer on bare form; pending_provision has no auto-retry surface; lost-cid customer has no email-recovery path; pair-code expiry copy doesn't reassure. |
| **P2** (degraded but not blocking) | 7 | Dual stage label maps could feel contradictory; failover doubles expected duration; no "what's happening" explainer; mid-submit network drop strands button; founder won't see most failures in prod (telemetry gap); refund-policy not surfaced from failure state. |
| **P3** (polish) | 7 | Footer trust signal missing on welcome.html; receipt email has no "what's next" CTA; state transitions abrupt; etc. |

**Headline take.** The flow is largely solid — the pass-2/pass-3 cascade closed the auth+RLS gaps, and the post-pair UX polish + honest-error fixes (Tracks 1–4 of 2026-05-10) added good Bahasa coverage. **The remaining gaps are at the seams**: where one system hands off to another and the failure mode is silent. Three customer-visible patterns recur:

1. **English error codes leak to Bahasa UI** (checkout submit failure, complete-onboarding submit failure). Customer sees `Gagal: invalid_methodId`. Premium voice broken at the first stumble.
2. **No automated retry on the pending_provision parking lot.** Comments reference a "retry worker" that doesn't exist (pass-2 P1-5 still deferred). Customer who hits Vultr+DO double-capacity-fail can sit indefinitely with no escalation other than the WA hint at 3x expected stage duration.
3. **No email-with-cid recovery path.** If a customer loses the cid (cleared browser history, switched device, screenshot URL clipped), the only way back is WhatsApp support. A receipt email exists ([buildPaymentReceiptEmailBody](supabase/functions/_shared/email-delivery.ts)) but it doesn't include a "Return to your setup" link with the cid embedded.

The /welcome state machine itself is in good shape — the "Step 4 jumping" concern is fixed (boot rule evaluates resume rule BEFORE first render; verified at [onboarding.html:1872–1929](onboarding.html)). The state-B progress overlay with soft/hard escalation tiers is well-architected. The remaining trust-signal gaps are polish.

---

## Per-step findings

### Step 1 — Landing → /checkout (tier select, ToS, marketing opt-in)

#### Customer journey today

1. Lands on `/` or `/use-cases.html`.
2. Clicks "Mulai sekarang" → /checkout.
3. Sees tier pre-selected from URL `?plan=`. Inline accordion of payment methods.
4. Fills email, ticks "Saya menyetujui Syarat dan Ketentuan…", optionally ticks marketing opt-in.
5. Clicks "Bayar Sekarang · Rp X" → redirected to Xendit-hosted page.

#### Findings

- **P1-CF-1 · Raw English error codes surface to Bahasa UI on checkout submit failure.**
  - **What customer sees today:** `Gagal: invalid_methodId. Coba lagi atau pilih method lain.` ([checkout.html:1099](checkout.html)). Server returns codes like `invalid_email`, `invalid_methodId`, `invalid_plan`, `consent_persist_failed`, `invalid_alwaysOn`. The catch-all surfaces them verbatim.
  - **What customer SHOULD see:**
    - For `invalid_email`: *"Email belum benar. Cek lagi formatnya (mis. kamu@email.com)."*
    - For `invalid_methodId`: *"Cara bayar yang dipilih sedang tidak tersedia. Pilih cara bayar lain dari daftar."*
    - For `invalid_plan`: *"Paket tidak dikenali. Refresh halaman dan coba lagi — kalau berlanjut, hubungi tim."*
    - For `consent_persist_failed`: *"Persetujuan tidak tersimpan. Centang ulang Syarat dan Ketentuan, lalu coba lagi."*
    - For any unknown code: *"Pembayaran tidak bisa disiapkan saat ini. Coba lagi dalam 1 menit, atau hubungi tim via WhatsApp."*
  - **Recovery action:** retry button stays enabled; surface WA link below the error message when retry count ≥ 2.
  - **Telemetry gap:** server returns the error code but client doesn't track which code fired — founder can't see the distribution. Recommend adding a `console.warn(\`[checkout] submit failed: ${data.error}\`)` plus a Vercel analytics event so the founder can see failure rates per error class.

- **P1-CF-2 · Xendit failure-redirect lands customer on bare checkout form with no message.**
  - **What customer sees today:** Xendit invoice expires or fails → Xendit redirects to `/checkout.html?plan=<tier>&error=failed` ([create-invoice-handler.ts:171](supabase/functions/_shared/create-invoice-handler.ts)). The `error=failed` URL param is **never read** by checkout.html ([grep:checkout.html for `searchParams`](checkout.html:777) only reads `plan` and `alwaysOn`). Customer is dropped on the fresh checkout form with the same prefilled tier but no acknowledgment that something just failed.
  - **What customer SHOULD see:** a calm banner above the form:
    > *"Pembayaran kamu belum selesai — link Xendit kadaluarsa atau ditolak. Coba bayar lagi dari sini, atau hubungi tim kalau berlanjut."*
  - With a "Hubungi tim via WhatsApp" CTA inline.
  - **Recovery action:** customer can re-attempt payment immediately; the prefilled tier means they don't have to re-select. The banner makes it clear the previous attempt is over and they're not in limbo.
  - **Telemetry gap:** founder has no signal of how many customers hit this — Xendit failure rate is invisible. Recommend a `console.log('[checkout] xendit_failed_return', {plan})` + Vercel analytics event.

- **P2-CF-1 · "Marketing opt-in" copy doesn't acknowledge frequency.**
  - **What customer sees today:** *"Saya bersedia menerima email pemberitahuan produk dan tips pemakaian (opsional, bisa unsubscribe kapan saja)."*
  - **What customer SHOULD see:** Same but with frequency clarity: *"Saya bersedia menerima email tips pemakaian dan update fitur (maksimum 1× per minggu, opsional, bisa unsubscribe kapan saja)."*
  - **Why:** premium feel ≈ predictable cadence. "Pemberitahuan produk" sounds like sales email to an Indonesian reader.
  - **Recovery action:** none needed (informational).

---

### Step 2 — /checkout → Xendit invoice

#### Customer journey today

1. Click "Bayar Sekarang".
2. Browser waits ~1–3 s for `create-invoice` Edge Function response.
3. On success: `window.location.href = data.invoice_url` → Xendit page.
4. On failure: error banner per Step 1 findings.

#### Findings

- **P2-CF-2 · "Mempersiapkan pembayaran…" has no max-time.**
  - **What customer sees today:** Button text swaps to *"Mempersiapkan pembayaran..."* and disables. If the Edge Function takes >5 s (cold start, Supabase region latency), customer waits indefinitely with no acknowledgment that things are slow.
  - **What customer SHOULD see:** after 4 s, swap the button label to *"Sebentar — siapkan link pembayaran kamu…"* and after 8 s, surface the error banner with *"Persiapan pembayaran sedang lambat. Coba lagi dalam 1 menit, atau hubungi tim via WhatsApp."*
  - **Recovery action:** customer can click the retry button or hit WA. Right now they just stare at an unchanging button.
  - **Telemetry gap:** no signal on slow-create-invoice events. Recommend Vercel analytics `checkout_create_invoice_slow` event when elapsed > 4 s.

---

### Step 3 — Xendit success webhook → customer record creation

#### Customer journey today

1. Customer completes payment on Xendit page.
2. Xendit redirects to `/welcome?cid=<uuid>`.
3. Meanwhile (async, may arrive before, after, or simultaneously with redirect): Xendit POSTs to `/functions/v1/xendit-webhook` with `status: PAID`.
4. Webhook handler: idempotent lookup → mark subscription `active` + `hosting_active=true` → wipe stale pair state (HF-1) → call provisioning `/spin-up` → on failure, park as `pending_provision`.
5. Receipt email sent best-effort via Resend (or stubbed in dev).

#### Findings

- **P1-CF-3 · "Pembayaran kamu belum tercatat" is a dead loop when webhook never arrives.**
  - **What customer sees today:** welcome.html `pollOnce()` returns null for the subscription row → after `NULL_GRACE_MS = 30_000` ms flips to state E ("Halaman ini hanya untuk konfirmasi pembayaran. Mungkin kamu salah link.") ([welcome.html:417](welcome.html), [welcome.html:605](welcome.html)). For a legitimate paying customer whose webhook is delayed past 30 s, this looks like a system rejection — the page literally says "wrong link."
  - **What customer SHOULD see:** distinguish "webhook in flight" from "invalid link" by **adaptive grace**:
    - 0–30 s: state A ("Sebentar — sedang memeriksa pembayaran kamu.")
    - 30–90 s: stay in state A, label changes to *"Konfirmasi pembayaran sedang lambat. Sebentar lagi…"* with a subtle progress dot.
    - 90 s+: if still no subscription row, escalate to a new state E2 with: *"Kami belum menerima konfirmasi pembayaran kamu. Cek email untuk struk dari Xendit — kalau strukmu sudah masuk tapi halaman ini belum berubah, hubungi tim via WhatsApp."* Plus prefilled WA link with cid.
    - State E (current copy) should ONLY fire when cid is missing/malformed entirely.
  - **Recovery action:** explicit WA path at the 90 s cliff, with structured cid + paid timestamp prefilled so founder can reconcile manually.
  - **Telemetry gap:** founder has no signal of webhook-never-arrived cases. Recommend a Supabase Edge Function `webhook-delivery-watchdog` (pg_cron) that flags subscriptions in `pending` status > 5 min old.

- **P2-CF-3 · Receipt email lacks "Return to your setup" CTA with cid.**
  - **What customer sees today:** receipt email body includes invoice ID, tier, total, payment method, refund-policy URL ([email-delivery.ts:236–263](supabase/functions/_shared/email-delivery.ts)). No link back to `/welcome?cid=<cid>`.
  - **What customer SHOULD see:** add a line above the closing:
    > *"Lanjutkan setup agent kamu di sini: https://weuseai-agent.vercel.app/welcome?cid=<cid>"*
  - **Why:** if customer loses the welcome.html tab (closed browser, switched device, link expired), email is the recovery path. Without the cid-embedded URL, they can't get back.
  - **Recovery action:** this IS the recovery action for the lost-cid problem.
  - **Telemetry gap:** Resend Click tracking should surface; recommend enabling Resend click webhook to see how many customers actually return via email.

- **P2-CF-4 · Failed `clearStalePairState` and `proactive-greeting` failures only go to console.**
  - **What customer sees today:** if the HF-1 wipe fails ([xendit-webhook-handler.ts:117–122](supabase/functions/_shared/xendit-webhook-handler.ts)) or the proactive greeting fails ([complete-onboarding-handler.ts:436](supabase/functions/_shared/complete-onboarding-handler.ts)), the failure is `console.error`'d only. Customer is unaffected (best-effort by design) but the founder won't know unless they tail logs.
  - **What customer SHOULD see:** no change for customer.
  - **Recovery action:** none customer-side.
  - **Telemetry gap:** these `console.error` calls should also push to a `support_tickets` table row with `kind='internal_warning'` + `severity='medium'`, OR fire a Telegram alert to the founder. Right now: silent in prod.

---

### Step 4 — /welcome polling (customer-progress-proxy + customer-readiness)

#### Customer journey today

1. Welcome.html boots with `?cid=<uuid>`.
2. State A (initial) for ~10 s while first `pollOnce()` (subscription status) + `pollReadinessProbe()` resolve.
3. If subscription is `pending`/`pending_provision`: probe runs. If no VPS row yet → state C ("Lengkapi profil agent"). If VPS row exists → state B with stage-aware label, progress bar, soft/hard escalation timers, and live setup-script tail.
4. On `status='active'`: state C (CTA to /onboarding) or C2 (CTA to Telegram, depending on `?job=` flag).
5. On `status='failed'`: state D (WA + email recovery CTAs).
6. Network errors during polling: state G ("Koneksi sedang lambat. Mencoba lagi…") — transient, recovers.

#### Findings

- **P1-CF-4 · Welcome timeout at TIMEOUT_MS = 15 min is wall-clock from page load, not from "you actually started waiting".**
  - **What customer sees today:** ([welcome.html:1116](welcome.html)) `if (Date.now() - startedAt > TIMEOUT_MS) renderState('F')`. `startedAt` is set once at page load and only reset on F-state "Cek lagi" click. If a customer paid 10 min ago, lost the tab, reopened welcome.html via email link — they have 15 min from THIS load. But if they paid 20 min ago and JUST opened welcome.html, they ALSO have 15 min — even though the system may have already given up.
  - **What customer SHOULD see:** the timer should be relative to `subscription.started_at`, not page load. If `now() - subscription.started_at > 15 min`, render state F immediately. If `subscription.status = 'pending_provision'` AND `now() - started_at > 5 min`, render state F with an explicit "tim sudah diberi tahu, hubungi kami untuk update."
  - **Recovery action:** F-state already shows WA CTA. The fix is to fire state F at the right time so the customer doesn't think things are still progressing when they aren't.
  - **Telemetry gap:** no signal of how many customers hit state F. Recommend `console.log('[welcome] state_F_reached', {cid, elapsedMinutes})` + Vercel analytics event.

- **P1-CF-5 · State E says "salah link" but customer has lost cid via legitimate means.**
  - **What customer sees today:** state E ([welcome.html:605](welcome.html)) — *"Halaman ini hanya untuk konfirmasi pembayaran. Mungkin kamu salah link, atau session-nya kadaluarsa."* The only CTA is "Kembali ke beranda" or footer WhatsApp link.
  - **What customer SHOULD see:** add an explicit "Sudah bayar tapi link hilang?" path:
    > *"Sudah bayar tapi link kamu hilang? Cek email — struk pembayaran berisi link ke setup. Atau hubungi tim — kami bantu pulihkan dengan email kamu."*
  - With a "Hubungi tim via WhatsApp" CTA that prefills *"Halo tim, saya sudah bayar tapi link onboarding hilang. Email pembayaran saya: [customer-fills]"*.
  - **Recovery action:** this is the recovery path for lost-cid. Combined with P2-CF-3 (receipt-email cid link), most customers self-recover.
  - **Telemetry gap:** none — once they're in state E they're not authenticated; no DB write to track.

- **P2-CF-5 · Dual stage label maps (STAGE_LABEL + STAGE_LABEL_DETAIL) can feel contradictory.**
  - **What customer sees today:** state-B shows the main stage label (e.g., *"Memasang otak agent…"* from `STAGE_LABEL.hermes_starting`) AND below it a finer "setup-script tail" overlay (e.g., *"Memasang otak agent (proses paling lama, sekitar 3–6 menit)…"* from `STAGE_LABEL_DETAIL.hermes_install`). Same text or near-same text repeated twice.
  - **What customer SHOULD see:** collapse to one label per moment. Either (a) drop the granular overlay and rely on the structured stages, OR (b) use the granular overlay AS the main label and drop the structured label (since it's coarser). Recommend (a) — the structured stages are deterministic from the probe; the setup-script tail can flap on every poll.
  - **Recovery action:** none customer-side.
  - **Telemetry gap:** none.

- **P2-CF-6 · Stage progress bar can backtrack on probe race.**
  - **What customer sees today:** if a probe momentarily returns a regressed `stages_completed.length` (e.g., the readiness check briefly fails between two successful runs), the bar visibly shrinks. Cognitive dissonance.
  - **What customer SHOULD see:** monotone progress bar — `Math.max(currentFill, newFill)` instead of `newFill`. The bar should only ever advance.
  - **Recovery action:** none.
  - **Telemetry gap:** none.

- **P2-CF-7 · Soft escalation 1.5× / hard escalation 3× fires too eagerly with provider failover.**
  - **What customer sees today:** `expected_current_stage_duration_seconds.vps_provisioning = 240` ([customer-readiness-probe.ts:117](services/provisioning/src/routes/customer-readiness-probe.ts)). The Vultr→DO failover path doubles this in the worst case. Customer hits soft hint at 360 s into a 480-s legitimate provision.
  - **What customer SHOULD see:** expected duration should account for the failover budget — recommend 360 s for vps_provisioning (1.5× the single-provider time) so the soft hint fires at 540 s (9 min) and hard hint at 18 min, matching the realistic provisioning ceiling.
  - **Recovery action:** none customer-side.
  - **Telemetry gap:** founder doesn't see escalation-rate metrics. Recommend `support_tickets` insert when hard escalation fires.

- **P3-CF-1 · No "What's happening behind the scenes" expandable explainer.**
  - **What customer sees today:** stage labels are clear ("Menyiapkan sistem infrastruktur…") but customer doesn't know WHY this takes ~6 min.
  - **What customer SHOULD see:** small expandable accordion below the progress bar:
    > *▾ Apa yang sedang terjadi?*
    > 
    > *Kami menyiapkan infrastruktur khusus buat agent kamu — bukan shared, bukan generic. 5 langkah, totalnya sekitar 6 menit:*
    > 
    > *1. Menyalakan sistem dedicated di Singapura (~3 menit)*
    > *2. Memasang otak agent dan dependensi (~2 menit)*
    > *3. Memuat kepribadian dan skill bundle yang sesuai paket kamu*
    > *4. Menyambungkan ke Telegram kamu*
    > *5. Pengecekan terakhir, lalu agent kamu siap*
    > 
    > *Kamu boleh tutup tab — agent tetap dibangun di latar belakang. Tapi halaman ini ngasih update real-time, jadi enak buat ditunggu.*
  - **Why:** premium trust signal. Customer who reads it leaves the tab open. Customer who doesn't doesn't lose anything.
  - **Recovery action:** none.
  - **Telemetry gap:** track expansion clicks via Vercel analytics for engagement metrics.

- **P3-CF-2 · No micro-content during 6-min wait (sample personality, use-cases, social proof).**
  - **What customer sees today:** the wait is functionally a single screen with stage labels + escalation tiers. Nothing to read.
  - **What customer SHOULD see:** below the progress card, a passive marquee of:
    - 3 sample first-message ideas keyed to the customer's tier (e.g., for Starter: *"Coba: kirim 'briefing pagi'. Atau 'rangkum artikel ini: <url>'."*)
    - 1 short paragraph on agent capabilities at their tier
    - Founder note in Indonesian (1 paragraph max): *"Dibuat di Jakarta untuk pengguna Indonesia. Pertanyaan teknis langsung ke saya: kidnovell.richie@gmail.com — Richie"*
  - **Why:** premium feel ≈ wait is anticipation, not anxiety. Customer learns about the product during the wait.
  - **Recovery action:** none.
  - **Telemetry gap:** none.

---

### Step 5 — VPS provisioning (Vultr spin-up + DO failover)

#### Customer journey today

1. xendit-webhook handler calls Fly `/spin-up` with customer_id + tier.
2. Provisioning service: Vultr first; on capacity error, retry on DigitalOcean SGP1.
3. Both providers fail → subscription parked as `pending_provision`, founder Telegram alerted, customer sees state B → eventual state F at 15 min.
4. Either succeeds → vps_instances row written, IP allocated, cloud-init starts setup-script.

#### Findings

- **P1-CF-6 · No automated retry on `pending_provision`.**
  - **What customer sees today:** xendit-webhook comment says *"Subscription marked pending_provision — retry worker should pick up."* ([xendit-webhook-handler.ts:179](supabase/functions/_shared/xendit-webhook-handler.ts)). **There is no retry worker.** Customer waits indefinitely. Founder gets one Telegram alert and is expected to manually re-trigger provisioning.
  - **What customer SHOULD see:** Phase 1 — explicit acknowledgment of the deferred-retry status:
    > *"Server VPS lagi penuh. Agent kamu dijadwalkan ulang otomatis — kami coba lagi setiap 3 menit. Kalau dalam 30 menit belum berhasil, tim kami hubungi kamu via email. Stay di halaman ini atau cek email untuk update."*
  - Phase 2: ship the retry worker (per pass-2 P1-5).
  - **Recovery action:** Phase 1 — manual founder-triggered retry. Phase 2 — pg_cron Edge Function `retry-pending-provisions` that scans subscriptions in `pending_provision` state, calls `/spin-up`, exponential backoff cap at 6 retries (~30 min total).
  - **Telemetry gap:** founder gets one alert per failure. Recommend daily summary email of all `pending_provision` subscriptions older than 30 min that didn't recover.

- **P2-CF-8 · Vultr+DO double-capacity-fail customer-message says "Server VPS lagi penuh".**
  - **What customer sees today:** onboarding.html ([line 1838](onboarding.html)) — *"Server VPS lagi penuh. Ini bukan kesalahan kamu — coba refresh halaman ini dalam 5–10 menit, atau hubungi tim di WhatsApp."* Uses "VPS" — a backend tech name visible to customer.
  - **What customer SHOULD see:** *"Sistem infrastruktur sedang ramai. Ini bukan kesalahan kamu — biasanya selesai dalam 5–10 menit. Refresh halaman atau hubungi tim via WhatsApp kalau masih ramai."*
  - **Recovery action:** same — refresh or WA.
  - **Telemetry gap:** capacity-error-rate not tracked in customer-visible metrics. Founder logs only.

---

### Step 6 — Hermes install + persona bundle fetch

#### Customer journey today

1. Cloud-init runs setup-script on VPS.
2. Setup-script installs apt packages, Hermes binary, OpenRouter sub-key, SOUL.md, bundle-pull script.
3. Setup-script writes a heartbeat file every 30 s; customer-progress endpoint exposes this.
4. Hermes-gateway systemd unit starts; `ExecStartPre=weuseai-bundle-pull` runs the bundle-pull script which downloads tier-allowed persona bundles from Storage.
5. Hermes begins polling Telegram for the customer's bot.

#### Findings

- **P2-CF-9 · Bundle-pull failures are logged on the VPS, not surfaced to the customer.**
  - **What customer sees today:** bundle-pull script has `set -u` but `set -e` OFF — failure exits 0 so Hermes still boots ([bundle-pull-script.ts:50](services/provisioning/src/bundle-pull-script.ts)). A failed bundle pull means the persona slug doesn't get installed, but Hermes boots with minimal bootstrap. Customer sees `/start` work but `/<persona>` returns "skill not found" or generic.
  - **What customer SHOULD see:** post-pair greeting should call out which personas successfully installed:
    > *"Halo {nama}, agent kamu sudah aktif. Skill yang siap dipakai: /the-pro, /doc-expert, /slide-master. Coba kirim /the-pro untuk mulai."*
  - And if some failed, hide them silently and add a footnote in the welcome page after pairing: *"Beberapa skill masih dimuat. Akan muncul otomatis dalam 5 menit."*
  - **Recovery action:** Hermes auto-retries on next boot. If a customer reports a missing persona, founder can manually `systemctl restart hermes-gateway` via `/restart-hermes`.
  - **Telemetry gap:** `bundle_pull_attempts` table captures this; recommend a daily founder summary of customers with > 3 failed pulls.

- **P3-CF-3 · setup-script log lines are technical Bahasa-mix.**
  - **What customer sees today:** progress overlay surfaces last 10 lines of setup-script log. Log uses Bahasa-Inggris mix (`✓ apt-get update done`, `✗ failed to fetch`) — the overlay reads as "behind the scenes" but is unstructured.
  - **What customer SHOULD see:** keep the structured inferred_stage label visible; collapse the log tail under a smaller "Detail teknis" expandable. Customer who wants the detail can expand; default-view is calm.
  - **Recovery action:** none.
  - **Telemetry gap:** none.

---

### Step 7 — BotFather creds capture → bot live

#### Customer journey today

1. Welcome.html state C → /onboarding?cid=<uuid>.
2. Step 1: confirm WA number, prefilled or fresh.
3. Step 2: BotFather walkthrough — paste token from @BotFather → validate-bot-token Edge Function calls `getMe` + sets webhook → persists encrypted.
4. Step 3: 6-digit pairing code displayed; customer DMs `/start` then `/pair <code>` to their own bot.
5. Pair webhook fires on bot, writes `telegram_chat_id` to customers row.
6. Onboarding.html polls customer row; on `telegram_chat_id` non-null → setStep('4').

#### Findings

- **P1-CF-7 · Pair-code expiry copy doesn't reassure customer they did nothing wrong.**
  - **What customer sees today:** when 30-min code expires: *"Kode kadaluarsa."* + button *"Mulai ulang"* ([onboarding.html:1642](onboarding.html)).
  - **What customer SHOULD see:** *"Kode pasangan kadaluarsa otomatis setelah 30 menit untuk keamanan. Mulai ulang untuk dapat kode baru — cepat, sekitar 5 detik."* with the same button.
  - **Recovery action:** same — Mulai ulang regenerates.
  - **Telemetry gap:** none.

- **P2-CF-10 · "Sedang lambat" pair-code soft-timeout copy doesn't surface support link.**
  - **What customer sees today:** ([onboarding.html:698](onboarding.html)) — *"Sedang lambat — coba refresh halaman, atau hubungi support kalau tidak muncul juga."* — but "support" isn't a link or contact info.
  - **What customer SHOULD see:** *"Sedang lambat — refresh halaman, atau [hubungi tim via WhatsApp](https://wa.me/...) kalau tetap kosong."*
  - **Recovery action:** same — refresh or WA.
  - **Telemetry gap:** none.

- **P2-CF-11 · Bot-token validation generic "internal" error gives no recovery info.**
  - **What customer sees today:** validate-bot-token handler returns `{error: 'internal'}` on Telegram API exception (network, 5xx, getMe non-JSON). Onboarding.html falls through to the generic "Token tidak valid. Cek lagi di @BotFather." ([onboarding.html:1467](onboarding.html)) — which is wrong; the token might be fine, the network is the problem.
  - **What customer SHOULD see:** distinguish:
    - `invalid_token` → *"Token belum benar. Cek lagi di @BotFather, lalu paste ulang."*
    - `internal` (network/5xx) → *"Koneksi ke Telegram lagi sibuk. Tunggu 30 detik, lalu klik 'Validasi token' lagi."*
    - `webhook_setup_failed` → already differentiated, copy is fine.
  - **Recovery action:** retry button; surface WA after 2 consecutive `internal` errors.
  - **Telemetry gap:** validate-bot-token error distribution isn't tracked; founder won't see if BotFather has an outage. Recommend Vercel analytics event.

- **P3-CF-4 · Pair-code copy button has no failure feedback.**
  - **What customer sees today:** "Salin" button on `/pair <code>` — copies to clipboard. If clipboard API denied (browser permission, iOS Safari corner case), customer sees nothing.
  - **What customer SHOULD see:** brief inline confirmation *"Tersalin"* on success; on failure, change to *"Salin manual"* and select the text for the user.
  - **Recovery action:** customer can long-press / select text manually.
  - **Telemetry gap:** none.

---

### Step 8 — First /start in Telegram → first /<persona> response

#### Customer journey today

1. Customer paired → onboarding step 4 (expectations) → submit → complete-onboarding handler.
2. Complete-onboarding: spinUp (idempotent if already provisioned), refreshEnv (push bot token + LLM keys + SOUL.md), proactive-greeting (call OpenRouter to generate in-character greeting, send via customer's bot to their chat).
3. Customer redirected to welcome.html state C2 → CTA *"Buka Telegram @{username}"*.
4. Customer opens bot, sees proactive greeting message that arrived ~30 s ago.
5. Customer types first message or uses `/<persona>` slash command.

#### Findings

- **P2-CF-12 · Proactive-greeting LLM-fallback text is identical for every customer.**
  - **What customer sees today:** ([proactive-greeting.ts:163](supabase/functions/_shared/proactive-greeting.ts)) — fallback `Halo {nama}, agent kamu sudah aktif dan siap membantu.` (when LLM call fails or times out).
  - **What customer SHOULD see:** add 1–2 example slash commands matched to their tier and a sample first interaction:
    > *"Halo {nama}, saya agent kamu. Saya sudah siap.*
    >
    > *Coba kirim:*
    > *• /the-pro — gua bantu tugas harian, briefing, follow-up*
    > *• /doc-expert — gua rangkum dokumen, baca PDF, ekstrak data*
    > *• /slide-master — gua bikin deck dari outline kamu*
    >
    > *Atau langsung tulis aja apa yang kamu butuhkan."*
  - **Why:** the fallback is the customer's first agent message — should be premium, not generic.
  - **Recovery action:** none.
  - **Telemetry gap:** how often does the LLM path succeed vs fall back? `console.log` only. Recommend a `proactive_greeting_outcomes` lightweight insert.

- **P2-CF-13 · `/start` to the bot before pairing complete returns silence.**
  - **What customer sees today:** if customer DMs the bot `/start` before sending `/pair`, the bot silently does nothing. Onboarding.html has a hint *"Klik /start di bot dulu, baru kirim:"* ([onboarding.html:738](onboarding.html)) but it's a small hint. Customer who misses it sees an unresponsive bot and bounces.
  - **What customer SHOULD see:** the pair webhook should respond to `/start` (BEFORE pair) with a friendly placeholder:
    > *"Halo. Bot kamu sudah aktif tapi belum di-pair. Kembali ke halaman setup di browser, salin kode 6-digit, lalu kirim ke saya: /pair 123456."*
  - **Recovery action:** customer sees what to do without leaving Telegram.
  - **Telemetry gap:** "stranded /start" events not tracked.

- **P3-CF-5 · First `/<persona>` response has no "what can I do" affordance.**
  - **What customer sees today:** customer types `/the-pro` — Hermes loads The Pro persona and replies in-character. Premium experience IF the customer knows what to ask. If not, the agent might be brilliant but the customer doesn't know what to try.
  - **What customer SHOULD see:** the proactive-greeting template (per P2-CF-12 above) handles this — surfacing 2–3 starter prompts in the greeting message preempts the silence.
  - **Recovery action:** none.
  - **Telemetry gap:** track persona slash usage in Hermes-side telemetry (out of scope for this audit).

---

## Cross-cutting — /welcome trust signals during 6-min wait

| Trust signal | Status today | Recommendation |
|---|---|---|
| Step-by-step timeline named in premium Bahasa | ✅ STAGE_LABEL has 6 stages in premium BI | — |
| Progress bar feels alive | ✅ pulse-dot animation + progress-fill | — |
| Stage transitions smooth (no jumping) | ⚠️ progress bar can backtrack on probe race | **P2-CF-6**: monotone fill |
| Each phase named in customer-grokkable BI, no backend names | ⚠️ "Server VPS" leaks in onboarding capacity-fail copy | **P2-CF-8**: rephrase to "sistem infrastruktur" |
| Soft escalation ("lebih lama dari biasanya") | ✅ at 1.5× expected stage duration | — |
| Hard escalation (explicit WA CTA with prefilled context) | ✅ at 3× expected stage duration with cid + stage in WA message | **P2-CF-7**: tune duration constants for failover budget |
| "What's happening" expandable explainer | ❌ not present | **P3-CF-1**: add accordion |
| Fallback "longer than usual" path | ✅ state F at TIMEOUT_MS, hard escalation tier inline in state B | **P1-CF-4**: timer relative to `subscription.started_at` |
| Honest copy (no false email-notify promises) | ✅ "Stay di halaman ini" per Track 2 honesty fix | — |
| Sample content / social proof during wait | ❌ empty wait, no entertainment | **P3-CF-2**: micro-content marquee |
| Footer trust signal (founder name, contact) | ❌ on checkout.html, missing on welcome.html | **P3-CF-6**: mirror to welcome.html |

**Step 4 jumping (welcome state-B):** ✅ FIXED. The pre-2026-05-12 issue where state-B's stage progress flickered between probe races is mitigated by `currentStageStartedAt` reset on `lastSeenStage` change ([welcome.html:724](welcome.html)). The remaining concern is monotone fill (P2-CF-6), not state jumping.

**Step 4 jumping (onboarding):** ✅ FIXED. The pre-2026-05-12 issue where Step 1 rendered then immediately swapped to Step 4 is fixed: `boot()` evaluates the resume rule BEFORE first render ([onboarding.html:1872–1929](onboarding.html)). Verified.

---

## Cross-cutting — Orphan / re-entry / silent-failure patterns

| Pattern | Status today | Recovery |
|---|---|---|
| Customer pays + closes tab before welcome.html loads | ✅ Xendit success-redirect URL contains cid; customer can return | — |
| Customer pays + loses cid (cleared history, switched device) | ❌ **P1-CF-5** + **P2-CF-3** — no email-with-cid recovery | Add cid link to receipt email; expand state E |
| Customer pays + spinUp double-capacity-fails | ⚠️ **P1-CF-6** — pending_provision parked, no auto-retry | Phase 1: explicit copy. Phase 2: retry worker |
| Customer reuses email after refund/clean-wipe | ✅ HF-1 wipes stale pair state on every PAID transition | — |
| Customer reuses email + lands mid-flow on welcome.html | ⚠️ multiple subscriptions per customer.id — welcome SELECTs latest by `started_at desc` (limit 1). OK for one-at-a-time, racy if customer has overlapping subs | Document explicit constraint; reject overlapping subs at create-invoice |
| Customer pays + bounces before /onboarding profile | ✅ welcome.html state C surfaces "Lengkapi profil" CTA on resume | — |
| Customer completes step 1 (WA) + bounces before step 2 (bot) | ✅ boot routes to Step 2 via resume rule | — |
| Customer completes pairing + bounces before step 4 | ✅ boot routes to Step 4 via resume rule (whatsapp_number + chat_id + bot_username gate) | — |
| Customer types `/start` to bot before pairing | ⚠️ **P2-CF-13** — silent bot response | Add pre-pair `/start` reply |
| Hermes install hangs >15 min (no heartbeat for 2 min) | ✅ heartbeat-stale flag in customer-progress + hard escalation tier; alert founder via Telegram | Verify alert path actually fires |
| Vultr provisioned but customer never opens welcome.html again | ⚠️ orphan resource — no cleanup unless founder runs `scripts/cleanup-orphan-vms.ts` | Document founder cron; Phase 3 automate |
| Bot token capture failure | ✅ retry via "Validasi token" button; multiple error codes mapped | **P2-CF-11**: distinguish `internal` from `invalid_token` |
| Pair-code expires before customer opens Telegram | ✅ "Mulai ulang" button | **P1-CF-7**: reassurance copy |
| Customer pays + welcome.html shows state E for 30 s before webhook | ⚠️ **P1-CF-3** — NULL_GRACE_MS = 30s; extend with adaptive grace + better state E2 copy | Adaptive grace tier |

---

## Telemetry recommendations (consolidated)

Founder visibility into prod failures is low today. Recommend:

1. **Vercel analytics events** at customer-visible failure boundaries:
   - `checkout_submit_failed` with `error_code`
   - `checkout_xendit_failed_return` with `plan`
   - `checkout_create_invoice_slow` (>4 s)
   - `welcome_state_F_reached` with `elapsed_minutes`
   - `welcome_null_grace_expired` (customer hit the 30-s+ no-subscription cliff)
   - `welcome_hard_escalation_fired` with `stage`
   - `onboarding_bot_token_internal_error`
   - `onboarding_capacity_error_shown`

2. **Supabase Telegram alerts** for founder-blocking events:
   - `pending_provision` subscription unresolved for > 30 min (cron job)
   - `clearStalePairState` failed
   - `proactive_greeting` LLM-path failed > 50% rate in last hour
   - validate-bot-token returning `internal` > 20% rate in last hour

3. **`support_tickets` table inserts** for customer-affecting silent failures so the founder has a queue to triage:
   - bundle-pull failure ≥ 3 attempts for same persona
   - hard-escalation tier fired (customer waiting > 18 min)
   - capacity-error path fired

---

## Hand-off to Sesi A — prioritized fix list

### P1 (must fix before next paying customer cycle)

1. **P1-CF-1** Bahasa error mapping on checkout submit. ~30 LOC.
2. **P1-CF-2** Surface `?error=failed` on checkout return. ~20 LOC.
3. **P1-CF-3** Adaptive grace + state E2 for delayed-webhook. ~40 LOC.
4. **P1-CF-4** TIMEOUT_MS relative to `subscription.started_at`. ~10 LOC.
5. **P1-CF-5** Lost-cid recovery path in state E. ~20 LOC.
6. **P1-CF-6** Phase 1 — copy fix on pending_provision messaging. ~10 LOC. Phase 2 — retry worker (pass-2 P1-5 still deferred, but copy fix unblocks now).
7. **P1-CF-7** Pair-code expiry reassurance copy. ~5 LOC.

### P2 (degraded UX, pre-launch nice-to-have)

8–14. See per-finding sections. Each is 5–30 LOC.

### P3 (polish)

15–21. See per-finding sections.

### Telemetry (separate cascade, can ship in parallel)

22. Add Vercel analytics events list per section above.
23. Add Telegram alert cron for founder.
24. Add `support_tickets` auto-inserts for silent failures.

---

## Closing

The customer flow is functionally complete and the major auth/RLS gaps closed in pass-2/3 hold. The remaining work is **closing the seams** — places where one system hands off to another and the customer-visible failure mode is silence or jargon.

**Highest-leverage fixes**:
- Receipt email cid link (P2-CF-3) — closes the lost-cid recovery loop with one line.
- Pending_provision copy (P1-CF-6 Phase 1) — converts an indefinite wait into a 30-min explicit timeline with WA path.
- Bahasa error mapping (P1-CF-1) — premium voice now broken at every server-side rejection.

Pass-2 ToS consent doc gap predicts an Indonesian regulatory deadline; pass-3 was about cross-customer leaks. This pass-1 of customer-flow-hardening is about how the system FEELS when something goes wrong. Most customers won't trigger any of these paths — but the ones who do are the ones who escalate, share screenshots, ask for refunds. Closing the seams pays back at the support boundary.

Hand-off to Sesi A. Founder priority is the P1 cascade above; P2 + P3 + telemetry can dispatch in parallel.
