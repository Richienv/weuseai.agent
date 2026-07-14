# Template — Slide Problem (Single Slide)

Audience: kamu sedang draft satu slide masalah untuk deck yang lebih besar. Use case: slide problem stand-alone — fokus pada satu statistik, satu kutipan customer, dan satu cost-of-inaction. Scope: satu slide saja, bisa di-slot ke deck mana pun.

## Variables

- `{{problem_one_liner}}` — judul slide, masalah inti dalam satu kalimat
- `{{problem_statistic}}` — satu angka yang ukur skala masalah
- `{{problem_statistic_source}}` — source angka (institusi, laporan, tahun)
- `{{customer_segment}}` — siapa yang paling kena dampak
- `{{customer_quote}}` — kutipan literal dari customer atau wawancara (1-2 kalimat)
- `{{customer_quote_attribution}}` — nama atau role + perusahaan customer (boleh anonim)
- `{{cost_of_inaction}}` — implikasi konkret kalau masalah ini dibiarkan (revenue, waktu, risiko)

## Template

```
---
template: slide-problem
slide_kind: problem
slide_count: 1
language: id
---

# Slide — Masalah
**Title:** {{problem_one_liner}}

**Visual layout:**
- Header (atas, kiri): judul slide singkat
- Center anchor: satu angka besar {{problem_statistic}} dengan label kecil di bawah ("— {{problem_statistic_source}}")
- Quote block (kanan atau bawah): "{{customer_quote}}" — {{customer_quote_attribution}}
- Footer line (paling bawah, kecil): Cost of inaction — {{cost_of_inaction}}

**Body text minimum:** Tidak ada paragraf. Hanya satu statistik + satu kutipan + satu kalimat cost. Sisanya whitespace.

**Speaker note:**
Mulai dari rasa, bukan angka. Buka dengan kutipan customer — bacakan apa adanya, jeda 2 detik. Lalu sebut statistik dan source. Tutup dengan cost of inaction: "Tanpa intervensi, {{customer_segment}} tetap {{cost_of_inaction}} setiap kuartal." Total ~75-90 detik.

**Anti-pola yang dihindari:**
- Bullet list 5 item tentang "kenapa ini masalah" — gantikan dengan satu angka yang menjelaskan sendiri
- Stock photo orang frustrasi memegang kepala — clutter, kosong, tidak personal
- Statistik tanpa source — kredibilitas hilang di slide pertama
- Kutipan tempelan generik ("our customers say...") — pakai nama, atau anonim eksplisit dengan role spesifik
```

## Tone guide

- Satu slide, tiga elemen, banyak whitespace. Slide problem yang padat membunuh impact.
- Statistik wajib bersumber. Audience yang sadar tidak menerima angka tanpa atribusi.
- Kutipan customer lebih kuat dari klaim founder. Pilih kutipan yang specific dan ber-emosi, bukan polished.
- Cost-of-inaction di footer, bukan di tengah. Tengah untuk dampak emosional (kutipan), footer untuk dampak rasional (cost).
- Bahasa Indonesia primer; English untuk istilah teknis source (e.g., "World Bank 2024", "McKinsey Indonesia Report 2025").
- Tidak ada exclamation marks. Slide problem yang berteriak terbaca seperti iklan.
