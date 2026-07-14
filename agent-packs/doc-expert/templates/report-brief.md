# Template — Report Brief (1 Halaman)

Laporan eksekutif satu halaman: TL;DR di atas, 3 temuan kunci, rekomendasi terkait.
Audience: executive / decision-maker yang punya kurang dari 5 menit untuk baca.
Pakai untuk update mingguan, hasil audit ringkas, atau ringkasan satu inisiatif untuk meeting board.

## Variables

- `{{report_title}}` — string. Judul laporan (mis. `Status Penjualan Q1 2026`).
- `{{report_date}}` — string. Tanggal laporan diterbitkan.
- `{{author_name}}` — string. Penyusun laporan.
- `{{audience}}` — string. Penerima laporan (mis. `Direktur Operasional`, `Tim Manajemen`).
- `{{period_covered}}` — string. Periode yang dianalisis (mis. `1-31 Januari 2026`).
- `{{tldr_paragraph}}` — string. TL;DR 2-3 kalimat — kesimpulan utama upfront.
- `{{finding_1_title}}`, `{{finding_1_body}}` — string. Temuan pertama (1-2 kalimat).
- `{{finding_2_title}}`, `{{finding_2_body}}` — string. Temuan kedua.
- `{{finding_3_title}}`, `{{finding_3_body}}` — string. Temuan ketiga.
- `{{recommendation_1}}`, `{{recommendation_2}}`, `{{recommendation_3}}` — string. Rekomendasi konkret per temuan.
- `{{next_check_in}}` — string. Kapan laporan berikutnya / kapan rekomendasi di-review (mis. `15 Februari 2026`).
- `{{data_source_note}}` — string. Sumber data ringkas (mis. `Data internal CRM + survei pelanggan n=120`).

## Template

---
template: report-brief
language: id
length: 1-page
audience: executive
register: formal-concise
---

# {{report_title}}

**Untuk:** {{audience}}
**Dari:** {{author_name}}
**Tanggal:** {{report_date}}
**Periode:** {{period_covered}}

---

## TL;DR

{{tldr_paragraph}}

## Temuan Kunci

### 1. {{finding_1_title}}
{{finding_1_body}}

### 2. {{finding_2_title}}
{{finding_2_body}}

### 3. {{finding_3_title}}
{{finding_3_body}}

## Rekomendasi

1. **Terkait temuan 1 —** {{recommendation_1}}
2. **Terkait temuan 2 —** {{recommendation_2}}
3. **Terkait temuan 3 —** {{recommendation_3}}

---

**Tinjauan berikutnya:** {{next_check_in}}
**Sumber data:** {{data_source_note}}

## Tone guide

Hemat kata. Kalimat pendek, satu ide per kalimat. Pakai data spesifik (angka, persen, tanggal) — hindari kata sifat samar seperti "signifikan", "cukup banyak". Register formal tapi langsung. Total panjang laporan harus muat satu halaman A4 setelah di-render — sekitar 250-350 kata isi.

> _Catatan customer: kalau temuan lebih dari 3, prioritaskan yang paling actionable. Sisanya simpan untuk versi standard atau full report. Brief yang muat ke satu halaman lebih sering dibaca daripada brief yang muat ke dua halaman._
