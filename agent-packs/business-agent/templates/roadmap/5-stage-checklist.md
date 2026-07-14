# Indonesian Founder 5-Stage Roadmap

> Per-stage deliverables + decision points + suggested specialist persona for delegation.

---

## Stage 1: Idea (pre-launch)

**Goal:** Validate market signal before committing capital / time.

**Deliverables:**
- Customer interview log (15-20 conversations) — Deep Researcher
- Competitor scan + market sizing — Deep Researcher
- Value-prop one-liner (refined dari 3+ iterations) — The Pro
- "Niche-1" customer profile (most-likely first 10 customers) — Deep Researcher

**Decision points:**
- Pivot vs persevere — kalau 15 conversations ngga surface clear pain, pivot.
- Solo vs co-founder — bring co-founder onboard kalau gap kompetensi (mis. kamu sales, butuh tech).

**Stuck signal:** spend >2 bulan di idea stage tanpa first paying customer signal → consider pivot.

---

## Stage 2: Setup (legal & compliance)

**Goal:** Legal foundation supaya kamu bisa transact + sign contracts.

**Deliverables:**
- PT atau CV decided + akta notaris — incorporation-advisor skill
- NPWP badan + NPWP personal (kalau belum)
- OSS NIB (Nomor Induk Berusaha) — incorporation-advisor
- Rekening badan di bank Indonesia (BCA / Mandiri / BNI / others)
- BPJS Kesehatan + Ketenagakerjaan — kalau hire ≥1 karyawan
- Domain + email professional (yourbusiness.com) — Web Creator (domain-advisory)

**Decision points:**
- PT vs CV — base on modal availability + scale plan (lihat incorporation-advisor)
- Solo founder atau hire dulu — solo lebih cepet eksekusi tahap awal; hire kalau ada gap kompetensi yang block kamu
- Bank pilihan — BCA paling integrated dengan e-commerce, Mandiri lebih kuat di B2B large

**Stuck signal:** legal setup tertunda >2 bulan → biaya opportunity. Hire jasa notaris + akuntan dari awal kalau kamu hands-off.

---

## Stage 3: Identity (brand + minimum infra)

**Goal:** Brand voice + payment + first site supaya bisa onboard customer pertama.

**Deliverables:**
- Brand name + tagline finalized — The Pro (voice consistency)
- Visual identity basics (logo, color, typography) — Web Creator
- Landing page atau multi-page site — Web Creator
- Payment gateway integrasi (Xendit / Midtrans / DOKU) — Trade Pro untuk pricing tier framing
- WhatsApp Business + admin number
- Email automation basic (welcome, transactional)

**Decision points:**
- Single-page site vs multi-page — start single, multi kalau service offering ≥3
- Self-host vs Vercel deploy — Vercel default kalau mau cepet
- Payment gateway pilihan — Xendit untuk UMKM-friendly, Midtrans untuk e-commerce big

**Stuck signal:** brand iterasi >5x tanpa final → put a deadline + ship. Brand evolve ongoing.

---

## Stage 4: Build (product + first 10 customers)

**Goal:** Product-market fit signal dari first 10 paying customers.

**Deliverables:**
- MVP product / service yang deliverable consistently
- First 10 customer feedback synthesis — Deep Researcher
- Customer support flow (WA + email response time SLA)
- Refund / cancellation policy — Doc Expert
- T&C + privacy policy — Doc Expert
- Basic analytics (revenue, customer count, churn) — Trade Pro untuk dashboard

**Decision points:**
- Free trial vs paid-only — paid-only kalau bisa; free trial only kalau pricing barrier signal jelas
- Customer support: founder-driven vs hire — founder-driven first 50 customers untuk learn

**Stuck signal:** 3 bulan tanpa first 10 paying customer → revisit value prop atau pricing.

---

## Stage 5: Sell (channel + retention engine)

**Goal:** Repeatable customer acquisition + retention engine.

**Deliverables:**
- Top 2-3 acquisition channels identified (data-driven, not vibes)
- Channel-specific content engine — Social Conductor (calendar) + Web Creator (blog/landing)
- Retention triggers (email sequence, milestone celebrations, win-back) — Social Conductor
- Referral program (kalau relevan)
- Pricing tier review (after 30+ customers) — Trade Pro
- Tax compliance auto-set (PPh, PPN sesuai status) — compliance-checker

**Decision points:**
- Doubling-down vs diversifying channels — double-down kalau 1 channel >60% of revenue
- Hire first sales / marketing FTE — kalau founder bandwidth ngga cukup

**Stuck signal:** revenue plateau di 10-20 customer/bulan tanpa growth → revisit retention hook + acquisition channel mix.

---

## After Stage 5

Phase 6+ scope (future Business Director expansion):
- Full department workspaces (Sales, Marketing, Eng, Legal, Finance) — persistent state across sessions
- Investor dashboard + cap table tracker
- Custom codebase integration untuk product roadmap auto-track
- Dedicated HR agent untuk team scale

> _Catatan: roadmap ini Indonesian-context (PT/CV, OSS, BPJS, payment gateway lokal). Buat business yang export-driven atau international-first, beberapa item shift._

---

## BD v3 state-machine mapping (Phase 5-2)

The customer-facing narrative above is granular (33+ checklist items). BD v3 tracks
progress with 4 coarse-grained deliverable IDs per stage (20 total) — the keys
in `business_roadmap_state.deliverables_completed` and the source of truth in
`services/business-roadmap/src/stages.ts`. Each ID rolls up several narrative
items.

Drift defense: a unit test in `tests/business-roadmap-state-machine.spec.ts`
asserts these IDs match the `current_stage` CHECK enum. Renaming requires
synchronized updates here + in `stages.ts` + in `20260510100000_phase_5_master_agent_state.sql`.

| Stage | Deliverable id | Rolls up narrative items |
|---|---|---|
| Idea | `idea_problem_articulated` | Value-prop one-liner + Niche-1 customer profile |
| Idea | `idea_target_customer_defined` | Niche-1 customer profile (segment + pain point) |
| Idea | `idea_competitor_scan_done` | Competitor scan + market sizing |
| Idea | `idea_pricing_hypothesis` | Initial pricing model (covered partially in customer interview log) |
| Setup | `setup_entity_chosen` | PT vs CV decision (incorporation-advisor) |
| Setup | `setup_pt_incorporated` | Akta notaris + OSS NIB |
| Setup | `setup_npwp_acquired` | NPWP badan + NPWP personal |
| Setup | `setup_bpjs_registered` | BPJS Kesehatan + Ketenagakerjaan (waivable for non-PT) |
| Identity | `identity_brand_defined` | Brand name + tagline + visual identity |
| Identity | `identity_landing_live` | Landing/multi-page site (Web Creator) |
| Identity | `identity_socials_claimed` | WhatsApp Business + handle registrations |
| Identity | `identity_legal_pages_published` | Privacy + ToS (Doc Expert; gated by `contract_sign` approval) |
| Build | `build_mvp_shipped` | MVP product/service deliverable consistently |
| Build | `build_first_payment_flow` | Payment gateway integration (Xendit/Midtrans/DOKU); gated by `regulatory_filing` when going live |
| Build | `build_customer_support_channel` | WA + email response time SLA |
| Build | `build_unit_economics_modeled` | Basic analytics (revenue, customer count, churn) |
| Sell | `sell_first_paying_customer` | First customer revenue (gated by `public_emission` if first marketing campaign goes out) |
| Sell | `sell_10_paying_customers` | First 10 customer feedback synthesis |
| Sell | `sell_referral_loop_active` | Referral program live |
| Sell | `sell_recurring_revenue_stable` | MRR positive 3+ months (top 2-3 channels stable) |

### Approval gates (Q4=C per-action expiry)

Some deliverables require an `approval_requests` row before BD v3 marks them complete:

- `setup_pt_incorporated` → `incorporate` (14-day expiry)
- `identity_legal_pages_published` → `contract_sign` (14-day expiry)
- `build_first_payment_flow` (live with real money) → `regulatory_filing` (48-hour expiry)
- `sell_first_paying_customer` (first public emission) → `public_emission` (24-hour expiry)

Approval flow: BD v3 surfaces request via `approval-queue-handler` (5-3.b) →
customer replies in Telegram (Q2=A locked, see 5-5) → handler flips
`approved_at` and BD v3 marks the deliverable.
