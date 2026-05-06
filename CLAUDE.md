# CLAUDE.md — Working brief untuk Claude Code

**Project:** weuseai.agent — managed Hermes agent hosting untuk pelanggan Indonesia. MyClaw-style flow, IDR pricing, Telegram delivery, 5-menit setup.

**Status:** Landing live di `weuseai-agent.vercel.app` (root HTML files). Platform layer (services/) freshly merged dari liren-stand monorepo. Belum end-to-end production-tested. Agent runtime pakai upstream NousResearch/hermes-agent — bukan custom build.

**Prioritas urut:** Lihat `NEXT.md`. Kerjain dari atas, jangan skip. Stop kalau task gagal — lapor + tunggu input founder.

---

## Repo structure (post-merge 2026-04-30)

```
weuseai.agent/velorah/
├── index.html / checkout.html / use-cases.html  # landing live di Vercel
├── assets/                                          # landing images, fonts, og-image
├── vercel.json                                      # vercel routing for landing
├── services/                                        # platform backend
│   ├── provisioning/   # Express server, IDCloudHost VPS spawner
│   ├── proxy/          # Cloudflare Worker, LLM routing for Starter tier
│   ├── hermes/         # Reference docs / cloud-init for upstream Hermes install
│   ├── payment/        # IPaymentProvider abstraction (mock + Xendit adapter)
│   └── test-idcloudhost/  # Day-1 IDCloudHost API gate
├── packages/
│   └── shared/         # (placeholder) brand tokens, shared types
├── supabase/
│   ├── schema.sql      # initial schema, apply via Supabase SQL editor
│   └── functions/      # (placeholder) Edge Functions, mis. xendit-webhook
├── docs/
│   ├── 04-Liren-Stand-Strategy.md     # apa + kenapa
│   ├── 05-One-Click-Build-Plan.md     # gimana, day-by-day
│   └── 06-Research-Preview.md         # context tech decision
├── tests/
│   └── end-to-end-mock.spec.ts        # 3 integration tests, mock adapters
├── CLAUDE.md           # ← ini (root brief, baca dulu)
├── CLAUDE.md.platform  # archived liren-stand brief, reference only
├── NEXT.md.platform    # archived task queue, reference only
├── package.json        # workspace root, name=weuseai-agent
└── tsconfig.json       # root tsconfig (covers tests/)
```

Landing files dan platform sekarang satu monorepo. `services/*` dan `packages/*` di-link via npm workspaces.

---

## Business model (LOCKED v1.1, 2026-04-28)

**Setup fee one-time + Hosting fee monthly + Optional Always-On + BYOK LLM ongoing.**

### Pricing structure

| Tier | Setup (sekali bayar) | Hosting (Rp 99k/bulan flat) | Always-On (+Rp 49k/bulan opsional) |
|------|----------------------|------------------------------|--------------------------------------|
| Starter | Rp 299k | Auto-pause >30 hari inactive | Skip auto-suspend, VPS 24/7 |
| Pro | Rp 1.2jt | Same | Same |
| Studio | Rp 4.9jt | Same | Same |

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
| Landing | Static HTML + React-via-CDN | `index.html`, `checkout.html`, `use-cases.html` di root, deploy Vercel |
| VPS | IDCloudHost API | Region jakarta atau cyc01 |
| Agent runtime | NousResearch/hermes-agent (MIT OSS) | Install via upstream `scripts/install.sh`, manage via systemd. Kita nggak fork, nggak build. |
| LLM (Starter) | DeepSeek V3 via LiteLLM proxy | Pelanggan tier Starter pakai proxy kita, default model `deepseek-chat` |
| LLM (Pro/Studio BYOK) | DeepSeek / OpenRouter / OpenAI / Z.ai (GLM) | Pelanggan paste API key sendiri |
| Payment | Xendit (sandbox active) | QRIS primary, e-wallet supported. `services/payment/` punya IPaymentProvider abstraction (mock + xendit). |
| Database | Supabase | `supabase/schema.sql` — apply pending |
| Edge Functions | Supabase Functions | `xendit-webhook` paling pertama (Day 4-5) |
| Channel | Telegram | Phase 1 only. WhatsApp ditunda. |

---

## Agent runtime context

Kita pakai NousResearch/hermes-agent (https://github.com/NousResearch/hermes-agent, MIT) sebagai agent runtime. **Kita nggak nulis kode agent.**

**Yang kita kerjain:**
- Provision VPS pelanggan (IDCloudHost API)
- Cloud-init: jalanin upstream `install.sh` sebagai user `weuseai`, tulis `/home/weuseai/.hermes/.env` dengan kredensial pelanggan
- systemd unit `hermes-agent.service` (`ExecStart=/home/weuseai/.local/bin/hermes gateway start`, `Restart=always`)
- LLM routing: tier Starter → proxy kita → DeepSeek; tier Pro/Studio → BYOK key langsung ke provider
- Telegram bot per pelanggan (pelanggan kasih bot token sendiri saat onboarding)
- Payment, dashboard, marketplace skill metadata, hosting/Always-On billing

**Yang kita NGGAK kerjain:**
- Tool calling, prompt engineering, agent loop logic — itu Hermes core
- Fork, patch, atau modifikasi kode upstream
- Custom Docker image

**Implikasi:**
- Bug di agent core → upstream issue, bukan kita fix
- Update Hermes = re-install di VPS pelanggan, bukan rebuild image
- Pin ke release tag mereka kalau ada breaking change (Phase 3 task)

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

Aesthetic landing: chrome-on-canvas (bg `#FAF9F5`, ink `#141413`, accent Liren Blue `#0047FF`), Inter font, max 1 emoji per section.

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
