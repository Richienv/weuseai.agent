# CLAUDE.md — Working brief untuk Claude Code

**Project:** weuseai.agent — managed Hermes agent hosting untuk pelanggan Indonesia. MyClaw-style flow, IDR pricing, Telegram delivery, 5-menit setup.

**Status:** Production live di `weuseai-agent.vercel.app`. Platform stack end-to-end validated as of 2026-05-13 (Richie's richiebot + Renita's bot both spun up + paired). Pass-3 security cascade shipped (PR #91/#92/#93/#94). Agent runtime pakai upstream NousResearch/hermes-agent — bukan custom build.

**Production state (live as of 2026-05-13):**
- **Landing:** `weuseai-agent.vercel.app` — main `d7c48ae`
- **Per-customer VPS:** Vultr Singapore `vc2-1c-1gb` ($5/mo) provisioned via Vultr API. DigitalOcean SGP1 as failover when Vultr capacity exhausted.
- **Provisioning service:** Fly.io `weuseai-provisioning` (region `sin`, shared-cpu-1x / 256MB)
- **Payments:** Xendit live (QRIS primary, e-wallet + cards supported). Sandbox retired.
- **Agent personas:** 10-persona library (`tier-personas.ts` is single source of truth — D1 lock 2026-05-12). Starter gets 3, Pro gets 8, Studio gets 10. The Pro is the default-persona invariant across every tier.
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

## Business model (LOCKED v1.2, 2026-05-13)

**Setup fee one-time + Hosting fee monthly + Optional Always-On + BYOK LLM ongoing.**

### Pricing structure (live landing is source of truth)

| Tier | Setup (diskon launch) | Setup (strike / target) | Hosting (Rp 99rb/bulan flat) | Always-On (+Rp 49rb/bulan opsional) |
|------|------------------------|--------------------------|-------------------------------|--------------------------------------|
| Starter | Rp 399rb | Rp 699rb | Auto-pause >30 hari inactive | Skip auto-suspend, VPS 24/7 |
| Pro | Rp 1,29jt | Rp 2,5jt | Same | Same |
| Studio | Rp 5,9jt | Rp 10,9jt | Same | Same |

Values live di `index.html` (Pricing section) — keep CLAUDE.md in lockstep when landing copy changes. Locked v1.1 values (Rp 299k / 1.2jt / 4.9jt from 2026-04-28) superseded 2026-05-13 per founder confirmation.

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
| Agent runtime | NousResearch/hermes-agent (MIT OSS) | Pinned `v0.13.0` (2026-05-08 lock). Install via upstream `scripts/install.sh` as user `weuseai`, manage via systemd. Kita nggak fork, nggak build. |
| LLM (Starter) | DeepSeek V3 via Cloudflare Worker proxy | Pelanggan tier Starter pakai proxy kita, default model `deepseek-chat`. $3–5 onboarding credits via `credits` table. |
| LLM (Pro/Studio BYOK) | DeepSeek / OpenRouter / OpenAI / Z.ai (GLM) | Pelanggan paste API key sendiri di onboarding. |
| Payment | Xendit (live, validated) | QRIS primary, e-wallet + cards supported. Webhook signed via `XENDIT_WEBHOOK_TOKEN`. `services/payment/` punya IPaymentProvider abstraction (mock + xendit). |
| Database | Supabase | Migrations live di `supabase/migrations/*.sql`, applied via Supabase Mgmt API. RLS-locked per Sesi D pass-1/2/3 (X-CID enforcement on customers + subscriptions + consent_events). |
| Edge Functions | Supabase Functions | Live: `xendit-webhook`, `create-invoice` (gates ToS), `complete-onboarding`, `bundle-fetch` (tier-enforced), `customer-progress-proxy` (X-CID), `customer-readiness` (X-CID), `workflow-execute`, `bundle-pull-record`, +others. |
| Multi-persona library | `supabase/functions/_shared/tier-personas.ts` (D1 lock 2026-05-12) | Starter 3 / Pro 8 / Studio 10. The Pro persona is default-at-index-0 invariant across every tier. |
| Channel | Telegram | Phase 1 only. WhatsApp ditunda. Per-customer bot, customer supplies token. |

---

## Agent runtime context

Kita pakai NousResearch/hermes-agent (https://github.com/NousResearch/hermes-agent, MIT) sebagai agent runtime. **Kita nggak nulis kode agent.**

**Yang kita kerjain:**
- Provision VPS pelanggan via Vultr API (Singapore region), DigitalOcean SGP1 failover. SSH-based setup script writes `/home/weuseai/.hermes/.env` dengan kredensial pelanggan.
- systemd unit `hermes-agent.service` (`ExecStart=/home/weuseai/.local/bin/hermes gateway start`, `Restart=always`)
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
- Update Hermes = re-install di VPS pelanggan, bukan rebuild image. Currently pinned to `v0.13.0` (HERMES_VERSION env override pulls a different tag on next-provisioned VPS).

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

- Landing live di `https://weuseai-agent.vercel.app/` (verify deploys di sini, bukan velorah-nu auto-alias)
- `vercel.json` di root velorah punya routing config
- `.vercel/` folder punya project linking — jangan commit (gitignored)

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
