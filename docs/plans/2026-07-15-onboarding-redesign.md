# Onboarding redesign (agent-creation page) — build plan

Branch `onboarding/redesign-tarot`. Migrate `Onboarding.dc.html` → the new agent-creation page, same playbook as the landing/checkout: **use the design, graft in every real system call, keep it pixel-faithful.** The design is PURE UI (0 system calls) — all wiring comes from the current `onboarding.html` (2,377 lines).

## Done (scaffold)
- `onboarding-new.html` = the design file, runtime vendored (`/assets/vendor/dc-support.js`, no CDN/`./support.js`), card art repointed to `/assets/cards/*.png`.
- `assets/cards/` created with a README; drop the 6 founder PNGs there (`sentinel/rainmaker/muse/alchemist/scribe/magician.png`).

## The 4 screens (design state: `step 0..3`, + `cfgMode: template|detail`, `tpl`, `flips`, `persona`)
0. **Welcome** — payment-success + "what happens" (BotFather → token → pair). Pure UI.
1. **Buat bot** — paste bot token → **`validate-bot-token`**.
2. **Pasangkan Telegram** — pairing code + `/pair` → **`rotate-pairing-code`** + poll pairing status.
3. **Configure** — template picker (6 tarot cards) OR detail mode → **`complete-onboarding`**.

## System wiring to GRAFT from onboarding.html (the meaty part — NOT yet done)
Constants: `SUPABASE_URL='https://gtjgsligllbjcisiyrah.supabase.co'`, anon key; `cid` from `?cid=`. Every call carries `X-CID: cid`.
1. **On load:** `customer-onboarding-info` (X-CID) → get tier, display_name, bot username; `customers`/`subscriptions` REST reads. If no/invalid cid → the design's error screen.
2. **Screen 1:** POST `validate-bot-token` `{customer_id, bot_token}` → on ok advance to step 2; map errors to the design's inline states.
3. **Screen 2:** `rotate-pairing-code` → render the 6-digit code into the flip-tiles + expiry; poll pairing status (the current `/pair` confirm loop) → advance to step 3 on paired.
4. **Screen 3 submit:** POST `complete-onboarding` `{customer_id, agent_slug, expectations_text, whatsapp?, display_name?}`. **`agent_slug` MUST be in `personasForTier(tier)`** or it 403s `tier_does_not_grant_persona` — see gating below.

## Tarot template → real backend (CONFIRMED mapping)
Each card resolves to `(agent_slug, expectations_text preset)`:
| Card | agent_slug | expectations_text (Bahasa, brand voice) |
|---|---|---|
| I Sentinel | `business-agent` | Balas chat pelanggan otomatis, kirim link pembayaran, ingat riwayat tiap pelanggan. |
| II Rainmaker | `business-agent` | Follow-up tiap lead, nurturing sampai closing, update pipeline. |
| III Muse | `social-conductor` | Caption dan hook sesuai brand voice, ide konten harian. |
| IV Alchemist | `the-pro` | Rapikan cashflow, ringkasan keuangan mingguan, tandai pengeluaran janggal. |
| V Scribe | `doc-expert` | Transkrip dan notula rapat, action items, draft slide. |
| VI Magician | `the-pro` | Serba bisa: riset, dokumen, jadwal, tugas harian. |

Detail-mode personas (Asisten Umum/Content Creator/Sales Closer/Analis Finance) → map to the-pro/social-conductor/business-agent/the-pro respectively; the free-text goes to `expectations_text`.

## Tier-gating (DEFAULT: lock ungranted with upsell — confirm with founder)
Compute `granted = personasForTier(tier)`. A template card is enabled only if its `agent_slug ∈ granted`; else render it locked (dim + a small "Upgrade" pill) so a Solo customer (the-pro/doc-expert/slide-master → Alchemist/Scribe/Magician enabled; Sentinel/Rainmaker/Muse locked) never submits a slug their tier rejects. Verify the done-for-you "Pro set" (8) includes business-agent + social-conductor so all 6 unlock there; library-full = all 6.

## Verify (before swapping onboarding.html → this)
- Local: `python3 -m http.server` from repo root, DC runtime renders all 4 screens, `?flag`/mock the fetches; Playwright 1440 + 390, 0 console errors, assert each screen's CTA + the template flip + the lock states.
- Real: run against a real `cid` (a G6 test-run customer) end-to-end — token validate → pair → complete-onboarding → provisioning greet. This is the CRITICAL post-payment flow; do NOT swap `onboarding.html` until a real cid completes it.
- Keep `onboarding-new.html` as the preview until verified; then swap to `onboarding.html` (welcome.html + the funnel route may also need updating).

## Open
- Founder to provide the 6 card PNGs (folder path) → drop in `assets/cards/`.
- Confirm tier-gating = lock+upsell vs hide.
- The design merges welcome + onboarding into one flow — decide whether `welcome.html` (the provisioning-status page) stays separate or folds in.
