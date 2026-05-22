# Template — Report Full (Long-form 10+ Halaman)

Laporan long-form 10+ halaman: cover, executive summary, metodologi, temuan, analisis mendalam, kesimpulan, appendix, sitasi.
Audience: stakeholder yang butuh dokumentasi lengkap (auditor, regulator, board, dewan komisaris, akademisi).
Pakai untuk laporan tahunan, riset pasar mendalam, due diligence, atau dokumen yang akan jadi referensi jangka panjang.

## Variables

- `{{report_title}}` — string. Judul utama.
- `{{report_subtitle}}` — string. Subjudul deskriptif.
- `{{report_id}}` — string. ID dokumen (mis. `RPT-2026-001`).
- `{{publication_date}}` — string. Tanggal terbit.
- `{{author_name}}`, `{{author_title}}`, `{{author_affiliation}}` — string. Penyusun utama.
- `{{contributor_list}}` — markdown list. Kontributor tambahan (riset, review, editor).
- `{{commissioning_party}}` — string. Pihak yang meminta laporan (bila ada).
- `{{audience}}` — string. Target pembaca utama.
- `{{period_covered}}` — string. Periode analisis.
- `{{abstract}}` — string. Abstract 200-300 kata.
- `{{executive_summary_paragraph_1}}` — string. Latar + tujuan.
- `{{executive_summary_paragraph_2}}` — string. Temuan utama (high-level).
- `{{executive_summary_paragraph_3}}` — string. Implikasi + rekomendasi inti.
- `{{introduction_background}}` — string. Latar belakang (2-3 paragraf).
- `{{introduction_problem_statement}}` — string. Pernyataan masalah.
- `{{introduction_research_questions}}` — markdown list. Pertanyaan riset.
- `{{introduction_scope_and_limitations}}` — string. Scope + batasan.
- `{{methodology_design}}` — string. Desain riset.
- `{{methodology_data_collection}}` — string. Cara pengumpulan data.
- `{{methodology_data_analysis}}` — string. Teknik analisis.
- `{{methodology_validity}}` — string. Pengujian validitas / reliabilitas.
- `{{finding_section_1_title}}`, `{{finding_section_1_body}}` — string. Bagian temuan 1 (multi-paragraf).
- `{{finding_section_2_title}}`, `{{finding_section_2_body}}` — string. Bagian 2.
- `{{finding_section_3_title}}`, `{{finding_section_3_body}}` — string. Bagian 3.
- `{{finding_section_4_title}}`, `{{finding_section_4_body}}` — string. Bagian 4 (opsional).
- `{{analysis_synthesis}}` — string. Sintesis lintas temuan (multi-paragraf).
- `{{analysis_comparison_with_prior_work}}` — string. Komparasi dengan literatur / studi serupa.
- `{{analysis_implications_strategic}}` — string. Implikasi strategis.
- `{{analysis_implications_operational}}` — string. Implikasi operasional.
- `{{conclusion_summary}}` — string. Kesimpulan utama.
- `{{conclusion_recommendations}}` — markdown list. Rekomendasi prioritas.
- `{{conclusion_future_work}}` — string. Riset / kajian lanjutan yang disarankan.
- `{{appendix_a_data_tables}}` — string. Tabel data mentah.
- `{{appendix_b_interview_summaries}}` — string. Ringkasan wawancara (jika relevan).
- `{{appendix_c_glossary}}` — string. Glossary istilah.
- `{{citations_apa}}` — markdown list. Daftar sitasi dalam format APA.
- `{{distribution_list}}` — markdown list. Penerima dokumen (untuk version control).
- `{{contact_for_questions}}` — string. Kontak penulis.

## Template

---
template: report-full
language: id
length: 10-plus-pages
audience: board-or-auditor
register: formal-academic
---

<div style="text-align:center; margin-top:120px;">

# {{report_title}}

### {{report_subtitle}}

<br><br>

**No. Dokumen:** {{report_id}}
**Diterbitkan:** {{publication_date}}

<br><br>

Disusun oleh
**{{author_name}}**
{{author_title}}, {{author_affiliation}}

Untuk
**{{commissioning_party}}**

</div>

<div style="page-break-after: always;"></div>

---

## Daftar Isi

1. Abstract
2. Ringkasan Eksekutif
3. Pendahuluan
4. Metodologi
5. Temuan
6. Analisis
7. Kesimpulan &amp; Rekomendasi
8. Appendix
9. Daftar Pustaka

---

## 1. Abstract

{{abstract}}

---

## 2. Ringkasan Eksekutif

{{executive_summary_paragraph_1}}

{{executive_summary_paragraph_2}}

{{executive_summary_paragraph_3}}

---

## 3. Pendahuluan

### 3.1 Latar Belakang

{{introduction_background}}

### 3.2 Pernyataan Masalah

{{introduction_problem_statement}}

### 3.3 Pertanyaan Riset

{{introduction_research_questions}}

### 3.4 Lingkup &amp; Batasan

{{introduction_scope_and_limitations}}

---

## 4. Metodologi

### 4.1 Desain Penelitian

{{methodology_design}}

### 4.2 Pengumpulan Data

{{methodology_data_collection}}

### 4.3 Analisis Data

{{methodology_data_analysis}}

### 4.4 Validitas &amp; Reliabilitas

{{methodology_validity}}

---

## 5. Temuan

### 5.1 {{finding_section_1_title}}

{{finding_section_1_body}}

### 5.2 {{finding_section_2_title}}

{{finding_section_2_body}}

### 5.3 {{finding_section_3_title}}

{{finding_section_3_body}}

### 5.4 {{finding_section_4_title}}

{{finding_section_4_body}}

---

## 6. Analisis

### 6.1 Sintesis Lintas Temuan

{{analysis_synthesis}}

### 6.2 Komparasi dengan Studi Terdahulu

{{analysis_comparison_with_prior_work}}

### 6.3 Implikasi Strategis

{{analysis_implications_strategic}}

### 6.4 Implikasi Operasional

{{analysis_implications_operational}}

---

## 7. Kesimpulan &amp; Rekomendasi

{{conclusion_summary}}

### 7.1 Rekomendasi Prioritas

{{conclusion_recommendations}}

### 7.2 Kajian Lanjutan

{{conclusion_future_work}}

---

## 8. Appendix

### A. Tabel Data

{{appendix_a_data_tables}}

### B. Ringkasan Wawancara

{{appendix_b_interview_summaries}}

### C. Glossary

{{appendix_c_glossary}}

---

## 9. Daftar Pustaka

{{citations_apa}}

---

### Kontributor

{{contributor_list}}

### Distribusi dokumen

{{distribution_list}}

### Kontak

Pertanyaan, klarifikasi, atau permintaan data tambahan dapat diarahkan ke {{contact_for_questions}}.

## Tone guide

Register formal-akademik. Tubuh dokumen objektif — gunakan "data menunjukkan", "analisis mengindikasikan" daripada "kami melihat". Setiap klaim besar harus berdasar sitasi atau data internal yang disebutkan. Hindari opini tanpa data. Sitasi inline pakai format APA (`Penulis, Tahun`) dan daftar lengkap di section 9. Paragraf boleh lebih panjang (4-6 kalimat) dibanding brief/standard. Tidak ada tanda seru. Total target 10-25 halaman A4, 4000-9000 kata isi.

> _Catatan customer: dokumen long-form biasanya butuh review minimal 2 putaran. Susun draft pertama lengkap (boleh kasar), lalu satu putaran restrukturisasi, satu putaran polish. Daftar pustaka diisi paralel sambil menulis — jangan ditunda ke akhir._
