# Template — Market Sizing (TAM / SAM / SOM)

Kerangka market sizing dengan asumsi eksplisit, rentang sensitivitas, dan source per angka. Bukan satu angka mantap — tiga rentang dengan ketidakpastian yang ditampilkan.
Audience: founder yang sedang validasi market, tim strategi yang siapkan board memo, atau analyst yang harus pertanggungjawabkan angka.
Pakai saat customer minta "berapa besar pasar X" — jangan jawab dengan satu angka tanpa rentang.

## Variables

- `{{market_definition}}` — string. Definisi pasar dalam satu kalimat. Sebutkan produk/jasa, segmen pelanggan, dan geografi.
- `{{geography_scope}}` — string. Geografi yang dihitung (mis. "Indonesia", "Jakarta + Surabaya + Medan", "ASEAN").
- `{{time_horizon}}` — string. Tahun yang dihitung (mis. "tahun berjalan 2026", "rata-rata 2024-2026").
- `{{tam_low}}` — string. TAM batas bawah (mis. "Rp 12 triliun").
- `{{tam_mid}}` — string. TAM titik tengah.
- `{{tam_high}}` — string. TAM batas atas.
- `{{tam_method_note}}` — string. Metode estimasi TAM (top-down dari statistik makro / bottom-up dari unit × harga / proxy dari pasar pembanding).
- `{{tam_source_refs}}` — string. Source numbered references untuk TAM (mis. "[1] BPS Statistik Telekomunikasi 2025, [2] OJK Annual Report 2025").
- `{{sam_low}}` — string. SAM batas bawah.
- `{{sam_mid}}` — string. SAM titik tengah.
- `{{sam_high}}` — string. SAM batas atas.
- `{{sam_filter_logic}}` — string. Filter yang diterapkan ke TAM untuk dapat SAM (mis. "hanya UMKM dengan omset > Rp 500jt/tahun di Pulau Jawa").
- `{{sam_source_refs}}` — string.
- `{{som_low}}` — string. SOM batas bawah dalam 3 tahun.
- `{{som_mid}}` — string. SOM titik tengah.
- `{{som_high}}` — string. SOM batas atas.
- `{{som_capture_rate}}` — string. Asumsi penetrasi yang dipakai (mis. "0.5% - 2% dari SAM dalam 3 tahun, dasar benchmark fintech sejenis").
- `{{som_source_refs}}` — string.
- `{{assumption_1_label}}` — string. Asumsi #1.
- `{{assumption_1_value}}` — string. Nilai yang dipakai + rentang.
- `{{assumption_1_source}}` — string. Source numbered reference.
- `{{assumption_1_uncertainty}}` — string. Tingkat ketidakpastian (low / medium / high) + alasan.
- `{{assumption_2_label}}` — string.
- `{{assumption_2_value}}` — string.
- `{{assumption_2_source}}` — string.
- `{{assumption_2_uncertainty}}` — string.
- `{{assumption_3_label}}` — string.
- `{{assumption_3_value}}` — string.
- `{{assumption_3_source}}` — string.
- `{{assumption_3_uncertainty}}` — string.
- `{{assumption_4_label}}` — string. Opsional.
- `{{assumption_4_value}}` — string. Opsional.
- `{{assumption_4_source}}` — string. Opsional.
- `{{assumption_4_uncertainty}}` — string. Opsional.
- `{{assumption_5_label}}` — string. Opsional.
- `{{assumption_5_value}}` — string. Opsional.
- `{{assumption_5_source}}` — string. Opsional.
- `{{assumption_5_uncertainty}}` — string. Opsional.
- `{{sensitivity_note}}` — string. Asumsi mana yang paling sensitif — kalau salah satu meleset 20%, mana yang paling menggerakkan angka akhir.
- `{{caveats_and_gaps}}` — string. Pertanyaan yang belum terjawab + data yang tidak tersedia. Wajib diisi.
- `{{full_source_list}}` — string. Daftar source lengkap dengan nomor referensi.

## Template

---
template: market-sizing
language: id
register: kamu
purpose: TAM/SAM/SOM with explicit assumption uncertainty
---

# Market Sizing — {{market_definition}}

**Geografi:** {{geography_scope}}
**Horison waktu:** {{time_horizon}}

> Angka berikut adalah estimasi dengan rentang. Tidak ada angka tunggal yang pasti. Setiap level (TAM, SAM, SOM) ditampilkan sebagai rentang low - mid - high karena asumsi di baliknya punya ketidakpastian yang harus ikut dipindah ke pembaca.

---

## TAM — Total Addressable Market

| | Low | Mid | High |
|---|---|---|---|
| Estimasi | {{tam_low}} | {{tam_mid}} | {{tam_high}} |

**Metode:** {{tam_method_note}}
**Sumber:** {{tam_source_refs}}

## SAM — Serviceable Addressable Market

| | Low | Mid | High |
|---|---|---|---|
| Estimasi | {{sam_low}} | {{sam_mid}} | {{sam_high}} |

**Filter dari TAM ke SAM:** {{sam_filter_logic}}
**Sumber:** {{sam_source_refs}}

## SOM — Serviceable Obtainable Market (3 tahun)

| | Low | Mid | High |
|---|---|---|---|
| Estimasi | {{som_low}} | {{som_mid}} | {{som_high}} |

**Asumsi capture rate:** {{som_capture_rate}}
**Sumber:** {{som_source_refs}}

---

## Tabel asumsi

| # | Asumsi | Nilai (rentang) | Sumber | Ketidakpastian |
|---|---|---|---|---|
| 1 | {{assumption_1_label}} | {{assumption_1_value}} | {{assumption_1_source}} | {{assumption_1_uncertainty}} |
| 2 | {{assumption_2_label}} | {{assumption_2_value}} | {{assumption_2_source}} | {{assumption_2_uncertainty}} |
| 3 | {{assumption_3_label}} | {{assumption_3_value}} | {{assumption_3_source}} | {{assumption_3_uncertainty}} |
| 4 | {{assumption_4_label}} | {{assumption_4_value}} | {{assumption_4_source}} | {{assumption_4_uncertainty}} |
| 5 | {{assumption_5_label}} | {{assumption_5_value}} | {{assumption_5_source}} | {{assumption_5_uncertainty}} |

## Sensitivity note

{{sensitivity_note}}

## Caveats & gaps

{{caveats_and_gaps}}

---

## Sumber lengkap

{{full_source_list}}

> Aturan: angka tanpa source di sini sama dengan klaim tanpa bukti. Field source yang kosong artinya angka itu belum siap dipakai untuk pengambilan keputusan.

## Tone guide

Hindari satu angka mantap di TL;DR. Selalu rentang. Asumsi paling lemah disebut duluan di sensitivity note — itu yang paling bisa salah, dan pembaca berhak tahu. Ketidakpastian bukan kelemahan laporan; ketidakpastian yang disembunyikan baru jadi kelemahan. Tidak ada tanda seru, tidak ada kata "pasti" atau "definitely" — kalau memang pasti, tunjukkan source primer langsung dan biarkan angka bicara sendiri.
