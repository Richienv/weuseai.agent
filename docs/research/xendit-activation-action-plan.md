# Xendit Production Activation - Indonesian Business Setup Action Plan

**For:** Richie, solo founder, weuseai.agent
**Goal:** Go from zero business entity to fully Xendit-verified production merchant
**Form factor:** PT Perorangan (single-shareholder LLC, post-2021 form under UU Cipta Kerja)
**Date of plan:** 2026-05-17
**Estimated end-to-end time:** 2-4 weeks DIY / 1-2 weeks service-assisted
**Estimated end-to-end cost:** Rp 350k DIY / Rp 1.5jt - 2.5jt service-assisted

---

## TL;DR EXECUTIVE SUMMARY

You need 7 documents. **5 of them are produced by 2 actions:** (a) registering the PT Perorangan on `ptp.ahu.go.id`, and (b) registering the company NPWP on `coretaxdjp.pajak.go.id`. The other 2 are trivial: your existing personal KTP and a logo file you already have.

**The critical dependency chain:**
> Personal NPWP (already exist?) -> PT Perorangan registration on AHU -> SK Kemenkumham + Pernyataan Pendirian + Sertifikat Pendaftaran (3 docs at once) -> Company NPWP on Coretax -> NIB on OSS-RBA -> Xendit submission

**Recommendation:** Use a service provider (SmartLegal, Kontrak Hukum, or Hive Five) for ~Rp 1.5jt - 2.5jt. The Rp 1jt+ premium over DIY buys you: 5+ days saved, no risk of KBLI mis-selection (which causes 60% of NIB rejections), and a single point of contact for fixes. For a solo founder optimizing for time, this is a no-brainer.

**Risk callout:** Your jurisdiction. PT Perorangan requires WNI status + Indonesian KTP + Indonesian business address. You have Hangzhou + Jakarta. Make sure the KTP address is current and the business domicile is a real Jakarta location (your own, family, or paid virtual office). PT Perorangan in Jakarta typically requires the office address to be in a commercial zoning area per Perda DKI 1/2014 - residential-zone addresses can get rejected. Virtual office is the cleanest fix (~Rp 1.5-3jt/year).

---

## THE 7 DOCUMENTS - DETAILED BREAKDOWN

### 1. Business Logo

**What it is:** Your company logo image file uploaded to the Xendit dashboard. Used on payment pages customers see.

**Where:** You already have `weuseai-logo-option.png` and `weuseai-circle-monogram.png` in this folder.

**Prerequisites:** None.

**Cost:** Rp 0.

**Timeline:** 0 days.

**Gotchas:**
- Xendit wants clean PNG/JPG, transparent or white background.
- Use the square monogram (`weuseai-circle-monogram.png`) - rectangular logos render badly on Xendit payment pages.
- The company name on Xendit MUST match the name on your AHU Pernyataan Pendirian exactly. If your logo says "weuseai.agent" but your PT name is "PT Weuseai Agen Indonesia" or similar - that's fine on the logo, but the legal "Company Name" field in Xendit must match the registered PT name letter-for-letter.

---

### 2. Proof of Business

**What it is:** Xendit's "proof of business" for a PT Perorangan is satisfied by the NIB itself (item 4 below). You don't need a separate document. For non-PT-Perorangan entities (regular PT, CV) Xendit also accepts Akta Pendirian + SK Menkumham, but for PT Perorangan the NIB alone is canonical proof. Some industries (gambling-adjacent, lending, crypto, healthcare, food) require an additional sector license - SaaS/agent software does not.

**Where:** Generated automatically once NIB is issued from OSS-RBA. The NIB PDF itself is the proof.

**Prerequisites:** NIB (item 4).

**Cost:** Rp 0 additional.

**Timeline:** 0 additional days.

**Gotchas:**
- If Xendit's form asks for both "Proof of Business" AND NIB as separate uploads, upload the NIB PDF in both fields. This is a known UI quirk.
- If you have a company website or active social media, screenshot the homepage as a secondary proof - Xendit reviewers sometimes ask for "evidence the business is actually operating." `weuseai-agent.vercel.app` qualifies.

---

### 3. Photo of Director's KTP

**What it is:** A clear color photo (front side) of your Indonesian national ID. Both sides if Xendit asks. You'll also typically be asked for a selfie holding the KTP.

**Where:** You already have it (assuming KTP is current and not expired - check the validity date on the card).

**Prerequisites:** Valid, unexpired KTP. Address on KTP should be reasonably current; if you've moved provinces (e.g., from Hangzhou-based long enough to be deregistered), check with kelurahan.

**Cost:** Rp 0. If KTP needs renewal: Rp 0 official, ~Rp 200-500k if using a fixer to skip queue.

**Timeline:** 0 days if you have it. 1-30 days to renew if expired.

**Gotchas:**
- Photo must be sharp, well-lit, no glare on the holographic stripe, all corners visible.
- Selfie-with-KTP: hold KTP next to your face, both clearly visible, single shot, no filters, neutral background.
- Name on KTP must match name on the AHU Pernyataan Pendirian and the Coretax NPWP exactly. Any diacritic, dot, or word-order mismatch can stall verification by a week.
- If your KTP address is no longer your real domicile, this is fine for Xendit - they care about the PT's business address, not your personal residence.

---

### 4. NIB (Nomor Induk Berusaha)

**What it is:** Business Identification Number. The single most important business document in Indonesia post-2021. Replaces the old SIUP + TDP combo entirely. Functions as your business license, import license (if applicable), worker registration, and tax registration linkage all in one. Xendit prefers NIB; the SIUP+TDP fallback in their form is legacy text - don't pursue SIUP/TDP, they're effectively deprecated.

**Where:** [oss.go.id](https://oss.go.id) - the OSS-RBA portal run by BKPM (Indonesian Investment Coordinating Board).

**Prerequisites:**
- Personal NPWP (your individual one)
- PT Perorangan registered at AHU (items 5 & 6)
- Company NPWP (item 7)
- Selected KBLI codes (industry classification)
- Verified business address with kelurahan-level detail
- Email + Indonesian phone number for OTP

**Cost:** Rp 0 official. Rp 150-500k via service provider as standalone. Usually bundled in PT Perorangan packages.

**Timeline:** Same day to 1 business day if data is clean. Up to a week if KBLI is wrong and OSS flags it.

**Gotchas:**
- **KBLI selection is the single biggest mistake.** For weuseai.agent (AI agent SaaS), the right primary KBLI is **62010 (Aktivitas Pemrograman Komputer)** - this is the standard for SaaS and software products. Add **62029 (Aktivitas Konsultasi Komputer Lainnya)** if you also do consulting/setup-as-service work. Optionally add **63122 (Portal Web dan/atau Platform Digital dengan Tujuan Komersial)** if you have a content/web platform component. Avoid 62090 ("other IT services") as a primary - it's a catch-all that some Xendit reviewers flag as too vague.
- KBLI 2025 (BPS Regulation No. 7/2025) replaced KBLI 2020 in December 2025 - the 62010 code itself is unchanged but the descriptions and risk tiers were updated. Use the new version.
- Risk tier for 62010 is **Low (Rendah)**, which means the NIB alone is sufficient - no separate Sertifikat Standar or Izin required. This is the easiest tier.
- Modal usaha: declare under Rp 5 miliar to stay within UMKM (small business) bracket. PT Perorangan is legally restricted to UMKM only (max Rp 5 miliar modal, max Rp 15 miliar annual revenue).
- Your alamat usaha must match the address on your PT Perorangan Pernyataan Pendirian. Mismatch = NIB rejected.

---

### 5. Pernyataan Pendirian Perseroan Perorangan (Statement of Establishment)

**What it is:** A digitally generated, e-signed declaration document where you (as the sole founder) state you are establishing a PT Perorangan, with details of name, address, KBLI, capital structure, director identity. This is the equivalent of an Akta Pendirian for a regular PT, but generated entirely online without a notary. Output is a PDF.

**Where:** [ptp.ahu.go.id](https://ptp.ahu.go.id) (PT Perorangan portal of Ditjen AHU, Ministry of Law).

**Prerequisites:**
- Personal NPWP (active, registered in Coretax)
- Valid KTP
- Active email + Indonesian phone number
- Decided company name (do a name availability check on AHU first)
- Decided business address (must be Indonesian - typically Jakarta/your home city)
- Decided KBLI codes
- Decided modal dasar (recommended: Rp 10-50jt - low enough to be UMKM, high enough to look credible to Xendit reviewers and BCA)

**Cost:** Rp 50,000 official PNBP fee paid online (Virtual Account or e-wallet during the AHU flow).

**Timeline:** ~30 minutes of form-filling. Document issued same day (within hours) of payment confirmation.

**Gotchas:**
- Company name rules: must be 3 words minimum, end with "Perseroan Perorangan" suffix (auto-appended by the system, you choose the prefix words). Must not duplicate an existing PT. Cannot contain English-only words unless registered as trademark. "weuseai" is borderline - safer to use a Bahasa name like "PT Weuseai Agen Indonesia Perorangan" or "PT Kita Pakai AI Perorangan." Do the name availability check before locking in.
- Modal disetor (paid-up capital) must be minimum 25% of modal dasar. There is no requirement to actually deposit the money in a bank account at registration - it's a declaration. But for Xendit verification, having the corresponding amount provable in your accounts later helps if they ask.
- The Pernyataan Pendirian and the Sertifikat Pendaftaran (item 6) are generated in the same AHU flow, simultaneously, from the same Rp 50k payment. They are two separate PDFs, but one transaction.

---

### 6. Sertifikat Pendaftaran Pendirian Perseroan Perorangan (Certificate of Registration)

**What it is:** The official certificate from Ditjen AHU (Ministry of Law) confirming your PT Perorangan is legally registered. Contains the SK (Surat Keputusan) number that Coretax and OSS will ask for. This is your legal birth certificate as a company.

**Where:** Auto-generated from [ptp.ahu.go.id](https://ptp.ahu.go.id) when you complete item 5.

**Prerequisites:** Same as item 5.

**Cost:** Bundled - no additional fee beyond the Rp 50k for item 5.

**Timeline:** Same day as item 5.

**Gotchas:**
- Download both the Pernyataan and the Sertifikat from the "Daftar Transaksi" menu in AHU. **Save them locally and back them up.** If you lose the AHU account login, recovering these is a multi-week ordeal.
- The certificate is e-signed by Ditjen AHU - QR code in the bottom right. Xendit verifies via the QR. Do not screenshot - upload the original PDF. Print-then-scan ruins the QR.
- If you ever need a wet-signed/legalized hardcopy (for some bank account openings, government tenders), bring the PDF to your provincial Kanwil Kemenkumham office for legalisir - costs ~Rp 50-100k.

---

### 7. Company Tax ID (NPWP Perusahaan)

**What it is:** Tax ID specifically for your PT Perorangan as a legal entity, separate from your personal NPWP. Issued by DJP (Direktorat Jenderal Pajak). Required for filing corporate tax returns, issuing invoices, opening a business bank account, and Xendit settlement.

**Where:** [coretaxdjp.pajak.go.id](https://coretaxdjp.pajak.go.id) - the Coretax DJP portal (replaced the old ereg.pajak.go.id system in January 2025).

**Prerequisites:**
- SK Pengesahan from AHU (the Sertifikat from item 6 contains the SK number)
- Pernyataan Pendirian PDF (upload required)
- Your personal NPWP (active in Coretax)
- Company address (must match AHU)
- Email + phone for verification

**Cost:** Rp 0.

**Timeline:** Form submission ~20 minutes. NPWP card issued 1-3 business days after submission. Sometimes same-day.

**Gotchas:**
- In Coretax, select "Badan" (not "Orang Pribadi") then choose category "Perseroan Terbatas (PT) Perorangan." Do not pick generic "PT" - the form fields differ.
- DJP requires NPWP registration within 1 month of PT establishment. Miss this and you can be flagged for a denda (fine) - small (Rp 100-500k) but annoying.
- Coretax is the new system rolled out in January 2025. It has had multiple stability issues throughout 2025-2026. If the portal fails mid-submission, your draft may be lost. Take screenshots at each step.
- For Xendit upload: download the NPWP card PDF from Coretax. The card is digital-only now - no physical card mailed. The PDF has a QR code; do not modify it.
- Your personal NPWP must already exist and be active in Coretax before the company NPWP can be linked. If you don't have one, register that first - takes ~15 minutes on Coretax with just KTP + KK.

---

## DEPENDENCY GRAPH

```
[Personal KTP] (already have)
       |
       v
[Personal NPWP] - register on Coretax if you don't have one (~30 min, free)
       |
       v
[Decide: Company name + address + KBLI + capital] (~half a day of decisions)
       |
       v
[AHU PT Perorangan registration on ptp.ahu.go.id] (Rp 50k, ~1 hour, same-day)
       |
       +--> [Pernyataan Pendirian PDF]   (doc #5)
       +--> [Sertifikat Pendaftaran PDF] (doc #6, contains SK number)
                            |
                            v
       [Coretax NPWP Badan registration] (free, 1-3 days)
                            |
                            v
                  [Company NPWP PDF] (doc #7)
                            |
                            v
            [OSS-RBA NIB registration on oss.go.id] (free, same-day)
                            |
                            v
                       [NIB PDF] (doc #4, also satisfies doc #2)
                            |
                            v
              [Xendit dashboard upload of all 7 docs]
                            |
                            v
                  [Xendit review: 3-5 business days]
                            |
                            v
              [Production mode unlocked - first real payment]
```

---

## OPTIMAL SEQUENCE (the fastest legal path)

1. **Decide naming + KBLI + address + capital.** Half a day. Lock these before touching any portal - changing them later means refiling.
2. **Confirm personal NPWP is active** on Coretax. If not, register it (~30 min).
3. **AHU PT Perorangan registration** on ptp.ahu.go.id. Pay Rp 50k. Download Pernyataan + Sertifikat same day.
4. **Coretax Company NPWP** registration. Submit immediately after AHU completes. Wait 1-3 days.
5. **OSS-RBA NIB** registration. Same day after Company NPWP issued.
6. **Xendit dashboard:** upload all 7 documents (logo, KTP photo, KTP selfie, NIB, Pernyataan, Sertifikat, Company NPWP). Submit for verification.
7. **Wait 3-5 business days** for Xendit review.

---

## TOTAL REALISTIC TIMELINE

### (a) DIY Path

| Phase | Calendar Days | Notes |
|---|---|---|
| Decisions + personal NPWP check | 1-2 | Can be done in parallel with reading guides |
| AHU registration | 1 | Same-day if no name conflicts |
| Coretax company NPWP | 2-4 | Variable - Coretax outages add days |
| OSS-RBA NIB | 1 | Same-day if KBLI is clean |
| Xendit upload + review | 5-10 | 3-5 business days = 5-7 calendar days; +revision rounds if any |
| **Total realistic** | **10-18 calendar days** | Assumes nothing breaks, no holidays |
| **Total worst case** | **3-4 weeks** | Coretax outage, KBLI rejected, Xendit asks for revisions |

### (b) Service-Assisted Path (recommended)

| Phase | Calendar Days | Notes |
|---|---|---|
| Pick service, sign engagement, send KTP scan | 1 | |
| Service handles AHU + Coretax + OSS in sequence | 3-7 | They batch, no idle wait days |
| You receive all 6 docs | 7-10 | Total to docs-in-hand |
| Xendit upload + review | 5-10 | Same as DIY |
| **Total realistic** | **12-20 calendar days** | |
| **Total best case** | **7-10 days** | Some providers advertise 3-5 working days for docs |

The service-assisted path is barely faster on paper because Xendit's own review window dominates. The real win is **founder time and risk:** you spend ~2 hours total instead of ~2 days, and you don't get bitten by Coretax bugs.

---

## TOTAL COST ESTIMATE

### DIY Path

| Item | Cost (IDR) |
|---|---|
| Personal NPWP (if new) | 0 |
| AHU PT Perorangan registration (PNBP fee) | 50,000 |
| Company NPWP via Coretax | 0 |
| NIB via OSS-RBA | 0 |
| Virtual office (if needed for Jakarta domicile) | 1,500,000 - 3,000,000/year |
| **Subtotal without virtual office** | **50,000** |
| **Subtotal with virtual office** | **1,550,000 - 3,050,000** |

### Service-Assisted Path

| Provider | Package | Price (IDR) | What's included |
|---|---|---|---|
| SmartLegal | PT Perorangan all-in | 1,500,000 | Pernyataan + Sertifikat + NPWP + NIB + consultation |
| Kontrak Hukum | PT Perorangan basic | 2,000,000 | Same scope |
| Hive Five | Full package | 2,500,000 | Same scope + additional certs |
| jasapembuatanpt.com | PT Perorangan | 1,000,000 | Bare basics |
| Easybiz (Hukumonline) | Custom quote | ~2-3jt | Premium-tier handholding |
| Virtual office add-on | Annual fee | 1,500,000 - 3,000,000/yr | If you don't have a commercial-zoning address |

**Realistic total for service-assisted with virtual office: Rp 3-5 juta first year.**

---

## KEY DECISION: PT Perorangan vs. alternatives

**Recommendation: PT Perorangan. Yes, do it.**

| Criterion | PT Perorangan | CV | Regular PT | Personal/UD |
|---|---|---|---|---|
| Solo founder allowed | YES | No (needs 2 partners) | No (needs 2 shareholders) | Yes |
| Min capital | Free declaration | Free declaration | Free declaration | None |
| Cost to set up | Rp 50k | Rp 3-5jt (notary) | Rp 5-10jt (notary) | Free |
| Time to set up | 1 day | 1-2 weeks | 2-3 weeks | None |
| Limited liability | YES | No (CV partners liable) | YES | No |
| Xendit accepts | YES | YES | YES | No (rejected as "non-entity") |
| Tax rate | 0.5% PPh Final UMKM (under Rp 4.8B revenue) | Same | Same | Personal rate (up to 35%) |
| Can hire employees | YES | YES | YES | Limited |
| Looks credible to enterprise customers | Acceptable | Less so | Best | No |

**For weuseai.agent today (solo, AI SaaS, pre-revenue or early revenue, will scale to <Rp 15B in years 1-2): PT Perorangan is the correct choice.** When you hit Rp 5B capital or Rp 15B revenue you'll be legally required to convert to a regular PT - but that's a good problem to have and the conversion is straightforward.

Personal/UD is a non-starter because Xendit rejects non-entity merchants for production payment processing in 2025-2026.

---

## FOUNDER ACTION CHECKLIST

### Week 1 - Decisions and account prep

- [ ] **Day 1 (Mon):** Decide PT name. Run name availability check at [ptp.ahu.go.id](https://ptp.ahu.go.id) (free, no login needed for the check). Have 3 backup names ready in case first choice is taken.
- [ ] **Day 1:** Decide modal dasar. Recommendation: Rp 50,000,000 (Rp 12.5jt modal disetor declared). Looks legit to Xendit, stays comfortably in UMKM bracket.
- [ ] **Day 1:** Decide KBLI primary 62010 + secondary 62029.
- [ ] **Day 1:** Decide business address. Options: (a) family home with kelurahan letter, (b) virtual office in Jakarta CBD (~Rp 1.5-3jt/yr - vOffice, Hive Five, CEO Suite are reputable), (c) actual coworking with mailing address.
- [ ] **Day 1-2:** Verify your personal NPWP is active in Coretax. If not, register at [coretaxdjp.pajak.go.id](https://coretaxdjp.pajak.go.id) (15 min).
- [ ] **Day 2:** Choose path - DIY or service. If service, send inquiry to 2-3 providers (SmartLegal, Kontrak Hukum, Hive Five), compare quotes, sign with one. Pay deposit.
- [ ] **Day 2:** Take fresh KTP photo and selfie-with-KTP. Save high-resolution.
- [ ] **Day 2:** Pick logo file - use `weuseai-circle-monogram.png`.

### Week 1-2 - Registration

- [ ] **Day 3-4 (DIY) or Day 3-7 (service):** PT Perorangan registered on AHU. Receive Pernyataan + Sertifikat PDFs.
- [ ] **Day 5-7 (DIY) or in same sweep (service):** Company NPWP registered on Coretax. Receive NPWP card PDF.
- [ ] **Day 7-8 (DIY) or in same sweep (service):** NIB registered on OSS-RBA. Receive NIB PDF.
- [ ] **Day 8:** All 7 documents in hand. Back them up to 2 places (local + cloud).

### Week 2 - Xendit submission

- [ ] **Day 8-9:** Log into Xendit dashboard, navigate to Activation form. Fill business details exactly matching the Pernyataan Pendirian (name, address, capital).
- [ ] **Day 8-9:** Upload all 7 documents. Submit for verification.
- [ ] **Day 9:** Email help@xendit.co with "Activation submitted for [Company Name], any expedite possible?" - sometimes gets faster review.

### Week 2-3 - Verification and go-live

- [ ] **Day 12-16:** Xendit verification result. Either approved or revision requested.
- [ ] **If revision requested:** Address within 24 hours, re-upload, re-submit. Each round adds 2-3 days.
- [ ] **Once approved:** Switch dashboard from Test mode to Live mode. Verify production API keys work in `liren-stand` codebase. Run a real Rp 10,000 test transaction with your own card. Confirm settlement to business bank account within T+1.

### Post-activation hardening

- [ ] Open a business bank account (BCA recommended - widely supported by Xendit) using the 7 documents. ~1 hour at branch.
- [ ] Update `weuseai-agent.vercel.app` payment integration to use live Xendit keys.
- [ ] Set up monthly tax compliance reminder: PPh Final 0.5% on revenue, due 15th of each following month via Coretax.
- [ ] First real paying customer: this closes the deferred gate from the priority-lock memo.

---

## REFERENCE: KEY URLS

- AHU PT Perorangan portal: https://ptp.ahu.go.id
- AHU general portal: https://ahu.go.id
- Coretax DJP: https://coretaxdjp.pajak.go.id
- OSS-RBA: https://oss.go.id
- Xendit activation docs: https://docs.xendit.co/id/getting-started/activate-account
- Xendit ID legal docs help: https://help.xendit.co/hc/en-us/articles/10891368765593

## REFERENCE: SERVICE PROVIDERS (for quotes)

- SmartLegal: https://smartlegal.id
- Kontrak Hukum: https://kontrakhukum.com
- Easybiz (Hukumonline): https://www.easybiz.id
- Hive Five: https://hivefive.co.id
- IzinKu: https://izinku.id

---

**End of action plan. Document version 1.0, 2026-05-17.**
