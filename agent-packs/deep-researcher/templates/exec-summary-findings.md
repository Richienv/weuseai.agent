# Template — Executive Summary of Research Findings

Satu halaman exec summary: TL;DR + 3 key findings + rekomendasi + pertanyaan lanjutan. Untuk pembaca yang hanya punya 60 detik tapi butuh inti laporan riset yang lebih panjang.
Audience: board member, C-level, atau senior stakeholder yang akan baca exec summary saja dan baru membuka full report kalau perlu.
Pakai sebagai output akhir setelah `synthesis-report` selesai, atau sebagai standalone deliverable kalau customer minta versi pendek.

## Variables

- `{{report_subject}}` — string. Subjek riset dalam 4-8 kata (mis. "Adopsi QRIS di sektor UMKM 2024-2026").
- `{{prepared_for}}` — string. Audience eksplisit (mis. "Board PT Anugrah Indonesia", "Tim strategi produk").
- `{{prepared_by}}` — string. Atribusi penulis / agent.
- `{{date_finalized}}` — string. Tanggal finalisasi (mis. "22 Mei 2026").
- `{{tldr_paragraph}}` — string. TL;DR 3-5 kalimat. Inti temuan + implikasi terbesar untuk audience. Tanpa citation di sini.
- `{{finding_1_headline}}` — string. Headline temuan #1, satu kalimat.
- `{{finding_1_evidence}}` — string. Evidence ringkas: angka, kutipan, atau pola yang dukung temuan.
- `{{finding_1_source_ref}}` — string. Source numbered reference (mis. "[1], [3]").
- `{{finding_1_caveat}}` — string. Catatan kalau ada — kalau evidence tipis atau terbatas. Tulis "tidak ada" kalau memang clean.
- `{{finding_2_headline}}` — string.
- `{{finding_2_evidence}}` — string.
- `{{finding_2_source_ref}}` — string.
- `{{finding_2_caveat}}` — string.
- `{{finding_3_headline}}` — string.
- `{{finding_3_evidence}}` — string.
- `{{finding_3_source_ref}}` — string.
- `{{finding_3_caveat}}` — string.
- `{{recommendation_1}}` — string. Rekomendasi konkret yang bisa di-execute. Bentuk imperatif: "Lakukan X karena Y".
- `{{recommendation_2}}` — string.
- `{{recommendation_3}}` — string. Opsional — kalau hanya 2 rekomendasi, kosongkan.
- `{{further_questions}}` — string. 2-4 pertanyaan yang belum terjawab + saran cara menjawabnya di riset lanjutan.
- `{{confidence_level}}` — string. Tingkat kepercayaan terhadap temuan utama: tinggi / sedang / rendah, dengan alasan singkat.
- `{{source_count_summary}}` — string. Ringkasan source yang dipakai (mis. "12 sumber primer (Tier A), 8 sumber sekunder (Tier B), 3 yang ditandai [unverified]").
- `{{full_report_pointer}}` — string. Pointer ke laporan lengkap (mis. "Detail metodologi dan source breakdown lengkap di full report, hlm. 14-32").

## Template

---
template: exec-summary-findings
language: id
register: kamu
purpose: one-page exec summary of research findings
length_target: ~1 page
---

# Executive Summary — {{report_subject}}

**Untuk:** {{prepared_for}}
**Disiapkan oleh:** {{prepared_by}}
**Tanggal:** {{date_finalized}}

---

## TL;DR

{{tldr_paragraph}}

---

## Tiga temuan utama

### 1. {{finding_1_headline}}

{{finding_1_evidence}}

*Source:* {{finding_1_source_ref}}
*Catatan:* {{finding_1_caveat}}

### 2. {{finding_2_headline}}

{{finding_2_evidence}}

*Source:* {{finding_2_source_ref}}
*Catatan:* {{finding_2_caveat}}

### 3. {{finding_3_headline}}

{{finding_3_evidence}}

*Source:* {{finding_3_source_ref}}
*Catatan:* {{finding_3_caveat}}

---

## Rekomendasi

1. {{recommendation_1}}
2. {{recommendation_2}}
3. {{recommendation_3}}

## Pertanyaan yang perlu riset lanjutan

{{further_questions}}

---

## Catatan metode

**Tingkat kepercayaan temuan:** {{confidence_level}}
**Source yang dipakai:** {{source_count_summary}}

{{full_report_pointer}}

> Exec summary ini dirancang untuk dibaca dalam 60 detik. Pengambilan keputusan yang melibatkan risiko material tetap perlu rujuk ke full report dan source primer langsung — TL;DR bukan substitut untuk evidence.

## Tone guide

Exec summary punya target panjang ketat: satu halaman. Kalau melebih, potong. TL;DR maksimal 5 kalimat — kalau lebih, audience akan baca satu paragraf doang dan lewatkan key findings. Headline temuan harus berdiri sendiri: pembaca yang hanya scan headline harus paham 70% laporan. Rekomendasi bentuk imperatif tapi tidak overclaim — kalau evidence sedang, gunakan "pertimbangkan" atau "validasi dulu" bukan "lakukan". Tidak ada tanda seru. Tidak ada kata "kritis", "urgent", atau "transformatif" kecuali source mendukung tingkat klaim itu. Pertanyaan lanjutan jujur — jangan disembunyikan untuk membuat summary kelihatan lengkap.
