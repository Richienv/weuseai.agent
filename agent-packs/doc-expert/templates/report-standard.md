# Template — Report Standard (3-5 Halaman)

Laporan standar 3-5 halaman dengan executive summary, temuan terstruktur, detail pendukung, langkah berikutnya, dan appendix.
Audience: middle management atau cross-functional stakeholder yang butuh konteks lebih dari brief tapi tidak punya waktu untuk full report.
Pakai untuk laporan bulanan departemen, hasil project review, atau analisis kompetitor menengah.

## Variables

- `{{report_title}}` — string. Judul laporan.
- `{{report_subtitle}}` — string. Subjudul opsional (mis. periode atau scope).
- `{{report_date}}` — string. Tanggal terbit.
- `{{author_name}}`, `{{author_title}}` — string. Penyusun + jabatan.
- `{{audience}}` — string. Penerima laporan.
- `{{period_covered}}` — string. Periode analisis.
- `{{executive_summary}}` — string. Ringkasan eksekutif 3-5 kalimat.
- `{{context_paragraph}}` — string. Konteks singkat: kenapa laporan ini dibuat.
- `{{methodology_paragraph}}` — string. Bagaimana data dikumpulkan/dianalisis (1 paragraf).
- `{{finding_1_title}}`, `{{finding_1_body}}`, `{{finding_1_supporting_data}}` — string. Temuan + data pendukung.
- `{{finding_2_title}}`, `{{finding_2_body}}`, `{{finding_2_supporting_data}}` — string.
- `{{finding_3_title}}`, `{{finding_3_body}}`, `{{finding_3_supporting_data}}` — string.
- `{{finding_4_title}}`, `{{finding_4_body}}`, `{{finding_4_supporting_data}}` — string (opsional).
- `{{analysis_paragraph_1}}`, `{{analysis_paragraph_2}}` — string. Interpretasi pola lintas temuan.
- `{{risk_or_caveat}}` — string. Batasan / risiko yang perlu diingat saat baca laporan.
- `{{recommendation_short_term}}` — markdown list. Rekomendasi jangka pendek (0-30 hari).
- `{{recommendation_mid_term}}` — markdown list. Rekomendasi 30-90 hari.
- `{{recommendation_long_term}}` — markdown list. Rekomendasi 90+ hari (opsional).
- `{{owner_table}}` — markdown table. Siapa-eksekusi-apa-kapan.
- `{{appendix_data_summary}}` — string. Ringkasan data mentah / referensi.
- `{{appendix_definitions}}` — string. Istilah teknis yang perlu didefinisikan.
- `{{contact_for_questions}}` — string. Kontak penulis untuk klarifikasi.

## Template

---
template: report-standard
language: id
length: 3-5-pages
audience: middle-management
register: formal
---

# {{report_title}}

_{{report_subtitle}}_

**Untuk:** {{audience}}
**Dari:** {{author_name}}, {{author_title}}
**Tanggal:** {{report_date}}
**Periode:** {{period_covered}}

---

## 1. Ringkasan Eksekutif

{{executive_summary}}

## 2. Konteks

{{context_paragraph}}

## 3. Metode

{{methodology_paragraph}}

## 4. Temuan

### 4.1 {{finding_1_title}}

{{finding_1_body}}

**Data pendukung:** {{finding_1_supporting_data}}

### 4.2 {{finding_2_title}}

{{finding_2_body}}

**Data pendukung:** {{finding_2_supporting_data}}

### 4.3 {{finding_3_title}}

{{finding_3_body}}

**Data pendukung:** {{finding_3_supporting_data}}

### 4.4 {{finding_4_title}}

{{finding_4_body}}

**Data pendukung:** {{finding_4_supporting_data}}

## 5. Analisis

{{analysis_paragraph_1}}

{{analysis_paragraph_2}}

**Batasan:** {{risk_or_caveat}}

## 6. Rekomendasi &amp; Langkah Berikutnya

### Jangka pendek (0-30 hari)

{{recommendation_short_term}}

### Jangka menengah (30-90 hari)

{{recommendation_mid_term}}

### Jangka panjang (90+ hari)

{{recommendation_long_term}}

### Penanggung jawab

{{owner_table}}

## 7. Appendix

### A. Ringkasan data
{{appendix_data_summary}}

### B. Definisi istilah
{{appendix_definitions}}

---

Pertanyaan terkait laporan ini dapat diarahkan ke {{contact_for_questions}}.

## Tone guide

Register formal-bisnis. Tubuh tetap concise — hindari paragraf lebih dari 4 kalimat. Setiap temuan harus disertai data spesifik; klaim tanpa data digeser ke "Analisis" dengan disclaimer. Rekomendasi pakai kata kerja eksekutif ("audit", "implementasi", "evaluasi") bukan kata samar ("perhatikan", "pertimbangkan"). Tidak ada tanda seru. Pakai "kami" untuk tim penyusun; sebut stakeholder dengan jabatan, bukan nama.

> _Catatan customer: target panjang 3-5 halaman A4 setelah render — kira-kira 1000-1800 kata isi. Kalau temuan lebih dari 4, evaluasi apakah perlu pisah jadi sub-laporan atau pindah ke full report._
