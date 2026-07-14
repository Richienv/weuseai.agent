# Template — Research Question Decomposition

Worksheet untuk memecah pertanyaan riset yang fuzzy jadi 3-6 sub-pertanyaan yang bisa dijawab langsung sumber. Tiap sub-pertanyaan dilengkapi search angle dan tipe sumber yang paling cocok.
Audience: Deep Researcher saat scoping playbook, atau customer yang mau membantu mengetatkan pertanyaan utama sebelum riset jalan.
Pakai setelah `research-brief.md` terisi tapi pertanyaan utama masih terlalu luas untuk satu pass riset.

## Variables

- `{{primary_question}}` — string. Pertanyaan utama dari research brief.
- `{{ambiguity_notes}}` — string. Bagian pertanyaan utama yang masih ambigu (definisi, batas waktu, ukuran sukses).
- `{{subquestion_1}}` — string. Sub-pertanyaan pertama, bentuk pertanyaan tertutup.
- `{{subquestion_1_angle}}` — string. Search angle — query yang dipakai + alasan kenapa angle ini paling cepat ketemu jawab.
- `{{subquestion_1_source_type}}` — string. Tipe sumber utama (mis. "regulator filings", "paper peer-reviewed", "laporan tahunan emiten").
- `{{subquestion_1_evidence_threshold}}` — string. Bukti minimum untuk anggap sub-pertanyaan terjawab.
- `{{subquestion_2}}` — string.
- `{{subquestion_2_angle}}` — string.
- `{{subquestion_2_source_type}}` — string.
- `{{subquestion_2_evidence_threshold}}` — string.
- `{{subquestion_3}}` — string.
- `{{subquestion_3_angle}}` — string.
- `{{subquestion_3_source_type}}` — string.
- `{{subquestion_3_evidence_threshold}}` — string.
- `{{subquestion_4}}` — string. Opsional. Kosongkan kalau hanya 3 sub-pertanyaan.
- `{{subquestion_4_angle}}` — string. Opsional.
- `{{subquestion_4_source_type}}` — string. Opsional.
- `{{subquestion_4_evidence_threshold}}` — string. Opsional.
- `{{subquestion_5}}` — string. Opsional.
- `{{subquestion_5_angle}}` — string. Opsional.
- `{{subquestion_5_source_type}}` — string. Opsional.
- `{{subquestion_5_evidence_threshold}}` — string. Opsional.
- `{{subquestion_6}}` — string. Opsional.
- `{{subquestion_6_angle}}` — string. Opsional.
- `{{subquestion_6_source_type}}` — string. Opsional.
- `{{subquestion_6_evidence_threshold}}` — string. Opsional.
- `{{coverage_check}}` — string. Cek terakhir — kalau semua sub-pertanyaan terjawab, apakah pertanyaan utama benar-benar terjawab. Kalau tidak, sebut gap yang tersisa.

## Template

---
template: research-question-decomposition
language: id
register: kamu
purpose: decompose fuzzy question into search-ready sub-questions
---

# Decomposition — {{primary_question}}

## Bagian yang masih ambigu

{{ambiguity_notes}}

---

## Sub-pertanyaan

### 1. {{subquestion_1}}

- **Search angle:** {{subquestion_1_angle}}
- **Tipe sumber utama:** {{subquestion_1_source_type}}
- **Evidence threshold:** {{subquestion_1_evidence_threshold}}

### 2. {{subquestion_2}}

- **Search angle:** {{subquestion_2_angle}}
- **Tipe sumber utama:** {{subquestion_2_source_type}}
- **Evidence threshold:** {{subquestion_2_evidence_threshold}}

### 3. {{subquestion_3}}

- **Search angle:** {{subquestion_3_angle}}
- **Tipe sumber utama:** {{subquestion_3_source_type}}
- **Evidence threshold:** {{subquestion_3_evidence_threshold}}

### 4. {{subquestion_4}}

- **Search angle:** {{subquestion_4_angle}}
- **Tipe sumber utama:** {{subquestion_4_source_type}}
- **Evidence threshold:** {{subquestion_4_evidence_threshold}}

### 5. {{subquestion_5}}

- **Search angle:** {{subquestion_5_angle}}
- **Tipe sumber utama:** {{subquestion_5_source_type}}
- **Evidence threshold:** {{subquestion_5_evidence_threshold}}

### 6. {{subquestion_6}}

- **Search angle:** {{subquestion_6_angle}}
- **Tipe sumber utama:** {{subquestion_6_source_type}}
- **Evidence threshold:** {{subquestion_6_evidence_threshold}}

---

## Coverage check

{{coverage_check}}

> Aturan kerja: kalau coverage check menunjukkan gap, tambah sub-pertanyaan baru sebelum search dimulai — bukan setelah laporan setengah jadi.

## Tone guide

Sub-pertanyaan harus tertutup — dijawab dengan angka, daftar, atau pernyataan yang verifiable. Bukan "bagaimana cara X" yang terbuka. Search angle harus sespesifik mungkin: query string yang siap dipasang ke search engine atau database, bukan deskripsi abstrak. Tipe sumber wajib bernama (mis. "OJK statistik bulanan", bukan "data resmi"). Evidence threshold mendisiplinkan kapan sub-pertanyaan boleh dianggap selesai — tanpa threshold, riset mudah molor.
