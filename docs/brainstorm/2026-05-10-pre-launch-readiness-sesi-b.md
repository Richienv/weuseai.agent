# Pre-Launch Readiness — Strategic Gap Scout (Sesi B, 2026-05-10)

**Scout:** Sesi B (autonomous brainstorm + research; no code, no fixes)
**Scope:** forward-looking gap analysis before first paying customer onboards
**Mandate:** find what's missing or could be added — supportive pages, API integrations, holistic launch checklist, strategic compounding bets
**Coordination:** complementary to Sesi D (security/RLS/webhook hardening — see [docs/audits/2026-05-10-security-audit-sesi-d.md](../audits/2026-05-10-security-audit-sesi-d.md)) and Sesi A (builds approved recommendations after founder sign-off)
**Repo state:** `origin/main` @ d22bacb (Phase 6 foundation + #37 health-check dashboard). 858 unit tests passing. First paying customer not yet onboarded.

> **Founder constraints locked 2026-05-10** (after first scout pass): no counsel relationship → legal text v1.0 from boilerplate, BI primary, "pending counsel review" note in legal doc footers; no PT entity → personal-operator footer wording; PSE registration deferred to logged trigger; Phase 5-5b is poll-only v1; BI is controlling legal language with Jakarta jurisdiction + BANI arbitration. Detail in "Founder decisions locked" section below; deferred items in "Founder-decision triggers logged" section.

---

## Executive summary

The product is technically ready. Phase 1–5 ship in production, security primitives are correct (Sesi D's findings are scoped fixes, not architectural rewrites), and the customer pipeline functions end-to-end in code. **The pre-launch gap is not engineering — it's the surface around the engineering.** Three clusters dominate:

1. **Legal page surface is empty.** Footer "Privacy" and "Terms" links resolve to `#`. No standalone Privacy Policy, ToS, Refund Policy, Contact, or operator-info disclosure exists. Indonesia's UU PDP (effective 2024 with sanctions live) and the absence of an enforceable contract on a paid product (Studio = Rp 4.9jt setup + Rp 99k/mo hosting) are P0 legal exposure on customer 1. Same gap surfaces from Track 1 (page audit), Track 3 (readiness checklist), and would surface from any payment-processor compliance review.

2. **Operational telemetry is invisible.** No public status page, no error monitoring (Sentry/PostHog), no alerting on Edge Function error rates, no first-customer rehearsal recorded. The system works in tests; nobody is watching it work in production. This is the second-most-likely cause of a silent first-customer failure.

3. **The compounding-value moat is misidentified.** Forward-looking strategic options bias toward generic infrastructure (public API, multi-region, mobile app, marketplace). The only ideas that compound *uniquely* for an Indonesian product are first-party templates encoding ID regulatory/operational IP (DJP, BPJS, OSS, NIB) and B2B integrations against the ID SMB stack (Mekari, Jurnal, Tokopedia, Mayar). Everything else is commodity work that should follow customer signal, not roadmap.

### Top 5 gaps to fix before first paying customer (consolidated across tracks)

| # | Gap | Why blocking | Owner | Effort |
|---|---|---|---|---|
| 1 | Privacy Policy + ToS + Refund Policy live at real URLs (not `#`), in Bahasa Indonesia (controlling) + EN (convenience). v1.0 from boilerplate templates, "pending counsel review" footer note. | UU PDP Art. 21 disclosure obligations are live with sanctions; no enforceable contract = chargeback + dispute risk on first paid invoice | Sesi A (legal-pack draft via Master Agent legal-dispatch) | S-M (1-2 days; no counsel-blocker) |
| 2 | Footer on every page with legal links + personal-operator wording: "Dioperasikan oleh Richie [surname], berbasis di Jakarta. Kontak: [support email]." (no PT yet — PT setup is a logged trigger) | All pages today have zero footer; legal pages invisible without it; buyers need a clear operator + contact path | Sesi A | S (half day) |
| 3 | First-customer end-to-end paid rehearsal (founder pays Rp 1k fixture invoice through full chain: landing → Xendit → provisioning → bot pair → first reply) — recorded + logged. v1 ships poll-only mode for Phase 5-5b integrations (founder-locked 2026-05-10); rehearsal validates poll worker. | No proof on prod that the full chain works for a fresh paying customer; poll-mode behavior must be validated end-to-end | Founder + Sesi A (smoke harness) | M (half day rehearsal + 1-day fix budget) |
| 4 | Error monitoring + alerting wired (PostHog or Sentry on Edge Functions + frontend; Telegram alert on error-rate spike) | Silent failures are invisible today; first customer's first failure must page someone, not vanish | Sesi A | S-M (half day if PostHog; 1 day if Sentry+integration) |
| 5 | Resend transactional email + Crisp free-tier landing chat | Receipts, password reset, provisioning emails are non-negotiable for Studio tier (Rp 4.9jt setup + Rp 99k/mo); pre-sales chat is table stakes for B2B trust | Sesi A | S (1 day combined) |

Everything else is P1 or later. Detail follows.

---

## Track 1 — Supportive Pages

### Site survey snapshot

The live site (https://weuseai-agent.vercel.app/) ships **5 HTML pages**: [index.html](../../index.html), [checkout.html](../../checkout.html), [onboarding.html](../../onboarding.html), [welcome.html](../../welcome.html), [use-cases.html](../../use-cases.html). Landing nav links only to `#pricing`, `#proses`, `#snk-garansi` (in-page anchor for the 14-day guarantee blurb), `checkout.html`, `use-cases.html`, a Cal.com booking, and a WhatsApp number (+62 821-5490-2561). **No footer with legal/trust/support links exists on any page.** Checkout copy references "Terms and Privacy" but the links resolve to `#`. No standalone Privacy Policy, ToS, Refund Policy, About, Contact, Status, or Security page. Only Bahasa Indonesia is offered (no language toggle). In-repo `/docs/*.md` (faq, getting-started, troubleshooting) are not exposed as web pages. Refund guarantee content lives only inside one FAQ answer in `index.html` ("Setup nggak refundable… 14 hari garansi for technical issues").

### Gaps by category

#### Legal

| Page | Status | Why needed | Content outline | Link from | Priority |
|---|---|---|---|---|---|
| Privacy Policy / Kebijakan Privasi | missing | UU PDP Art. 21 mandates controller identity, legal basis, purpose; Art. 5 grants subject rights that must be discoverable | Data categories (name, email, WA, Telegram ID, agent prompts); legal basis (contract + consent); retention; sub-processors (Supabase SG, Vercel, Telegram Bot API, Xendit, OpenAI/Anthropic/DeepSeek); cross-border transfer disclosure; subject rights + how to exercise; DPO contact; UU PDP citation | footer (all pages), checkout consent, onboarding step 1 | P0 |
| Terms of Service / Syarat dan Ketentuan | missing | No enforceable contract with paying users; required to bind users to AUP, payment terms, IP, liability cap | Service description (Starter Rp 299k / Pro Rp 1.2jt / Studio Rp 4.9jt setup + Rp 99k/mo hosting + optional Rp 49k Always-On); payment terms (Xendit); auto-pause after 30d inactivity; user IP ownership of outputs; liability cap; governing law (Indonesia, Jakarta jurisdiction); arbitration via BANI; **BI version controls per founder lock 2026-05-10**; suspension grounds | footer, checkout pre-pay checkbox, header | P0 |
| Refund Policy / Kebijakan Pengembalian Dana | missing | Currently buried in 1 FAQ answer; ID buyers + Xendit dispute process expect a standalone page | Setup fee non-refundable rationale; 14-day technical-issue guarantee scope; hosting cancel-any-time clause; how to request (email + WA); processing time; processor fee deduction note | footer, checkout pre-pay checkbox, FAQ link | P0 |
| Acceptable Use Policy / AUP | missing | Agent can be misused (spam, scraping, illegal automation); AUP gives grounds to suspend without refund | Prohibited: spam, illegal content, scraping ToS-protected sites, impersonation, fraud, automated harassment via WA/Telegram, CSAM, financial advice violating OJK rules | linked from ToS, footer | P1 |
| Cookie Policy / Kebijakan Cookie | missing | If analytics/Vercel cookies are set, UU PDP consent applies | Cookie categories (essential, analytics if any), opt-out mechanism, third-party cookies disclosed | footer, cookie banner | P1 |
| Data Processing Agreement (DPA) | missing | If a Studio customer is itself a data controller, they need a DPA to be UU PDP-compliant | Standard template: roles (controller/processor), processing scope, sub-processor list, security measures, breach notification SLA, audit rights | footer, sales page, sent on request | P2 |

#### Support

| Page | Status | Why needed | Content outline | Link from | Priority |
|---|---|---|---|---|---|
| Contact / Kontak | missing | Single canonical page for WA, email, hours; reduces "is this real?" friction | WA +62 821-5490-2561, support email, ID business hours (Mon–Fri 09:00–18:00 WIB), response SLA, escalation path | header, footer, every page | P0 |
| Help Center / Pusat Bantuan | missing (only raw `/docs/*.md` in repo, not web-exposed) | Inline FAQ in landing is shallow; users need searchable KB before/after purchase | Categorized articles: Getting Started, Telegram pairing, Billing & Refunds, Troubleshooting, Use Cases, Security; linkable + Google-indexed for SEO | header, footer, welcome.html, onboarding.html | P1 |
| Status Page / Status Layanan | missing | Telegram-delivered service depends on Bot API + Supabase + LLM provider; users must verify outages before flooding WA | Real-time uptime per component (Bot API, Webhook, Database, LLM); incident history; subscribe via email/RSS; UptimeRobot or BetterStack free tier | footer, header during incidents | P1 |
| FAQ (standalone) | partial — section in index.html | Currently buried mid-scroll; should be standalone for SEO + sharable links | Promote inline FAQ section to `/faq.html` with anchor links; link to Help Center for deep-dives | header, footer, welcome.html | P1 |

#### Trust

| Page | Status | Why needed | Content outline | Link from | Priority |
|---|---|---|---|---|---|
| About / Tentang Kami | missing | First-paying buyers verify "is this a real operator?" before paying setup fee | Founder bio (Richie, Hangzhou + Jakarta), mission, location (Jakarta), **operator wording** (no PT yet — "Dioperasikan oleh Richie [surname], berbasis di Jakarta"), founding year, why-we-built-this. Update to PT name when entity registered. | footer, header | P1 |
| Security / Keamanan | missing | Studio tier touches business workflows — buyers need security posture even pre-SOC 2 | Encryption at rest (Supabase) + in transit (TLS); access control (RLS, admin auth-gated observability); secrets management (Vercel env, no plaintext); incident response plan; subprocessors; "SOC 2 / ISO 27001 on roadmap"; vulnerability disclosure email | footer | P1 |
| Responsible Disclosure / Lapor Bug | missing | Industry-standard for any SaaS handling customer data; gives security researchers a sanctioned channel | Scope, in/out-of-scope assets, no-bounty-yet but recognition, contact email + PGP key, safe-harbor language, response SLA | linked from /security, footer | P2 |
| Sub-processor List | missing (UU PDP-relevant) | UU PDP cross-border transfer disclosure cleanest as standalone list | Table: Supabase (Singapore), Vercel (global), Telegram (various), Xendit (ID), OpenAI/Anthropic/DeepSeek (US/CN), purpose, data category, transfer mechanism | linked from Privacy Policy | P1 |

#### Conversion

| Page | Status | Why needed | Content outline | Link from | Priority |
|---|---|---|---|---|---|
| Pricing (standalone) | partial — `#pricing` anchor only | Tiers (Starter Rp 299k / Pro Rp 1.2jt / Studio Rp 4.9jt setup + Rp 99k/mo hosting + optional Rp 49k Always-On) buried in landing anchor; no tier comparison; SEO loss | Tier table (Starter / Pro / Studio), setup vs hosting vs Always-On split, feature matrix, FAQ on billing, money-back blurb, CTA | header (replace `#pricing`), footer | P1 |
| Case Studies / Studi Kasus | missing | Pre-launch placeholder OK but framework needed | 3–5 templated slots ("coming soon" or pilot results); per-persona ROI estimates from use-cases.html | header, footer, use-cases.html | P2 |
| Customer Logos | missing | Social proof; can use launch-partner placeholder or "design partner" badges | Logo wall (5–8 slots, anonymized OK as silhouettes pre-launch) | landing hero, pricing | P2 |
| Use Case Landing Pages (per persona) | partial — single use-cases.html for all 8 | Each persona deserves its own URL for SEO + ad targeting | Split into `/use-cases/insurance-agent`, `/use-cases/realtor`, etc.; persona-specific CTA each | use-cases index, ads | P2 |

#### Onboarding

| Page | Status | Why needed | Content outline | Link from | Priority |
|---|---|---|---|---|---|
| Getting Started landing (web) | missing — only `/docs/getting-started.md` in repo | Markdown not web-served; new users need a polished web flow | Web version of getting-started.md: 3 steps with screenshots, video, "what to expect first 24h" | welcome.html, header, FAQ | P1 |
| Video Tutorials Index | missing | Pre-launch can be 1–2 Loom embeds; reduces support load | Embed 3–5 short Loom/YouTube videos: pairing Telegram, first prompt, customizing personality, billing | Help Center, getting-started page | P2 |
| Sample Workflow Gallery | missing | Helps users understand "what to ask"; shortens time-to-first-value | 10–20 example prompts per persona (extends use-cases.html into copyable templates) | Help Center, onboarding step 3, use-cases page | P2 |

#### Indonesia-specific

| Page | Status | Why needed | Content outline | Link from | Priority |
|---|---|---|---|---|---|
| Operator Disclosure (footer block) | missing | Best practice for ID buyers; required ID-style operator disclosure even pre-PT | **Founder-locked 2026-05-10**: personal-operator wording — "Dioperasikan oleh Richie [surname], berbasis di Jakarta. Kontak: [support email]." Upgrade to PT legal name + NIB + NPWP when PT registered (logged trigger: first concierge customer signs OR Rp 50jt cumulative revenue) | footer (every page) | P0 |
| PSE Registration Statement | missing — registration deferred per founder lock | Kominfo PSE-Lingkup-Privat required for SaaS serving Indonesian users; non-registration risks platform blocking | **Founder-locked 2026-05-10**: PSE registration deferred to logged trigger (1000 paid users OR Rp 100jt cumulative revenue, after PT exists). Regulatory exposure carried knowingly during MVP. Omit PSE badge from footer; add when registered. | footer | logged trigger (post-revenue) |
| Bahasa Indonesia variants of legal docs | missing | UU PDP Art. 6 + UU 24/2009 — contracts with Indonesian parties must be in Bahasa Indonesia (BI version controls) | Bilingual ToS + Privacy + Refund (BI primary, EN convenience translation); checkout consent in Bahasa | header lang toggle | P0 |
| Customer Support Hours / Channels (standalone) | missing | Buyers expect WIB hours + WA + email; currently only WA in nav | Hours table (WIB), channels (WA, email, in-Telegram), response SLA per channel | Contact page, footer | P1 |
| Pajak / PPN 11% Note | missing | If PT collects PPN, must disclose on invoice + checkout; if not yet a PKP, note "harga belum termasuk PPN" | Note on pricing page + checkout: PPN status, NPWP on invoice | pricing, checkout | P1 |

### UU PDP compliance specifics

> **Founder-locked 2026-05-10**: legal text ships as v1.0 from boilerplate templates, BI primary, with "pending counsel review" footer note. Counsel review becomes a post-revenue trigger (no specific threshold yet), not a pre-launch blocker. Use the article list below to scope what the v1.0 template must cover.

Indonesia's **Law No. 27/2022 (UU PDP)** is fully effective with sanctions live as of late 2024. Mandatory disclosures for an Indonesian SaaS Privacy Policy:

- **Art. 21** — controller identity, legal basis, purpose, processor accountability (privacy page header section)
- **Art. 5–15** — data subject rights: access, correction, deletion, objection, withdraw consent, portability, halt processing; must publish *how* to exercise (form/email)
- **Art. 16** — lawful processing bases (consent, contract, legal obligation, vital interest, public interest, legitimate interest); state which bases apply
- **Art. 35–36** — security obligations: encryption, access control, confidentiality (publish on `/security`)
- **Art. 46** — breach notification within **3 × 24 hours (72 h)** to subjects + PDP Agency; publish breach response policy
- **Art. 53–56** — cross-border transfer requires equivalent protection / binding safeguards / explicit consent. **Critical here**: Supabase (Singapore region for ID projects), OpenAI/Anthropic/DeepSeek (US/CN), Vercel (US/global), Telegram (various) all need disclosure with the basis
- **Art. 53** — DPO required if processing involves large-scale data / sensitive data / systematic monitoring; designate one and publish contact
- **UU 24/2009 (Indonesian language law)** — legal docs binding Indonesian parties must exist in Bahasa Indonesia; the BI version controls

Separately, **Kominfo PSE-Lingkup-Privat registration** is mandatory for SaaS serving Indonesian users; non-registration risks platform blocking. **Founder-locked 2026-05-10**: PSE registration is deferred to a logged trigger (1000 paid users OR Rp 100jt cumulative revenue, after PT exists). Regulatory exposure is carried knowingly during MVP. Registration number is added to footer when obtained.

---

## Track 2 — API Integrations

### Decision matrix

| Category | Recommended | Why | Alternatives ruled out | Cost (typical month) | LOC est. | Priority |
|---|---|---|---|---|---|---|
| Email (transactional) | **Resend** | Developer-first DX, React Email templates, Tokyo region (low Jakarta latency), $0 free tier covers pre-launch | Mailgun ($15/mo from email 1), Postmark ($15/mo no free), SendGrid (confusing pricing), AWS SES (deliverability tuning toil) | $0 free (3k/mo, 100/day) → $20/mo at 50k | ~50 | **P0** |
| Customer support chat | **Crisp free tier** | ID-friendly, free covers chat + shared inbox, Telegram channel integration | Intercom ($74+/mo, sales-led), Front (overkill), Help Scout ($25/seat), Tawk.to (free but $29 to remove branding), Plain (expensive) | $0 (free) → €45/mo when team grows | ~20 | **P0** |
| Analytics + error + replay (consolidated) | **PostHog Cloud** | All-in-one: product analytics, session replay, feature flags, error tracking, surveys. 1M events free. Replaces 3 tools. | Mixpanel/Amplitude (sales-led, paid sooner), Plausible (pageview-only), Vercel Analytics (pageview-only) | $0 up to 1M events; ~$20–50/mo realistic at <20 customers | ~30 | **P1** |
| Sentry (only if PostHog errors insufficient) | **Sentry Developer free** | Fall-back for richer errors UX | (compete with PostHog above) | $0 → $26/mo (Team) at 50k errors | ~40 | **P1 conditional** |
| Calendar / scheduling | **Cal.com Cloud free** | Unlimited individual bookings, embed iframe | Calendly ($10+/seat) | $0 | ~5 | **P1** |
| WhatsApp (fallback) | **WhatsApp Cloud API direct (Meta)** | No BSP markup; per-conversation pricing | Twilio ($0.44/SMS ID = punishing), Wati ($49 base + per-msg + hidden fees), Vonage | Pay-per-conversation: ~Rp 300–780/conv; ~Rp 50–200k/mo low volume | ~150 (Meta WABA setup is the lift) | **P1** |
| Payment alternatives | **Defer (stick with Xendit)** | Xendit covers QRIS / e-wallets / VA / card under one ID-language integration. Adding redundancy = double PCI surface | Midtrans, DOKU, OY!, Mayar | N/A | N/A | **Skip until trigger** |
| Search | **Defer (Pagefind at P2)** | Static index at deploy time, zero infra | Algolia (10k records is tight free), Meilisearch ($30/mo cloud), Typesense ($30/mo cloud) | $0 | ~10 | **P2** |
| CMS for blog | **Defer (markdown in repo)** | Zero blog posts written; CMS = pure ceremony | Sanity, Strapi, Contentful | $0 | 0 | **Skip until 10+ post backlog** |
| Translation API | **Defer** | DeepSeek (in stack) handles ID↔EN as inference side-effect; landing bilingual via i18n | DeepL ($5.49 + $25/M chars), Google Translate ($20/M chars after 500k free) | N/A | N/A | **Skip** |
| Speech-to-text | **Defer** | No customer signal for voice-note inputs yet | Whisper ($0.006/min), Deepgram ($0.46/hr), AssemblyAI | N/A | N/A | **Skip until 3+ asks** |

### Notes per category

**Resend (P0).** 3,000/mo + 100/day free tier covers pre-launch through ~30 customers. Pro $20/mo gives 50k. Tokyo region keeps Jakarta latency reasonable. SDK is `import { Resend } from 'resend'; await resend.emails.send(...)` — ~20 LOC for a typed wrapper. Use for: Xendit receipt forwarding, password reset, provisioning success emails. Postmark has best-in-class deliverability but no free tier; AWS SES is cheap but eats founder hours on IAM/SPF/DKIM tuning.

**Crisp free (P0).** Free plan covers website chat with email follow-up — sufficient for pre-sales inquiries on the landing page. Crisp is well-known in Indonesian SaaS. Tawk.to is "free forever" but the $29/mo "Remove Branding" + AI add-on undercuts the savings. Intercom is sales-led and out of budget. Defer Mini (€45/mo) until pre-sales chat volume justifies a shared inbox.

**PostHog Cloud (P1, consolidates 3 tools).** 1M-event free tier covers a pre-launch B2B SaaS for many months. Now bundles product analytics + session replay + feature flags + error tracking + surveys, collapsing what would otherwise be three separate vendors. Self-hosting only makes sense at 100M+ events/mo — never relevant pre-Series-A. Integrate via JS snippet (funnel: visit → checkout → activation) and `posthog.capture()` in Edge Functions for backend events.

**Sentry (P1 conditional).** If PostHog's error UX disappoints, Sentry's free Developer plan (5k events/mo, 1 user, 30-day retention) is enough pre-launch. SDK supports Next.js + Deno-compatible bindings for Supabase Edge Functions. Decision: consolidate on PostHog by default; add Sentry only if PostHog errors don't cut it.

**Cal.com free (P1).** Free individual plan is unrestricted (unlimited bookings, no caps), with Cal Video for meeting links. Embed an iframe on landing for "Book a demo" — ~5 LOC. Self-hosting adds DevOps surface that founder-touch minimization wants to avoid.

**WhatsApp Cloud API direct (P1).** Telegram bots are primary delivery; WA is purely a fallback for 2FA + receipt + payment confirmation. Twilio's Indonesia SMS rate ($0.44/msg) is punishing. WhatsApp Cloud API direct (no BSP markup) is per-conversation (Rp 300–780). The lift is Meta Business Manager + WABA verification, not the code. Trigger: at first paying customer use Telegram-only; at 5 paying customers, ship WA fallback.

**Defer/skip rationale:**
- *Payment alternatives* — revisit only if Xendit has 2+ outages > 30 min within 60 days, OR a paying customer demands DOKU for enterprise procurement.
- *Search* — no customer-dashboard search use case yet. Pagefind drops in cost-free at P2 when docs grow past ~10 pages.
- *CMS* — every CMS is overhead until founder has 10+ ready-to-publish posts backlog.
- *Translation* — DeepSeek already in stack does ID↔EN at no incremental cost as a side-effect of inference.
- *STT* — Indonesian B2B customers overwhelmingly type in Telegram, not voice-note. Revisit only at 3+ explicit asks.

### Sources

- [Resend pricing](https://resend.com/pricing) | [Resend regions](https://resend.com/docs/dashboard/domains/regions)
- [PostHog pricing](https://posthog.com/pricing) | [Sentry plans](https://sentry.io/pricing/)
- [Crisp pricing](https://crisp.chat/en/pricing/) | [Tawk.to pricing](https://www.tawk.to/pricing/)
- [Cal.com pricing](https://cal.com/pricing)
- [Twilio Indonesia SMS pricing](https://www.twilio.com/en-us/sms/pricing/id) | [WhatsApp Cloud API ID 2026](https://cekat.ai/blog/harga-whatsapp-api-indonesia-2026)
- [Midtrans/Xendit/DOKU comparison](https://albatech.id/blog/midtrans-vs-xendit-vs-doku-perbandingan-payment-gateway-indonesia-2026)
- [Algolia/Meilisearch/Typesense comparison](https://www.meilisearch.com/blog/algolia-vs-typesense)

---

## Track 3 — Pre-Launch Readiness Checklist

> Security categories deferred to Sesi D's audit at [docs/audits/2026-05-10-security-audit-sesi-d.md](../audits/2026-05-10-security-audit-sesi-d.md) (RLS, webhook hardening, anon-key exposure, auth fallbacks). Items below are the holistic non-security checklist.

### Summary scoreboard

| Category | ✅ done | ⚠️ partial | ❌ missing | ⏸ deferred |
|---|---|---|---|---|
| 1. Functional E2E | 3 | 2 | 1 | 1 |
| 2. Performance | 0 | 2 | 4 | 0 |
| 3. Mobile responsive | 2 | 2 | 1 | 0 |
| 4. Browser compatibility | 2 | 2 | 1 | 0 |
| 5. SEO basics | 4 | 1 | 4 | 0 |
| 6. Accessibility (WCAG AA) | 2 | 3 | 2 | 0 |
| 7. Legal & consent | 0 | 1 | 5 | 0 |
| 8. Operational | 1 | 2 | 3 | 0 |
| 9. Customer support readiness | 3 | 1 | 2 | 0 |
| 10. Backup / DR | 0 | 1 | 4 | 1 |
| 11. First-customer onboarding | 2 | 2 | 1 | 0 |
| **Totals** | **19** | **19** | **27** | **2** |

### Detailed checklist

#### 1. Functional end-to-end

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Landing renders on prod | ✅ | live verified via WebFetch | none |
| Checkout → Xendit invoice | ✅ | [checkout.html:778](../../checkout.html) POSTs to `create-invoice` Edge Function | none |
| Payment → provisioning | ⏸ poll-only formally accepted | [welcome.html:383-394](../../welcome.html) polls `subscriptions.status`. **Founder-locked 2026-05-10**: poll-only mode for v1 (single poll worker, 5–15 min cadence per integration). Webhooks revisit at customer workflow needing < 1 min freshness. | Implement single poll worker (Sesi A buildlist #10) |
| Onboarding form (SOUL.md) | ✅ | [onboarding.html](../../onboarding.html) gated, multi-step | none |
| Bot pairing | ⚠️ | `pair-customer-bot-webhook` Edge Function exists; pairing UI in onboarding.html | Founder-supervised dry run on prod required |
| First chat / first output | ❌ | No verified end-to-end trace from "fresh paying customer → bot replies first message" on prod | Run paid fixture E2E rehearsal before first customer |
| Per-customer signed JWT | ⏸ | Phase 5-3c env-gated, not enabled | Acceptable for v1 with founder-supervised onboarding |

#### 2. Performance

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Lighthouse mobile/desktop scores | ❌ | Not measured | Run Lighthouse on prod before launch, target ≥85 mobile |
| Page weight (landing) | ⚠️ | [index.html](../../index.html) is 7,221 lines and loads `react@18 development` (~1MB) + `react-dom development` + `babel/standalone` (~3MB) at runtime ([index.html:37-40](../../index.html)) | Pre-build React/JSX to static; drop Babel-standalone; switch to react production builds — saves ~4–5MB and 1–3s mobile TBT |
| Video assets weight | ⚠️ | 4 mp4s ~4.8MB autoplay-capable in `assets/` | Verify lazy-load + `preload="none"` on heavy videos; consider AV1/H.265 transcode |
| TTFB on prod | ❌ | Not measured | Vercel analytics check |
| Edge Function p95 latency | ❌ | No public measurement | Add observability log of `create-invoice` p95 |
| Image optimization (WebP/AVIF) | ❌ | Small PNGs only today; no `srcset` / responsive imagery | Add `srcset` + AVIF/WebP for any future hero images |

#### 3. Mobile responsive

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Viewport meta set | ✅ | All 5 HTML files | none |
| Tailwind responsive utilities | ✅ | Heavy `md:` / `lg:` breakpoint use throughout | none |
| 320px width unbroken | ⚠️ | Not specifically verified | Spot-check on iPhone SE viewport |
| Touch target ≥ 44px | ⚠️ | CTAs appear ≥ 44px; checkout payment-method radios need verification | Manual check on real device |
| iOS Safari `viewport-fit=cover` | ❌ | [index.html:5](../../index.html) lacks it; onboarding/welcome have it | Add to landing + checkout for iPhone notch safety |

#### 4. Browser compatibility

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Chrome/Edge | ✅ | Tailwind + standard React | none |
| Firefox | ✅ | Standard CSS, no Chrome-only APIs | none |
| Safari `backdrop-filter` | ⚠️ | `liquid-glass` styles include `-webkit-backdrop-filter` fallback | Verify on iOS 15+ |
| iOS Safari HLS | ⚠️ | [index.html:41](../../index.html) loads `hls.js`; Safari supports HLS natively | Check video src formats |
| Old browser fallback | ❌ | No `<noscript>` content; if React+Babel fails to boot user sees blank page | Add minimal `<noscript>` notice + crawlable fallback content |

#### 5. SEO basics

| Item | Status | Evidence | Fix |
|---|---|---|---|
| `<title>` per page | ✅ | All 5 pages have unique titles | none |
| `<meta description>` | ✅ | index, checkout, use-cases have descriptions; onboarding/welcome use `noindex,nofollow` (intentional) | none |
| Open Graph tags | ✅ | [index.html:9-18](../../index.html), [use-cases.html:9-18](../../use-cases.html) | none |
| Twitter Cards | ✅ | [index.html:20-24](../../index.html), use-cases.html:20-24 | none |
| Canonical URLs | ❌ | Zero `rel="canonical"` across all pages | Add `<link rel="canonical">` to each page |
| sitemap.xml | ❌ | Returns 404 on prod | Add static `sitemap.xml` listing public pages |
| robots.txt | ❌ | Returns 404 on prod | Add `robots.txt` with `Sitemap:` directive + disallow `/onboarding.html`, `/welcome.html`, `/admin/` |
| Structured data (Organization/Product/FAQPage) | ❌ | No `application/ld+json` in any page | Add JSON-LD Organization + Product on landing, FAQPage on landing FAQ |

#### 6. Accessibility (WCAG 2.1 AA)

| Item | Status | Evidence | Fix |
|---|---|---|---|
| `lang` attribute | ⚠️ | index/use-cases/onboarding/welcome = `id`; **[checkout.html:2](../../checkout.html) = `lang="en"`** despite Indonesian copy | Change checkout.html to `lang="id"` |
| Logo alt text | ✅ | `alt="weuseai.agent"` on logo `<img>` in index + use-cases | none |
| `aria-label` coverage | ⚠️ | 12 in index, 8 in onboarding, 2 each in checkout/welcome, **0 in [use-cases.html](../../use-cases.html)** | Add aria-labels to icon-only buttons in use-cases.html |
| Color contrast | ⚠️ | Footer text `text-white/30` ≈30% opacity on black, below WCAG 4.5:1 ([index.html:7177](../../index.html)); `text-white/45` borderline | Bump muted text to ≥ `text-white/65` |
| Focus indicators | ⚠️ | [welcome.html:81-84](../../welcome.html) has `.focus-ring`; checkout has field focus styles. Landing relies on default browser focus, often invisible on dark bg | Add explicit `:focus-visible` outline globally |
| Semantic HTML | ✅ | `<main>`, `<section>`, `<aside>`, `<form>`, `<label>` used in checkout/onboarding/welcome | none |
| Keyboard nav | ❌ | Not verified end-to-end (FAQ accordion, pricing toggle, payment radio) | Manual tab-through audit of landing + checkout |

#### 7. Legal & consent

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Privacy policy live | ❌ | Footer links `href="#"` placeholder ([index.html:7180](../../index.html), [checkout.html:531](../../checkout.html)) | **P0** — write minimum-viable privacy policy (UU PDP-aware), add `/privacy.html` |
| Terms of service live | ❌ | Same `href="#"` placeholders | **P0** — write ToS, add `/terms.html`. Inline 14-day garansi T&C ([index.html:7138-7161](../../index.html)) is not a full ToS |
| ToS acceptance checkbox at checkout | ❌ | [checkout.html](../../checkout.html) payment form has no "I accept ToS" checkbox | **P0** — add required checkbox before submit |
| Cookie consent / UU PDP banner | ❌ | No banner anywhere | Add minimum cookie/data-processing banner |
| Marketing email opt-in separate | ❌ | No opt-in checkbox at checkout | Add unchecked opt-in (separate from ToS), default off |
| Refund/garansi terms accessible from checkout | ⚠️ | Inline T&C on landing only; not linked from checkout | Mirror or link from checkout |

#### 8. Operational

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Internal observability | ✅ | `packages/observability/` provides per-customer 6-stage status; `admin/observability/customer.html` exists | none |
| Status page (public) | ❌ | No public status page | Lightweight `status.weuseai-agent.vercel.app` or footer status badge |
| Error monitoring | ⚠️ | `docs/risks-known.md` is a manual log; no Sentry/PostHog wired | Wire PostHog (or Sentry) — Track 2 covers this |
| P0 runbook | ⚠️ | `docs/troubleshooting.md` covers customer scenarios; `docs/risks-known.md` has operator notes; **no consolidated "if prod is down at 3am" runbook** | Add `docs/runbooks/p0-prod-down.md` |
| Alerting | ❌ | No alerting wired | Add Telegram alert on Edge Function error rate spike |
| Cron job (nightly cleanup) | ✅ | `vercel.json:8-12` schedules `/api/nightly-cleanup` 03:00 daily | none |

#### 9. Customer support readiness

| Item | Status | Evidence | Fix |
|---|---|---|---|
| WhatsApp number listed | ✅ | `+62 821 5490 2561` on landing footer ([index.html:7172](../../index.html)) and welcome/onboarding | none |
| Email address listed | ⚠️ | `support@weuseai.id` referenced in `docs/troubleshooting.md` and `docs/faq.md` only — **not on any live HTML page** | Add support email to landing footer + checkout |
| Cal.com booking | ✅ | `cal.com/weuseai.agent/15min` linked from landing CTA | none |
| Response-time SLA documented | ✅ | "Median 12 min Pro/Studio, 4hr Starter" on landing FAQ | none |
| Hours displayed | ✅ | `Sen-Sab 9-21 WIB` on WhatsApp pill | none |
| Escalation path | ❌ | No documented "if WA support is offline" path | Add escalation note to `docs/troubleshooting.md` |
| Public-facing FAQ | ❌ | `docs/faq.md` exists but is not exposed on a `/faq.html` page | Render `docs/faq.md` as `/faq.html` |

#### 10. Backup / disaster recovery

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Supabase database backup | ⚠️ | Supabase platform offers daily automated backups by default — **not verified configured for this project** | Verify in Supabase dashboard, screenshot, document |
| Customer data export (UU PDP portability) | ❌ | No export endpoint or dashboard button | Add basic JSON export from customer dashboard |
| Restore tested | ❌ | Per `CLAUDE.md`, "daily backup" deferred to Phase 3 | Run a test-DB restore drill before launch |
| Per-VPS daily backup | ⏸ | `docs/05-One-Click-Build-Plan.md` schedules this for Day 20 | Document deferral as known risk |
| Disaster runbook | ❌ | None exists | Add `docs/runbooks/disaster-recovery.md` covering "Supabase down" + "IDCloudHost outage" |

#### 11. Onboarding & first-customer support

| Item | Status | Evidence | Fix |
|---|---|---|---|
| Founder ready to hand-hold | ✅ | Founder + WhatsApp + 12-min response SLA per `CLAUDE.md` | none |
| Onboarding doc live | ⚠️ | `docs/getting-started.md` and `docs/troubleshooting.md` are well-written but **not exposed as web pages** | Render to `/getting-started.html` + `/troubleshooting.html` |
| Recovery if onboarding fails | ✅ | [welcome.html:407-411](../../welcome.html) handles `failed` state, links WA support; onboarding.html has multiple WA fallbacks | none |
| Per-customer status visible to founder | ✅ | `admin/observability/customer.html` + diagnose CLI | none |
| First-customer rehearsal | ❌ | No documented end-to-end dry run (e.g., founder pays Rp 1k test invoice) | Run founder-funded fixture invoice through full E2E once before public launch |

### Top 10 P0 readiness gaps (blocking first paying customer)

1. **Privacy policy missing** — footer links to `#`. UU PDP exposure + Xendit/Visa requirement. → Write 1-page MVP, host at `/privacy.html`.
2. **Terms of Service missing** — same `#` placeholders. Risk of disputes on refund/cancellation. → Write minimum ToS, add `/terms.html`.
3. **Checkout has no ToS-acceptance checkbox** — payment processors and Indonesian e-commerce regs expect it. → Add required checkbox.
4. **End-to-end "first paying customer" rehearsal not run** — no proof the full chain (Xendit → provision → bundle pull → bot pair → first reply) works on prod. → Founder runs paid fixture invoice before launch.
5. **Phase 5-5b poll worker not yet implemented** — founder-locked 2026-05-10 to poll-only for v1; need single poll worker with 5–15 min cadence per integration + monitoring on stuck-in-pending durations. Webhook wiring deferred to "customer workflow needs < 1 min freshness" trigger. → Implement poll worker.
6. **No error monitoring / alerting** — silent failures invisible. → PostHog (or Sentry) + Telegram alert on Edge Function error rate.
7. **No Supabase backup verification or restore drill** — no proof recovery works. → Verify Supabase auto-backups enabled, run one restore drill.
8. **No public sitemap.xml / robots.txt** — index/checkout/welcome/onboarding indexable accidentally; SEO blocker. → Add static files.
9. **Footer text contrast `text-white/30` fails WCAG 4.5:1** — accessibility liability. → Bump to `/65` minimum.
10. **`checkout.html` has `lang="en"` but copy is Indonesian** — minor but visible to screen-reader users + a11y audits will flag.

### Top 5 P1 readiness gaps (pre-launch must-fix, ship within first week)

1. **Switch landing from React-dev + Babel-standalone CDN to a pre-built bundle** — saves multi-MB and seconds of mobile TBT.
2. **Add support email (`support@weuseai.id`) to landing/checkout footers** — currently only in docs.
3. **Add JSON-LD Organization + Product structured data** — Google rich results / brand presence.
4. **Render `docs/faq.md` and `docs/getting-started.md` to public HTML pages** — discoverable customer self-serve.
5. **P0 runbook + disaster runbook** — `docs/runbooks/p0-prod-down.md` + `disaster-recovery.md`.

---

## Track 4 — Strategic Improvements (compounding-value roadmap)

### Compounding-value matrix

| # | Idea | Strategic value | Demand signal needed | Complexity | Revisit trigger | Verdict |
|---|---|---|---|---|---|---|
| 1 | Customer dashboard (read-only) | 4/5 | First customer asks "where can I see what my agent did?" OR churn-risk cites lack of visibility | M (~2 weeks) | After paying customer #2 OR customer #1 asks | **Build at trigger (P1, Month 1-2)** |
| 2 | Public API + signed webhooks | 3/5 | Studio customer with dev team requests `agent_decision` webhook in writing AND deal ≥ Rp 25jt/mo | L (~3 weeks + ongoing) | At 10 Studio customers OR first enterprise inbound | **Wait** |
| 3 | Agent marketplace (3rd-party packs) | 2/5 | 2 unaffiliated devs offer to ship a pack AND a paying customer requests one | XL | Phase 7+, after 25 paying customers | **Skip 12+ months** |
| 4 | Multi-region deployment (SG / US) | 2/5 | 3 SG/MY/PH leads abandon citing IDCH-only OR latency complaint from paying customer | L | At 50 paying ID customers OR signed regional partnership | **Wait** |
| 5 | Mobile app (native iOS / Android) | 1/5 | Customers complain Telegram-mobile is broken (it isn't) | L | Never under current model | **Skip permanently** |
| 6 | Browser extension | 2/5 | 3+ customers ask in writing for "send context from email/Linear to agent" | M | At 10 paying customers showing daily web-app usage | **Wait** |
| 7 | Slack/Discord integrations | 3/5 | One Studio customer requires Slack-native AND deal contingent | M (~1.5 weeks per platform; Vercel chat-sdk reusable) | After first Slack-conditional deal OR 3+ asks | **Wait (Month 5-6 if signal arrives)** |
| 8 | Voice agent (STT/TTS) | 2/5 | 3+ customers send voice notes that fail OR explicit ask | M | At 10 paying customers with mobile-on-the-go founder personas | **Wait** |
| 9 | First-party templates marketplace | **5/5** | Onboarding shows >40% time on stage-1 framing OR 2+ customers ask for vertical templates | M | Month 3 — strong compound, low effort | **Build at trigger (P2, Month 3-4)** |
| 10 | Customer-success automation (meta-agent) | **5/5** | First customer goes silent ≥ 7 days OR fails to advance roadmap stage in 14 days | S (~3-5 days) | At 5 paying customers | **Build at trigger (P1, Month 1-2)** — cheapest high-value compound on the list |
| 11 | Local language expansion (MY/PH/VN) | 1/5 | ≥ 5 inbound leads in single non-ID country with willingness-to-pay | XL (~3 mo per country, regulatory + payment rails) | At 100 paying ID customers | **Skip 24+ months** |
| 12 | ID B2B partnership integrations (Mekari/Jurnal/Mayar/Tokopedia) | **5/5** | Any Studio customer asks for accounting / commerce / HR integration in writing | M-L (~1-2 weeks per integration) | At 3 paying customers; pick 1-2 highest-demand first | **Build at trigger (P2, Month 3-4)** — genuine moat |
| 13 | AI-native customer onboarding | 4/5 | Founder spends > 2hr/customer on pairing for 3+ customers | M | After customer #3 (founder pain real) | **Build at trigger (P1, Month 1-2)** — aligns with locked memory rule |
| 14 | Open-core (runtime/pack format OSS) | 3/5 | 2+ unsolicited dev inbounds asking to extend AND no copycat operator yet | L (license, contributor agreement, governance) | Year 2 OR competitive pressure spike | **Wait** |

### Key strategic insight

The compounding mechanism that uniquely belongs to weuseai.agent is **Indonesian-context IP encoded as templates + B2B integrations** (ideas #9 + #12). A global LLM agent (OpenAI / Anthropic / Salesforce Agentforce) can match generic capability tomorrow — but they cannot cheaply replicate Mekari/Jurnal/Tokopedia/OSS/DJP integrations or 50 first-party ID-vertical templates. Track 4 priorities should bias hard toward #9 (templates) and #12 (ID B2B integrations); these are the only ideas where local advantage compounds faster than global model capability.

Everything else is either commodity infrastructure (dashboard, public API, voice) or premature scaling (multi-region, open-core, marketplace, language expansion). Build commodity items only when a paying customer's signal forces it; never as roadmap-driven work. The customer-success meta-agent (#10) is the cheapest high-value compound on the list because it scales retention with customer count using infra that already exists (`bd_decisions_log` + `business_roadmap_state` + admin observability).

### Recommended 6-month strategic roadmap (post first paying customer)

**Month 1-2 (validate fit, instrument retention):**
- Customer dashboard read-only (#1) — triggered by customer #1 asking, or customer #2 onboarded
- Customer-success meta-agent (#10) — small, high-leverage, ~3-5 days
- AI-native onboarding refinement (#13) — kills founder-touch pain at customer #3

**Month 3-4 (deepen ID moat):**
- First-party templates marketplace (#9) — author 5-10 ID-vertical templates
- ID B2B partnership integrations (#12) — start with Jurnal (accounting) + Tokopedia/Shopee (commerce)

**Month 5-6 (expand reach if signals justify):**
- Slack integration (#7) IF a deal is signal-conditional
- Voice agent (#8) IF mobile usage telemetry shows demand
- Public API + webhooks (#2) IF first enterprise inbound arrives

### Strong skips (don't build)

| Idea | Why skip | What to build instead |
|---|---|---|
| Mobile app native (#5) | Telegram already IS the mobile app at $0; native = ongoing tax with no compound | Customer dashboard (#1) covers desktop; voice (#8) if mobile UX is the issue |
| Agent marketplace 3rd-party (#3) | Empty-shelves problem at < 25 packs; security/dispute ops cost is high; 12+ months premature | First-party templates (#9) — 80% of value, 10% of complexity |
| Local language expansion (#11) | Indonesia TAM = 65M SMBs; SEA expansion costs more than it returns until ID is dominated | Deepen ID moat with B2B integrations (#12) and ID templates (#9) |

---

## Consolidated Sesi A buildlist (all tracks, prioritized)

### P0 — ship before first paying customer onboards

> **All P0 items below are Sesi-A-executable** post founder decisions locked 2026-05-10 — no founder strategic input required. Three items embed minor non-strategic founder actions: items 6-8 may need a one-time third-party account signup (~5 min: Resend, Crisp; item 6's `support@` email requires DNS/MX setup if not already provisioned); item 9 needs a ~30 s Rp 1 k fixture purchase for the E2E rehearsal (or can use Xendit sandbox first, real payment as final smoke). Sesi A surfaces credential requests as it goes; founder treats them as unblock-prompt actions, not decisions.

| # | Task | Source track | Effort | Notes |
|---|---|---|---|---|
| 1 | Write `/privacy.html` v1.0 from boilerplate (Bahasa Indonesia primary controls per UU 24/2009 + EN reference translation), UU PDP-aware (Art. 21 disclosures, Art. 5 rights, Art. 53–56 cross-border, sub-processor list). Add "v1.0 — pending counsel review" footer note. | T1, T3 | S-M (1-2 days) | Use Master Agent legal-dispatch to draft from open templates (e.g., Iubenda BI templates, Mekari pattern). Counsel review = post-revenue trigger. |
| 2 | Write `/terms.html` v1.0 from boilerplate (BI primary controls + EN reference) — service description (Starter Rp 299k / Pro Rp 1.2jt / Studio Rp 4.9jt setup + Rp 99k/mo hosting + optional Rp 49k Always-On), payment terms (Xendit), IP, liability cap, **governing law: Indonesia, jurisdiction: Jakarta, arbitration: BANI**. Add "v1.0 — pending counsel review" footer note. | T1, T3 | S-M (1-2 days) | Same draft pipeline as #1 |
| 3 | Write `/refund-policy.html` v1.0 — extract from inline FAQ + 14-day garansi T&C; standalone page with how-to-request + processing time. BI primary, EN reference. | T1, T3 | S (half day) | Existing inline content + processor fee deduction note |
| 4 | Add footer with legal/support/operator block to all 5 HTML pages — replace `href="#"` placeholders. **Operator wording (founder-locked 2026-05-10)**: "Dioperasikan oleh Richie [surname], berbasis di Jakarta. Kontak: [support email]." (no PT yet — PT is logged trigger). | T1, T3 | S (half day) | Footer = legal links + support email + WA + operator wording. Upgrade to PT name + NIB + NPWP when PT registered. |
| 5 | Add ToS-acceptance required checkbox to checkout.html payment form | T3 | S (1 hour) | Plus separate unchecked marketing-email opt-in |
| 6 | Add `support@weuseai.id` + `/contact.html` page (WA, email, hours, escalation) | T1, T3 | S (half day) | Currently only in `docs/troubleshooting.md`; needs live page |
| 7 | Resend integration — typed wrapper for transactional email (receipts, password reset, provisioning success) | T2 | S (1 day) | $0 free tier; ~50 LOC |
| 8 | Crisp free-tier chat widget on landing | T2 | S (2 hours) | Script tag + webhook |
| 9 | Paid-fixture E2E rehearsal harness — Sesi A builds smoke harness + recording + runbook so founder triggers a Rp 1 k Xendit invoice purchase (~30 s action) and full chain (Xendit → poll worker → provisioning → bot pair → first reply) is recorded + logged | T3 | M (Sesi A: 1 day harness + ~30 s founder action + 1-day fix budget) | Proves the poll-only chain works on prod for a fresh customer. Sesi A delivers the harness; founder action is a single de-minimis purchase, no strategic decision. |
| 10 | **Implement single poll worker for Phase 5-5b integrations** — 5–15 min cadence per integration, monitoring on stuck-in-pending durations, exponential backoff on persistent failure. **Founder-locked 2026-05-10**: poll-only is the v1 path. Webhook wiring revisited only when customer workflow needs < 1 min freshness. | T3 | M (1-2 days) | Implementation cost saved vs. webhook wiring should fund Mekari/Jurnal/Tokopedia/Mayar coverage breadth (Track 4 #12, P2 buildlist) |
| 11 | Verify Supabase auto-backups enabled + screenshot + run one restore drill | T3 | S-M (half day) | Mgmt API verification + test restore |
| 12 | Add `sitemap.xml` + `robots.txt` (disallow `/onboarding.html`, `/welcome.html`, `/admin/`) | T3 | S (1 hour) | Static files |
| 13 | Add `<link rel="canonical">` to all 5 HTML files | T3 | S (30 min) | One line per file |
| 14 | Fix [checkout.html:2](../../checkout.html) to `lang="id"`; bump muted text from `text-white/30` to `text-white/65` for WCAG 4.5:1 | T3 | S (30 min) | Trivial |
| 15 | Add `viewport-fit=cover` to [index.html:5](../../index.html) and checkout.html | T3 | S (15 min) | iPhone notch safety |

**Removed from P0** (founder-locked 2026-05-10):
- *(was #16)* "Verify with counsel BI is the controlling text" — counsel review is now post-revenue trigger; BI controlling is locked, no verification step
- *(was #17)* "Begin Kominfo PSE Private registration" — PSE registration deferred to logged trigger (1000 paid users OR Rp 100jt cumulative revenue, after PT exists). MVP carries regulatory exposure knowingly.

### P1 — ship within first week post-launch

| # | Task | Source track | Effort | Notes |
|---|---|---|---|---|
| 18 | PostHog Cloud — JS snippet on landing (funnel) + `posthog.capture()` in Edge Functions; covers analytics + session replay + error tracking + feature flags + surveys in one tool | T2, T3 | M (1 day) | $0 up to 1M events; consolidates 3 would-be P1 tools |
| 19 | Telegram alert webhook on Edge Function error-rate spike (driven by PostHog or direct cron) | T3 | S (half day) | Operational alerting |
| 20 | Public status page (UptimeRobot / BetterStack free tier) — Bot API, Webhook, Database, LLM | T1, T3 | S-M (half day) | Footer status badge OR `status.weuseai-agent.vercel.app` |
| 21 | Render `docs/faq.md` and `docs/getting-started.md` and `docs/troubleshooting.md` to public HTML pages | T1, T3 | M (1 day) | Markdown-to-HTML build step or static prerender |
| 22 | Replace landing CDN React-dev + Babel-standalone with pre-built production bundle | T3 | L (2-3 days) | Largest perf win; ~4-5 MB savings + 1-3s mobile TBT |
| 23 | About / Tentang Kami page | T1 | S (half day) | Founder bio, mission, PT entity, location, founding year |
| 24 | Security / Keamanan page | T1 | S (half day) | Posture statement; references Sesi D's audit work + SOC 2 roadmap |
| 25 | Cal.com Cloud free embed on landing as "Book a demo" CTA | T2 | S (2 hours) | iframe |
| 26 | Sub-processor list page linked from Privacy Policy — UU PDP cross-border disclosure | T1 | S (half day) | Table form |
| 27 | Pricing standalone page replacing `#pricing` anchor | T1 | M (1 day) | Tier comparison + FAQ + CTA |
| 28 | JSON-LD Organization + Product on landing; FAQPage on landing FAQ section | T3 | S (half day) | Google rich results |
| 29 | P0 runbook (`docs/runbooks/p0-prod-down.md`) + disaster runbook (`docs/runbooks/disaster-recovery.md`) | T3 | M (1 day) | "If prod is down at 3am" + Supabase / IDCloudHost outage paths |
| 30 | Cookie/data-processing consent banner | T3 | S (half day) | Minimum UU PDP consent UI |

### P2 — within 30-60 days post-launch

| # | Task | Source track | Effort | Notes |
|---|---|---|---|---|
| 31 | Customer-success meta-agent (#10 from Track 4) | T4 | S (3-5 days) | Cheapest high-value compound |
| 32 | Customer dashboard read-only (#1 from Track 4) — triggered by customer ask or customer #2 | T4 | M (~2 weeks) | Reuses existing observability endpoints |
| 33 | AI-native customer onboarding refinement (#13) | T4 | M | Reduce founder pairing time to ~0 |
| 34 | First-party templates marketplace (#9) — start with 5-10 ID-vertical templates | T4 | M | Genuine compounding moat |
| 35 | WhatsApp Cloud API direct (Meta) — receipt + 2FA fallback | T2 | M (3-5 days incl. WABA verification) | Per-conversation pricing; trigger at 5 paying customers |
| 36 | Acceptable Use Policy (AUP) page | T1 | S (half day) | Suspension grounds for misuse |
| 37 | Cookie Policy page | T1 | S (half day) | UU PDP-compliant if analytics cookies are set |
| 38 | Customer data export endpoint (UU PDP Art. 5 portability right) | T3 | M (1-2 days) | JSON export from customer dashboard |
| 39 | Pagefind static search on docs (when content backlog warrants) | T2 | S (half day) | Zero-cost; defer until docs > 10 pages |

### P3 — wait for customer signal

| # | Task | Source track | Trigger to revisit |
|---|---|---|---|
| 40 | ID B2B partnership integrations (#12 — Jurnal, Tokopedia, Mekari, Mayar) | T4 | At 3 paying customers; pick highest-demand first |
| 41 | Public API + signed webhooks (#2) | T4 | First enterprise inbound OR 10 Studio customers |
| 42 | Slack integration (#7) | T4 | First Slack-contingent deal OR 3+ asks |
| 43 | Voice agent STT/TTS (#8) | T4 | 30%+ voice attempts in mobile data OR 3+ asks |
| 44 | Browser extension (#6) | T4 | 3+ customers asking for web-context import |
| 45 | Multi-region deployment (#4) | T4 | 50 ID customers OR cross-border partnership signed |
| 46 | Open-core (#14) | T4 | First competitor copycat OR 2+ dev inbounds |
| 47 | Per-persona use-case landing pages (`/use-cases/insurance-agent`, etc.) | T1 | After validating the all-in-one use-cases page converts |
| 48 | Case studies / customer logos | T1 | After 3+ paying customers willing to be public references |
| 49 | Video tutorials index | T1 | After 5+ customers; first 3-5 Loom embeds |
| 50 | Sample workflow gallery (10-20 prompts per persona) | T1 | After templates marketplace (#9) reveals which prompts convert |

### Skip — recommended NOT to build

| # | Item | Why skip | Track |
|---|---|---|---|
| - | Twilio / Vonage SMS Indonesia | $0.44/SMS economically irrational vs WhatsApp/Telegram | T2 |
| - | Postmark / Mailgun / SendGrid / AWS SES | Resend's developer DX wins for minimal-touch | T2 |
| - | Mixpanel / Amplitude | Sales-led, redundant once PostHog is in | T2 |
| - | Plausible / Vercel Analytics | Pageview-only, redundant once PostHog is in | T2 |
| - | Intercom / Front / Help Scout / Plain | Crisp covers ID market at lower cost | T2 |
| - | Midtrans / DOKU / OY! / Mayar payment | Xendit covers all rails; redundancy is premature | T2 |
| - | Sanity / Strapi / Contentful | Zero blog posts means zero CMS need | T2 |
| - | Self-hosted Cal.com | DevOps cost > value pre-Series-A | T2 |
| - | DeepL / Google Translate API | DeepSeek (in stack) does ID↔EN as inference side-effect | T2 |
| - | Mobile app native (iOS/Android) | Telegram IS the mobile app at $0; native = ongoing tax | T4 |
| - | Agent marketplace 3rd-party | Empty shelves at < 25 packs; first-party templates = 80% value at 10% complexity | T4 |
| - | Local language expansion (MY/PH/VN) | ID TAM = 65M SMBs; SEA adjacency expensive until ID dominated | T4 |

---

## Founder decisions locked 2026-05-10

The 5 strategic questions Sesi B raised were answered the same day. All P0 items in the Sesi A buildlist above are now executable without further founder input.

| # | Question | Lock | Implication for Sesi A |
|---|---|---|---|
| 1 | Counsel relationship for UU PDP-compliant legal text | **No counsel relationship.** Legal text ships as v1.0 from boilerplate templates with "pending counsel review" footer note. Counsel review becomes a post-revenue trigger, not a pre-launch blocker. | P0 #1-3 unblocked; legal-pack agent generates from open templates |
| 2 | PT entity status for footer business-info | **No PT registered yet.** Footer uses personal-operator wording: "Dioperasikan oleh Richie [surname], berbasis di Jakarta. Kontak: [support email]." | P0 #4 unblocked with explicit wording |
| 3 | Kominfo PSE registration status | **Not yet registered.** PSE deferred to logged trigger (1000 paid users OR Rp 100jt cumulative revenue, after PT exists). Regulatory exposure carried knowingly during MVP. Omit PSE badge from footer. | Removed from P0 — see logged trigger below |
| 4 | Webhook callback wiring vs. poll-only mode for v1 (Phase 5-5b) | **Poll-only v1.** Single poll worker, 5–15 min cadence per integration. Webhooks revisit when customer workflow needs < 1 min freshness. Implementation cost saved redirected to ID B2B integration breadth (Mekari/Jurnal/Tokopedia/Mayar). | P0 #10 reframed as poll-worker implementation |
| 5 | Bahasa Indonesia as primary controlling legal language | **Confirmed.** All legal docs BI primary, EN reference translation. Dispute clause: BI version controls. Jurisdiction: Jakarta. Arbitration: BANI. | P0 #1-3 author BI first; "previously P0 #16 (verify with counsel BI is controlling)" removed since locked |

---

## Founder-decision triggers logged

These items are explicitly **deferred until trigger conditions are met**. Sesi A does not build them; the founder revisits them when triggers fire.

| Item | Trigger to revisit | Why deferred | Risk carried meanwhile |
|---|---|---|---|
| **PT entity registration** (PT BUMS or PT PMA) | First concierge customer signs **OR** Rp 50jt cumulative revenue, whichever comes first | Operating as personal entity is acceptable for MVP; PT setup costs ~Rp 8-15jt + 2-4 weeks; not justified pre-revenue | Personal liability exposure on customer disputes; less professional appearance to enterprise buyers |
| **Kominfo PSE-Lingkup-Privat registration** | 1000 paid users **OR** Rp 100jt cumulative revenue, after PT exists (whichever is later — PT must exist first to register) | Registration requires registered legal entity; pre-PT registration is impossible; pre-revenue platform-blocking risk is acceptable for MVP | Kominfo can technically block the platform for unregistered PSE; in practice enforcement is selective, but exposure is real |
| **Counsel review of legal pack** (Privacy / ToS / Refund) | Post-revenue (no specific threshold; revisit at first revenue milestone OR if any legal dispute arises) | Counsel relationship costs ongoing retainer; v1.0 boilerplate is acceptable for MVP with "pending review" disclosure | Legal text may be unenforceable in edge cases; dispute handling may favor customer until counsel-validated v2.0 |
| **Phase 5-5b webhook callback wiring** | Customer workflow needs < 1 min freshness (e.g., concierge customer requires real-time approval routing) | Poll-only v1 is sufficient for current 5-stage roadmap pacing; webhook wiring + replay protection costs 2-3 days dev + ongoing maintenance | Approval queue freshness is bounded by poll cadence (5-15 min); not visible to customer in current flow |

---

## What this brainstorm did NOT cover

- **Security** — Sesi D shipped a comprehensive audit at [docs/audits/2026-05-10-security-audit-sesi-d.md](../audits/2026-05-10-security-audit-sesi-d.md). 3 P0s + 6 P1s + 7 P2s + 4 P3s. Sesi A's actual buildlist must merge Sesi D's findings with this Sesi B buildlist; Sesi B explicitly defers all security items to Sesi D.
- **Lighthouse measurement on prod** — Track 3 recommends running Lighthouse but did not run it (read-only research scope). Sesi A's first step on the perf items should be measurement.
- **Counsel-verified legal text** — v1.0 drafts ship from boilerplate per founder lock; counsel review is a logged post-revenue trigger.
- **PSE registration mechanics** — deferred per founder lock; logged trigger.
- **Pricing experiments / packaging changes** — out of scope per mandate (forward-looking gap analysis, not pricing strategy).

---

## Methodology

- Read [memory snapshots](file:///Users/richiekidnovell/.claude/projects/-Volumes-Extreme-SSD-weuseai-agent/memory/) — active dev state, founder-touch minimization rule, production URL
- Surveyed live site via WebFetch (5 HTML pages + sitemap/robots probes)
- Ran 4 parallel research agents (one per track) with self-contained context briefs
- Cross-referenced Sesi D's security audit to avoid duplication
- B2B SaaS reference checks: Stripe, Linear, Vercel, Supabase, Mekari (ID), Tokopedia (ID)
- Cited current pricing as of May 2026 for all API integration recommendations

**Time:** ~25 minutes total (4 agents in parallel × ~3-4 min each + synthesis)
**Cost:** Rp 0 (no live API calls, no infra changes, no production reads beyond public landing pages)
