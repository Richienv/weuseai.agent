# Business Director

Pendamping founder Indonesia dari ide sampai 10 customer pertama. 5-stage roadmap (Idea → Setup → Identity → Build → Sell) dengan PT/CV setup, OSS-RBA, BPJS, payment gateway lokal, compliance.

**Tier:** Studio (Master Agent mode di Phase 5).

---

## Apa yang kamu dapat

- **Business roadmap tracker** — 5-stage progression Indonesia-context. Per stage: checklist, deliverable, decision point. State persisted lintas sesi.
- **Incorporation advisor** — PT vs CV decision tree. OSS process step-by-step. Cost estimate (notaris, modal disetor, BPJS, NPWP badan).
- **Compliance checker** — laporan pajak (PPh, PPN), BPJS Ketenagakerjaan + Kesehatan, OSS RBA verifikasi sektor + KBLI, UU PDP basics.
- **Funding advisor** — angel / VC mapping Indonesia (Alpha JWC, East Ventures, AC Ventures, dst), grant pemerintah (Kemenparekraf, Kemnaker), prep pitch deck.

---

## 5-stage roadmap

| Stage | Goal | Deliverable | Estimasi |
|---|---|---|---|
| 1. Idea | Validasi market signal | 15-20 customer interview, competitor scan, value-prop one-liner, niche-1 customer profile | 2-6 minggu |
| 2. Setup | Legal foundation | PT/CV decided, akta notaris, NPWP badan, OSS NIB, rekening badan, BPJS (kalau hire) | 2-4 minggu |
| 3. Identity | Brand + minimum infra | Brand name + tagline, visual identity, landing/multi-page site, payment gateway, WA Business + email automation | 1-2 minggu |
| 4. Build | First 10 paying customers | MVP product, customer support flow, T&C + privacy, basic analytics | 4-8 minggu |
| 5. Sell | Repeatable acquisition + retention engine | Top 2-3 channels identified, content engine, retention triggers, referral program, tax compliance auto-set | ongoing |

State transitions gated by deliverable completion. Kamu nggak bisa lompat dari stage 1 ke stage 3 sebelum interview log + value prop tercatat. Founder (kamu) bisa override via dashboard kalau memang udah dilakuin off-platform.

---

## Sample tasks

- "Aku punya ide edutech buat anak SMA Jakarta. Mulai dari mana?" — Stage 1 dimulai. Dia walk-through customer interview design, segmen target, hipotesis problem.
- "Aku PT atau CV?" — incorporation advisor decision tree. Pertimbangan: jumlah pendiri, ambisi funding, risk tolerance, biaya.
- "Lapor SPT tahunan PPh badan deadline kapan?" — compliance checker kasih tanggal + checklist dokumen + notaris/akuntan referral.
- "Susun pitch deck buat angel round" — coordinate dengan [Slide Master](./slide-master.md) untuk deck format, dia kasih konten Indonesia-context.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `business-roadmap-tracker` | Studio | 5-stage state machine + deliverable gates |
| `incorporation-advisor` | Studio | PT/CV + OSS + cost estimates |
| `compliance-checker` | Studio | Pajak, BPJS, OSS, UU PDP |
| `funding-advisor` | Studio | Angel/VC/grant mapping + pitch prep |

---

## Master Agent mode (Phase 5)

Tier Studio dapat **Business Director v3** sebagai Master Agent — dia route ke 9 specialist persona lain berdasarkan stage + intent kamu. Contoh:

- Stage 3 Identity: kamu bilang "perlu landing page" → BD route ke Web Master, dia bikin landing, hasil di-wrap dengan voice consistent ke kamu.
- Stage 4 Build: kamu bilang "support flow gimana ya" → BD route ke The Pro untuk extend-capabilities, atau Doc Expert untuk T&C draft.
- Stage 5 Sell: kamu bilang "content engine TikTok" → BD route ke Social Conductor + Video Producer.

Master Agent jaga konteks lintas persona — kamu nggak perlu copy-paste konteks tiap kali ganti specialist. Detail di [Phase 5 spec](../plans/2026-05-10-phase-5-spec.md) (status: DRAFT pending founder review).

---

## Approval gates

Action irreversible / dangerous butuh kamu approve manual via Telegram:

- `incorporate` — submit akta ke notaris
- `contract_sign` — sign legal document
- `public_emission` — publish content ke channel publik atas nama bisnis kamu
- `regulatory_filing` — filing pajak / BPJS / OSS

Default expiry approval request: per-action-kind (incorporate=14d, contract=14d, public_emission=24h, regulatory_filing=48h). Kamu reply "approve" atau "reject" via Telegram, decision tercatat ter-audit.

---

## Limitasi

- **Bukan licensed lawyer / accountant** — output adalah educational + structural guide. Untuk akta, NPWP, atau filing pajak, pakai notaris / akuntan certified.
- **Master Agent mode** masuk Phase 5 (estimasi 10 hari kerja post-lock spec). Saat ini Studio dapat skill scoped MVP (Persona v2).
- **Funding advisor** kasih research + intro path, bukan introduction langsung. Kamu yang outreach.

---

## Kapan switch ke persona lain

Tier Studio dengan Master Agent: kamu nggak perlu switch — BD v3 yang route otomatis. Tier Pro tanpa Master Agent: kamu pilih persona spesifik per task (lihat persona-guide masing-masing).
