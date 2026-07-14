# Template — Competitor Deep Dive

Profil mendalam satu kompetitor — history, produk, GTM, pricing, organisasi, financials kalau publik, customer base, dan kelemahan yang sudah teridentifikasi. Lebih panjang dari satu baris di matrix.
Audience: founder yang siapkan strategi langsung versus satu pemain, M&A team yang scout target, atau analyst yang harus jawab "kenapa kompetitor X menang dan kita kalah".
Pakai setelah `competitor-analysis.md` mengidentifikasi 1-2 kompetitor yang patut diteliti dalam.

## Variables

- `{{company_name}}` — string. Nama legal + brand kalau berbeda.
- `{{founded_year}}` — string. Tahun berdiri + lokasi HQ.
- `{{stage}}` — string. Stage perusahaan (mis. "Series B, $25M raised, post-PMF").
- `{{one_liner}}` — string. Positioning publik dalam satu kalimat — gunakan kalimat resmi dari website kompetitor.
- `{{history_summary}}` — string. Sejarah singkat 4-6 kalimat: pendiri, pivot besar, milestone funding, ekspansi geografi.
- `{{product_core}}` — string. Produk inti — fitur utama yang generate revenue.
- `{{product_adjacent}}` — string. Produk pendamping atau bundling.
- `{{tech_stack_notes}}` — string. Tech stack publik (kalau ada di engineering blog atau job postings) — kalau tidak ada, tulis "tidak terdokumentasi publik".
- `{{pricing_published}}` — string. Pricing yang tertera di website. Sebut tier + harga + currency.
- `{{pricing_negotiated_signal}}` — string. Sinyal pricing yang dinegosiasi (mis. "kontrak enterprise kabar dari [source] di kisaran $80k - $200k/tahun").
- `{{gtm_motion}}` — string. GTM motion utama: PLG, sales-led, channel, mixed.
- `{{gtm_channels}}` — string. Channel akuisisi yang teridentifikasi: outbound, content, paid, partnership, community.
- `{{org_size}}` — string. Estimasi jumlah karyawan + source (mis. "~120 di LinkedIn per Mei 2026").
- `{{org_key_people}}` — string. CEO, CTO, head sales — nama + latar belakang ringkas + source profile.
- `{{financials_summary}}` — string. Revenue / growth / funding kalau publik. Kalau private dan tidak ada filing, tulis "tidak publik" dan beri proxy (mis. "estimasi ARR $10-15M dari [signal]").
- `{{customer_base}}` — string. Customer mix — logo terkenal, segmen, geografi. Kalau ada angka customer, sebut + source.
- `{{customer_voice_signals}}` — string. Sinyal dari customer publik: review di G2/Capterra/Trustpilot, testimonial, public case study. Sebut sentiment trend + source.
- `{{strengths_identified}}` — string. Kekuatan utama dengan evidence per poin.
- `{{weaknesses_identified}}` — string. Kelemahan utama dengan evidence per poin.
- `{{recent_moves}}` — string. Aksi besar 12 bulan terakhir: launch produk, ekspansi geografi, layoffs, executive change, partnership.
- `{{open_questions}}` — string. Pertanyaan yang belum bisa dijawab dari source publik — wajib diisi.
- `{{source_refs_inline}}` — string. Catatan source numbering yang dipakai inline di seluruh dokumen.
- `{{full_source_list}}` — string. Daftar source lengkap dengan nomor referensi.

## Template

---
template: competitor-deep-dive
language: id
register: kamu
purpose: single-competitor mendalam profile
---

# Deep Dive — {{company_name}}

**Berdiri:** {{founded_year}}
**Stage:** {{stage}}
**One-liner:** {{one_liner}}

---

## 1. History

{{history_summary}}

## 2. Produk

**Core:** {{product_core}}

**Adjacent:** {{product_adjacent}}

**Tech stack notes:** {{tech_stack_notes}}

## 3. Pricing

**Publik:** {{pricing_published}}

**Sinyal negosiasi:** {{pricing_negotiated_signal}}

## 4. Go-to-market

**Motion:** {{gtm_motion}}

**Channel:** {{gtm_channels}}

## 5. Organisasi

**Ukuran:** {{org_size}}

**Key people:** {{org_key_people}}

## 6. Financials

{{financials_summary}}

## 7. Customer base

{{customer_base}}

**Customer voice signals:** {{customer_voice_signals}}

## 8. Kekuatan

{{strengths_identified}}

## 9. Kelemahan

{{weaknesses_identified}}

## 10. Aksi 12 bulan terakhir

{{recent_moves}}

---

## Open questions

{{open_questions}}

## Catatan source

{{source_refs_inline}}

## Sumber lengkap

{{full_source_list}}

> Aturan: profil ini dibuat dari source publik. Klaim "menurut bisik-bisik industri" hanya masuk kalau ada source kedua yang menegaskan, dan tetap ditandai sebagai sinyal — bukan fakta. Open questions yang tersisa lebih jujur daripada profil yang kelihatan lengkap tapi separuhnya tebakan.

## Tone guide

Profil deep dive bukan tempat untuk sinis atau memuji. Tujuan: pembaca paham apa yang membuat kompetitor ini bisa bergerak, dan di mana titik lemahnya yang teruji. Kekuatan dan kelemahan harus seimbang dalam ketegasan — bukan kekuatan dengan tiga source dan kelemahan dengan satu rumor. Financial yang tidak publik wajib disebut "tidak publik" — angka estimasi boleh, tapi dengan source + tag [estimasi]. Tidak ada tanda seru, tidak ada kata "dominan" tanpa data market share.
