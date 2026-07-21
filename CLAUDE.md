# CLAUDE.md — Working brief untuk Claude Code

**Project:** weuseai.agent — managed Hermes agent hosting untuk pelanggan Indonesia. MyClaw-style flow, IDR pricing, Telegram delivery, 5-menit setup.

**Status:** Production live di `weuseai-agent.vercel.app`. Platform stack end-to-end validated as of 2026-05-13 (Richie's richiebot + Renita's bot both spun up + paired). Pass-3 security cascade shipped (PR #91/#92/#93/#94). Agent runtime pakai upstream NousResearch/hermes-agent — bukan custom build.

**Production state (live as of 2026-05-13):**
- **Landing:** `weuseai-agent.vercel.app` — main `d7c48ae`
- **Per-customer VPS:** Vultr Singapore `vc2-1c-1gb` ($5/mo) provisioned via Vultr API. DigitalOcean SGP1 as failover when Vultr capacity exhausted.
- **Provisioning service:** Fly.io `weuseai-provisioning` (region `sin`, shared-cpu-1x / 256MB)
- **Payments:** Xendit currently in TEST mode (founder lock-in 2026-05-14 — Phase F runs on test-mode through unlock; first real-money customer post-rotation doubles as prod-mode validation). `XENDIT_API_KEY` Supabase secret is `xnd_development_*`; rotate to `xnd_production_*` to go live. Smoke Step 7 explicitly fails on `checkout-staging.xendit.co` so the test-mode state is never silently masked.
- **Agent personas:** 10-persona library (`tier-personas.ts` is single source of truth). v1.4 feature-bundle tiers: bare 0 / solo 3 / voice-starter 3 / done-for-you 8 / library-full 10 / enterprise custom (old slugs aliased — see Business model v1.4). The Pro is the default-persona invariant across every non-null, non-empty persona list (bare is persona-free).
- **Telegram delivery:** per-customer bot, customer supplies bot token at onboarding.

**Prioritas urut:** Lihat `NEXT.md`. Kerjain dari atas, jangan skip. Stop kalau task gagal — lapor + tunggu input founder.

---

## Repo structure (updated 2026-05-13)

```
weuseai.agent/velorah/
├── index.html / checkout.html / use-cases.html  # landing live di Vercel
├── welcome.html / onboarding.html               # post-payment funnel
├── terms.html / privacy.html / refund-policy.html / contact.html
├── assets/                                          # landing images, fonts, og-image
├── vercel.json                                      # vercel routing for landing
├── services/                                        # platform backend
│   ├── provisioning/   # Express server on Fly.io; spawns Vultr SGP VPSes
│   │                   # via Vultr API, DigitalOcean SGP1 failover
│   ├── proxy/          # Cloudflare Worker, LLM routing for Starter tier
│   ├── hermes/         # Reference docs / cloud-init for upstream Hermes install
│   └── payment/        # IPaymentProvider abstraction (mock + Xendit adapter)
│   # services/test-idcloudhost/ deleted 2026-05-13 (PR #90) — IDCH adapter retired
├── packages/
│   ├── observability/  # shared logging primitives
│   └── shared/         # (placeholder) brand tokens, shared types
├── supabase/
│   ├── migrations/     # SQL migrations, applied via Supabase Mgmt API
│   └── functions/      # live Edge Functions: xendit-webhook, create-invoice,
│                       # complete-onboarding, bundle-fetch, customer-progress-proxy,
│                       # customer-readiness, workflow-execute, bundle-pull-record,
│                       # tier-bump, restart-hermes, +others
├── docs/
│   ├── 04-Liren-Stand-Strategy.md     # apa + kenapa
│   ├── 05-One-Click-Build-Plan.md     # gimana, day-by-day
│   ├── 06-Research-Preview.md         # context tech decision
│   ├── audit/                          # security audits (Sesi D output)
│   ├── design/                         # design specs (Vultr migration, etc.)
│   ├── investigation/                  # incident postmortems
│   └── plans/                          # phase specs
├── tests/
│   # ~1400 tests across handler unit tests, source-grep drift gates,
│   # docker-harness scenarios, e2e mocks. tests/pass-3-regression-suite.spec.ts
│   # is the security-contract runbook (PR #94).
├── CLAUDE.md           # ← ini (root brief, baca dulu)
├── CLAUDE.md.platform  # archived liren-stand brief, reference only
├── NEXT.md.platform    # archived task queue, reference only
├── package.json        # workspace root, name=weuseai-agent
└── tsconfig.json       # root tsconfig (covers tests/)
```

Landing files dan platform satu monorepo. `services/*` dan `packages/*` di-link via npm workspaces.

---

## Business model (LOCKED v1.4, 2026-06-09 — entry tiers + launch framing)

**Setup fee one-time + Hosting fee monthly + Optional Always-On + BYOK LLM ongoing.**

### Pricing structure (v1.4 — 6-tier feature matrix)

v1.4 (customer research showed price sensitivity) adds two cheaper entry
points and reduces the two mid tiers. Still a feature MATRIX, not a ladder:
`library-full` carries MORE personas (10) than the pricier `done-for-you`
(8), because `done-for-you` trades persona breadth for the web_app unlock.

| Tier slug | Label (id) | Personas | Voice | Setup (IDR) | Hosting/bln | Features {voice, web_app, custom_build} | Contact |
|---|---|---|---|---|---|---|---|
| `bare` | Bare Agent | none (vanilla Hermes) | ✗ | 99.000 | 99.000 | {✗, ✗, ✗} | no |
| `solo` | Solo Starter | 3 (the-pro, doc-expert, slide-master) | ✗ | 399.000 | 99.000 | {✗, ✗, ✗} | no |
| `voice-starter` | Voice Starter | 3 (same 3) | ✓ | 599.000 | 99.000 | {✓, ✗, ✗} | no |
| `library-full` | Library Lengkap | all 10 | ✓ | 799.000 (anchor ~~2.200.000~~, real post-batch) | 99.000 | {✓, ✗, ✗} | no |
| `done-for-you` | Siap Pakai | 8 (Pro set) | ✓ | 1.299.000 | 99.000 | {✓, ✓, ✗} | no |
| `enterprise` | Enterprise | custom | ✓ | quote | quote | {✓, ✓, ✓} | yes |

Price history: `voice-starter` 699→599, `library-full` 899→799 (v1.4).
The `library-full` **2,2jt is the REAL post-batch price** (`setup_fee_anchor_idr`,
2_200_000 — founder decision 2026-07-16, raised from the old 999k display anchor):
shown as a strikethrough today and GENUINELY charged once 1.000 paid customers
are reached. Below the batch limit the charged amount is `setup_fee_idr` (799k);
at/after it, `create-invoice` charges the 2,2jt anchor (see Launch FOMO below).

Always-On (+Rp 49rb/bulan) opsional unchanged across tiers (VPS 24/7,
skip auto-suspend). `the-pro` is the default-persona-at-index-0 invariant
in every **non-null, non-empty** persona list — `bare` is intentionally
persona-free (`personas: []`) and exempt.

**`bare` provisioning:** vanilla Hermes — emits an EMPTY `WEUSEAI_AGENT_SLUGS`
(bundle-pull installs nothing), a neutral SOUL (no The Pro identity), and no
voice config. DeepSeek model pin (PR #223) applies. **Provisioning slug
handling:** persona + voice resolve from the REAL canonical slug; VPS spec +
LLM budget collapse to a spec-class via `resolveTierToSpecClass()`
(bare/solo/voice-starter → smallest box + $3). `/spin-up` `VALID_TIERS` now
accepts all canonical non-enterprise slugs + legacy (the lossy `bare→starter`
checkout alias the consult proposed was REJECTED — it would mis-provision
bare/solo).

**Launch FOMO (honesty lock — UPDATED 2026-06-18):** the scarcity counter
MUST read a REAL subscription count (`/api/public/subscription-count`,
`paid_customers`); the landing banner renders NOTHING if the fetch fails —
NEVER fabricate a number. **Price-rise is REAL (founder decision 2026-06-18,
raised to 2,2jt 2026-07-16):** `library-full` setup genuinely rises from
Rp 799rb → Rp 2,2jt after the first 1.000 paid (the 2_200_000
`setup_fee_anchor_idr` is the real post-batch price). So "setup Premium naik ke
Rp 2,2jt setelah 1.000 pertama" is an HONEST forward-looking claim (supersedes
the old "prices do not rise" lock for this tier). **WIRED:** `create-invoice`
flips the library-full charge 799→anchor once `paid_customers ≥ 1000`
(`LIBRARY_FULL_BATCH_LIMIT`, fail-open to launch price on count error — never
overcharge); `tests/create-invoice-price-flip.spec.ts` pins base 799k below the
limit and the 2,2jt anchor at/after it. Still NEVER invent a fake time-deadline
("harga naik dalam MM:SS") — the rise is tied to the batch count, not a clock.

`enterprise` is contact-only (no fixed persona set, no fixed fee) — it is
NOT provisionable via the manual-provision form or any self-serve
checkout; it routes to the sales flow (mailto / WhatsApp).

Source of truth: `supabase/functions/_shared/tier-personas.ts` (`TIERS`)
→ mirrored to `api/_shared/tier-catalog.ts` + `admin/assets/admin-shared.js`
+ `index.html` Pricing section. Drift gates pin all four in lockstep.

**Deprecated slugs (expand-then-contract, NOT removed):** the old
`starter` / `pro` / `studio` slugs are DEPRECATED ALIASES that still
resolve via `resolveTier()` — the ~70 old-slug references across the live
provisioning chain (cloud-init, setup-script, bundle-pull, tier-bump,
Vultr/DigitalOcean providers) + the `xendit-webhook` payment handler keep
working unchanged. The persona-set-consistent alias mapping is:
`starter → voice-starter` (3), `pro → done-for-you` (8 Pro set),
`studio → library-full` (10 full library). Removal of the old slugs is a
SEPARATE later cleanup PR. New producers (admin form, landing, checkout)
emit only the new canonical slugs.

**Phase B (Voice) + Phase C (Web App) are FEATURE UNLOCKS, not slug
renames.** `features.voice` / `features.web_app` are FLAGS only as of
Phase A — the voice + web-app middleware ships later WITHIN these existing
tier slugs (no future slug rename needed). See
`docs/roadmap/2026-05-28-tier-restructure-phases.md`.

Locked v1.2 values (Rp 399k / 1,29jt / 5,9jt) superseded 2026-05-28.

### LLM strategy

- Pelanggan BYOK ongoing (ChatGPT subs / OpenRouter / DeepSeek key sendiri)
- Starter $3-5 credits via DeepSeek (kita yang call) untuk onboarding pertama
- Setelah credits habis, pelanggan paste API key sendiri di dashboard

### Cost responsibility

| Item | Yang bayar |
|------|------------|
| Setup fee | Pelanggan (sekali) |
| Hosting Rp 99k/bulan | Pelanggan (recurring) |
| Always-On +Rp 49k/bulan | Pelanggan (opsional) |
| LLM token usage | Pelanggan (BYOK) |
| Starter credits $3-5 | Kita (sekali per pelanggan baru) |

### Page positioning

"Bayar setup sekali. Hosting transparan, stop kapan saja."

Reframe hosting sebagai utility (kayak bayar listrik), bukan subscription tradisional. Pelanggan bisa pause kapan saja dari dashboard.

### Survival mechanism

- Auto-suspend setelah 30 hari inactive: cost drop dari Rp 145k → Rp 17k/bulan storage-only
- Hosting fee tutup ongoing VPS cost
- Always-On add-on convert heavy users dari loss (-46k/bulan) jadi break-even (+3k margin/bulan)

---

## Tech stack (LOCKED — jangan tambah/ganti tanpa confirm founder)

| Layer | Pilihan | Catatan |
|-------|---------|---------|
| Bahasa | TypeScript | Semua services/* + packages/* |
| Landing | Static HTML + React-via-CDN | `index.html`, `checkout.html`, `use-cases.html`, `welcome.html`, `onboarding.html` di root, deploy Vercel |
| VPS | Vultr Singapore (primary) + DigitalOcean SGP1 (failover) | Plan `vc2-1c-1gb` ($5/mo). Cutover from IDCloudHost 2026-05-11 (PR #75); IDCH adapter retired 2026-05-13 (PR #90). Failover triggers on Vultr capacity-exhausted errors. |
| Provisioning service | Fly.io `weuseai-provisioning` | Region `sin` (Singapore — closest Fly POP to Vultr SGP), shared-cpu-1x / 256MB. Auto-stop, min=0 max=1 machines. |
| Agent runtime | NousResearch/hermes-agent (MIT OSS) | Pinned `v2026.6.5` (real pin since 2026-06-14). Install via upstream `scripts/install.sh` as user `weuseai`, passing the ref to its `--branch` flag — NOT a `HERMES_VERSION` env (upstream ignores that; the old form silently cloned `main`). Manage via systemd. Kita nggak fork, nggak build. |
| LLM (Starter) | DeepSeek V3 via Cloudflare Worker proxy | Pelanggan tier Starter pakai proxy kita, default model `deepseek-chat`. $3–5 onboarding credits via `credits` table. |
| LLM (Pro/Studio BYOK) | DeepSeek / OpenRouter / OpenAI / Z.ai (GLM) | Pelanggan paste API key sendiri di onboarding. |
| Payment | Xendit (currently TEST mode — see Production deploy section) | QRIS primary, e-wallet + cards supported. Webhook signed via `XENDIT_WEBHOOK_TOKEN`. `services/payment/` punya IPaymentProvider abstraction (mock + xendit). |
| Database | Supabase | Migrations live di `supabase/migrations/*.sql`, applied via Supabase Mgmt API. RLS-locked per Sesi D pass-1/2/3 (X-CID enforcement on customers + subscriptions + consent_events). |
| Edge Functions | Supabase Functions | Live: `xendit-webhook`, `create-invoice` (gates ToS), `complete-onboarding`, `bundle-fetch` (tier-enforced), `customer-progress-proxy` (X-CID), `customer-readiness` (X-CID), `workflow-execute`, `bundle-pull-record`, +others. |
| Multi-persona library | `supabase/functions/_shared/tier-personas.ts` (v1.4 2026-06-09) | bare 0 / solo 3 / voice-starter 3 / done-for-you 8 / library-full 10 / enterprise custom. Old slugs aliased (expand-then-contract). The Pro persona is default-at-index-0 invariant across every non-null, non-empty list (bare is persona-free). |
| Channel | Telegram | Phase 1 only. WhatsApp ditunda. Per-customer bot, customer supplies token. |

---

## Agent runtime context

Kita pakai NousResearch/hermes-agent (https://github.com/NousResearch/hermes-agent, MIT) sebagai agent runtime. **Kita nggak nulis kode agent.**

**Yang kita kerjain:**
- Provision VPS pelanggan via Vultr API (Singapore region), DigitalOcean SGP1 failover. SSH-based setup script writes `/home/weuseai/.hermes/.env` dengan kredensial pelanggan.
- systemd unit `hermes-gateway.service` (`ExecStart=/home/weuseai/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run --replace`, `Restart=always`). Drop-in `/etc/systemd/system/hermes-gateway.service.d/10-bundle-pull.conf` wires the per-customer persona-bundle pull as `ExecStartPre`. **CORRECTED 2026-05-14:** earlier CLAUDE.md said `hermes-agent.service` — wrong; was caught by PR #118 forensic.
- LLM routing: tier Starter → proxy kita → DeepSeek; tier Pro/Studio → BYOK key langsung ke provider
- Telegram bot per pelanggan (pelanggan kasih bot token sendiri saat onboarding)
- Payment, dashboard, marketplace skill metadata, hosting/Always-On billing
- Tier-persona enforcement: bundle-fetch validates `agent_slug ∈ personasForTier(customer.tier)` before signing the URL (PR #92).

**Yang kita NGGAK kerjain:**
- Tool calling, prompt engineering, agent loop logic — itu Hermes core
- Fork, patch, atau modifikasi kode upstream
- Custom Docker image

**Implikasi:**
- Bug di agent core → upstream issue, bukan kita fix
- Update Hermes = re-install di VPS pelanggan, bukan rebuild image. Currently pinned to `v2026.6.5` via install.sh's `--branch` flag (`DEFAULT_HERMES_VERSION` in `setup-script.ts`). **CORRECTED 2026-06-14:** the prior "pinned v0.13.0 via HERMES_VERSION env" was FALSE — upstream `install.sh` never reads that env (confirmed by grepping the raw script), so every VPS silently cloned unpinned `main`. The override env still works but is now passed as `--branch` (so it actually takes effect); set it to a REAL git ref (tag/branch/SHA), not the non-existent `v0.13.0` tag. NOTE: `cloud-init.ts` is a SEPARATE provisioning path still deliberately tracking `main` (Phase 1 decision) — revisit if it's live.

**LOCKED (2026-06-07) — Hermes config.yaml SHAPE can drift across versions.**
The upstream `config.yaml` schema is NOT a stable contract: between installs the
top-level `model:` key moved from a scalar to a nested dict (`model.default`),
which broke our scalar-based `sed` pin and shipped customers an unparseable
config → empty model → OpenRouter `400 No models provided` → "model provider
failed after retries" (see `docs/investigation/2026-06-07-config-yaml-model-shape-incident.md`).
Rules going forward:
1. **NEVER edit config.yaml with shape-assuming `sed`/`grep` that assumes a key
   is a scalar vs a dict.** Use shape-independent block-replacement (see
   `modelPinShellBlock()` in `setup-script.ts`).
2. **The setup-script HARD-VALIDATES the final config.yaml** (`configYamlValidateShellBlock()`):
   it parses with the Hermes venv pyyaml and asserts `model.default` is pinned
   to DeepSeek, failing the provision loudly. A future upstream shape change
   surfaces to US at provision time — never via a customer 402.
3. **When bumping the Hermes pin** (`DEFAULT_HERMES_VERSION` / the `HERMES_VERSION`
   override, now passed to install.sh's `--branch`), re-verify the config.yaml
   shape on a throwaway VPS before the new ref reaches customers; the drift gate
   (`tests/setup-script-config-yaml-model.spec.ts`) only guards the shapes we
   know about. The pin must be a real git ref — `v0.13.0` is not a tag (semver
   `0.13.0` == date-tag `v2026.5.7`); release tags are date-stamped (`v2026.6.5`).
4. Retroactive remediation for already-provisioned VPSes:
   `scripts/remediate-config-yaml-model.sh`.

**Sanctioned upstream contribution (NOT a fork):** When a needed knob doesn't exist upstream, the path is a clean PR to NousResearch/hermes-agent — never a fork or local patch of the pinned install.
- Upstream PR #27771 contributed (`feat(config): add agent.sanitize_provider_errors`, https://github.com/NousResearch/hermes-agent/pull/27771); no active pursuit — NousResearch can merge or close on their own schedule. Item 2 mitigation = cost monitoring (Item 3) prevents 402 from firing in normal flow.

---

## Security gates on the customer flow (pass-3, 2026-05-13)

Three gates landed before the first real paying customer onboards. All have automated regression coverage in `tests/pass-3-regression-suite.spec.ts` (PR #94 — the contract runbook).

- **ToS consent (PR #91):** `create-invoice` rejects 400 `tos_required` when `tos_accepted_at` is missing, 400 `tos_stale` when older than 24h or future-dated. Acceptance written to `consent_events` (RLS-locked, append-only) BEFORE Xendit invoice creation. UU PDP Art. 22(1) + chargeback evidence.
- **Tier-persona enforcement (PR #92):** `bundle-fetch` returns 403 `tier_does_not_grant_persona` when `agent_slug ∉ personasForTier(customer.tier)`. Closes the Starter-customer-mints-Studio-bundle escalation path.
- **X-CID validation (PR #93):** `customer-progress-proxy` + `customer-readiness` both REQUIRE `X-CID` header equal to body `customer_id` else 403 `x_cid_mismatch`. Closes the cross-customer VPS-info leak via anon JWT.

Regression suite is the source of truth. If a future PR weakens any gate, the suite fails with a self-documenting test name.

---

## Skip di Phase 1 (jangan dibangun dulu)

- Mastra refactor — Hermes existing works as-is
- LiteLLM proxy self-host — call DeepSeek langsung dari Hermes / via Cloudflare proxy
- Infisical secrets management — env file cukup
- WhatsApp Web automation — Telegram primary, WA Phase 2
- Marketplace UI — skill hardcoded di Hermes image
- Auto-update / audit log / daily backup — Phase 3
- Multi-region / migration plan — single region cukup
- UU PDP compliance detail — basic privacy policy cukup

Bring back kalau ada signal dari 10+ paying customer minta fitur tertentu.

---

## Brand voice rules (untuk semua customer-facing copy)

- **Bahasa Indonesia** primary. English untuk technical/dev terms (npm, Docker, API).
- Pakai `kamu`, bukan `Anda` atau `lo/gue`.
- One idea per sentence. Two-sentence paragraph preferred.
- **Zero exclamation marks** di body copy. Max 1 per caption.
- **BANNED words** (jangan pakai sama sekali): `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Calm-premium register. Bukan Duolingo, bukan tech-bro neon, bukan hustle culture.

Filter pertanyaan sebelum publish copy: *"Would someone I respect in Jakarta save this, or scroll past?"*

Aesthetic landing: dark theme (bg `#0a0a0a`, ink `#f5f5f5`, accent signal-red `#E5322D`), Inter font + Instrument Serif for hero, Liquid-glass cards. Max 1 emoji per section. (Earlier chrome-on-canvas spec was superseded during the Sesi B brand pass.)

Detail lengkap di `docs/04-Liren-Stand-Strategy.md`.

---

## Reference docs

Baca kalau perlu context lebih dalam (semua di `docs/` folder):

1. `docs/04-Liren-Stand-Strategy.md` — apa + kenapa (pricing, marketplace, tier)
2. `docs/05-One-Click-Build-Plan.md` — gimana, detail (architecture, code skeleton, day-by-day)
3. `docs/06-Research-Preview.md` — context tech decision (build vs buy, alternatif considered)

Note: docs `07-Business-Model-Locked.md` dan seterusnya nggak ada di repo — content critical (pricing v1.1) sudah di-paste ke section "Business model" di file ini. Treat 07-10 sebagai future work; recreate kalau memang dibutuhkan.

Order rekomen: kalau task butuh context strategis baca 04. Kalau butuh detail implementasi baca 05. Kalau bingung kenapa pilihan tech tertentu, baca 06.

`CLAUDE.md.platform` dan `NEXT.md.platform` adalah arsip dari liren-stand pre-merge — reference only, jangan diedit.

---

## Local-first iteration (LOCKED 2026-05-14 per `feedback_local_first_iteration.md`)

**Every code change goes through the local smoke before deploy.** Vercel / Supabase / Fly redeploy is verification, not iteration. Anti-patterns: "ship PR, deploy, see what breaks" / "manual SSH to a real VPS as integration evidence" / "wait for Vercel cold-start to confirm a fix." If a deployment-glue bug surfaces post-deploy that didn't surface locally, that is a **local-stack fidelity gap** — fix the local stack (add the missing mock, env var, init step) so the next iteration would have caught it.

**Exception: Phase F (fresh-customer chain validation) intentionally runs against real deployed everything.** That IS its purpose. But the harness code itself develops + tests locally with mocked Vultr/Xendit/SSH first; real test-mode runs are reserved for actual chain verification.

### How to iterate locally

```bash
# Test-double iteration (NO Docker required — fastest path)
npm test                            # 1600+ unit + integration + drift gates
npm run smoke:service:local         # Phase D audit smoke, in-process fixtures, no network

# Provisioning service against mocks (NO Docker required)
ENABLE_REAL_PROVISIONING=false VPS_PROVIDER=mock npm run local:prov-dev
#   • SSH calls go to MockSshProvisioner (services/provisioning/src/ssh/mock-ssh-provisioner.ts)
#   • VPS calls go to MockVPSProvider   (services/provisioning/src/providers/mock-vps.ts)

# Full local Supabase stack (REQUIRES Docker — install Docker Desktop or OrbStack first)
npm run local:up                    # supabase start  (postgres + edge runtime)
npm run local:fn-serve              # supabase functions serve --no-verify-jwt
npm run local:reset                 # supabase db reset  (re-apply migrations)
npm run local:status                # current state of the local stack
npm run local:down                  # supabase stop

# Verification (after the fix passes locally)
npm run smoke:service:deployed      # Phase D smoke against real Renita-shaped customer
```

**Env-swap pattern (already in place):**
- `ENABLE_REAL_PROVISIONING=false` → `MockSshProvisioner` instead of `ExecSshProvisioner`
- `VPS_PROVIDER=mock` → `MockVPSProvider` instead of Vultr / DigitalOcean
- `E2E_SMOKE_TARGET=local | deployed` → smoke uses in-process fixtures vs real network

**Docker is a prereq for `npm run local:up` / `local:fn-serve`.** If Docker isn't installed, you can still iterate via `npm test` and `npm run smoke:service:local` — both run handler-level mocks with full fidelity to the smoke's 5-stage shape.

---

## Working conventions

**Commits:**
- Subject line English, imperative mood, ≤72 char
- Body BI atau EN, sesuai konten
- Tag prefix: `[landing]`, `[test]`, `[hermes]`, `[provisioning]`, `[proxy]`, `[payment]`, `[supabase]`, `[infra]`, `[docs]`

**Type checking:**
- Run `npm run typecheck:all` di root sebelum commit kalau touch services/*
- Atau `cd services/<name> && npx tsc --noEmit` per package
- Fix all errors, don't ignore

**Per-service workflow:**
- `cd services/<name>`
- `npm install` (kalau belum)
- `npm run dev` atau `npm run test`

**Workspace install (root):**
- `npm install` di root pasang semua workspace deps via npm workspaces

**Don't add new packages** without confirming with founder.

**Don't run `npm install -g`** without explicit founder ask.

---

## Production deploy

- Landing live di `https://weuseai-agent.vercel.app/`. As of 2026-05-14 BOTH `weuseai-agent.vercel.app` AND `velorah-nu.vercel.app` auto-track main (founder added `weuseai-agent.vercel.app` as a project domain via Option B in PR #114). Either URL is canonical; smoke continues to target the `weuseai-agent.vercel.app` apex.
  - **CORRECTED 2026-05-14:** the prior "verify deploys di sini, bukan velorah-nu auto-alias" line was inverted. `velorah-nu.vercel.app` IS auto-tracking (and was the only canonical URL for 16d after project scaffolding); `weuseai-agent.vercel.app` was a stale manual alias until the domain-add. Both work now.
- `vercel.json` di root velorah punya routing config
- `.vercel/` folder punya project linking — jangan commit (gitignored)

### Phase F cascade — CLOSED 2026-05-16

The fresh-customer chain is validated end-to-end (`tests/e2e/smoke-chain.spec.ts`, `docs/cascades/2026-05-14-8min-flow-validation.md`): real Xendit test invoice → paid webhook → Vultr VPS → setup-script → onboarding/pairing → hermes-gateway → bundle-pull → **proactive auto-greet**. 3 consecutive clean runs (~6.7 min) + a founder-confirmed hold-VPS run. The 8-min-flow priority lock (amended to 15 min) is RELEASED.

**Standard post-payment flow now includes the auto-greet.** `complete-onboarding` step 8c (`sendProactiveGreeting`, `_shared/proactive-greeting.ts`) sends an in-character greeting to the customer's Telegram chat the moment provisioning + pairing complete — the customer never has to type `/start` to wake the bot. `/start` itself is also handled: the setup-script installs a `start` skill so `/start` routes to the SOUL.md first-contact greeting instead of Hermes' "Unknown command".

### Deferred gate — Xendit prod-mode signing + body-shape fidelity (still open)

The current `XENDIT_API_KEY` is a TEST-mode secret. Phase F ran entirely on test-mode invoices via a synthetic `invoice.paid` POST (Xendit has no server-side invoice-pay API — see the cascade doc's locked decisions). **Xendit's test-mode webhook signature scheme + `invoice.paid` body shape have NOT been verified to match production byte-for-byte.** The first real-money payment AFTER `XENDIT_API_KEY` rotates to `xnd_production_*` doubles as the prod-mode validation — there is no automated proof until then. Do NOT assume test-mode-green == prod-ready; **monitor the first real payment closely, within the 15-min flow window.** Rotating `XENDIT_API_KEY` is a founder-only action.

Note: the Phase F harness greeted its synthetic test customer as `Hai, e2e-chain-…@weuseai.test` (email-as-name). Benign test artifact — the harness skips the onboarding form, so `customers.display_name` is null and `complete-onboarding` falls back to `email`. Real customers fill the onboarding form → `save-onboarding-profile` sets `display_name` → the greeting uses their real name.

---

## When to STOP and ask founder

- Need API keys, credentials, or paid signup
- Architectural decision beyond locked stack
- Brand-facing copy or marketing claims
- Pricing / revenue logic changes
- Spending money (paid services, paid LLM tokens beyond free tier)
- Touching `index.html` / `checkout.html` substantively (landing is shipped, regression risk)
- Stuck >30 minutes on same problem

## When to JUST PROCEED

- Bug fixes within existing logic
- Adding tests
- Following existing patterns
- Documentation updates within `docs/` or service READMEs
- Type errors and code cleanup
- Refactoring for clarity (not architecture)

---

## Verification checklist before claiming task done

- [ ] `npx tsc --noEmit` (atau `npm run typecheck:all`) passes in modified package
- [ ] README updated kalau API/usage berubah
- [ ] No banned brand words in customer-facing strings
- [ ] No exclamation marks in customer-facing copy
- [ ] Commit message follows convention
- [ ] Manually tested happy path (atau noted "needs API key" if can't)

---

## Founder context

- Solo founder, Hangzhou + Jakarta
- Indonesia-focused, average Joe target
- Bahasa-first product, English internal
- Hard constraint: no paid ads, no hiring, no enterprise custom in Phase 1
- Mac Mini sebagai control plane (existing Hermes runs there)

---

## Critical contact for blockers

Founder Telegram: [SET BY FOUNDER]
Founder email: kidnovell.richie@gmail.com
