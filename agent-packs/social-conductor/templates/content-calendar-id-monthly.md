# Template — Content calendar Indonesia (monthly)

> Dipakai `content-calendar-builder` saat customer butuh calendar bulanan yang aware Indonesian calendar. Mark hari libur nasional, hari besar agama (Idul Fitri, Natal, Nyepi, Waisak, Imlek), event budaya (HUT RI 17 Agustus, Hari Sumpah Pemuda 28 Oktober, Hari Pahlawan 10 November), event komersial (Harbolnas 12.12 / 11.11 / 9.9), seasonal shift (Ramadhan content shift, mudik Lebaran timing).

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{month}` | ya | Nama bulan Indonesia (Januari, Februari, dst) |
| `{year}` | ya | Tahun (2026 / 2027) |
| `{platforms[]}` | ya | List platform aktif |
| `{slots[]}` | ya | Tiap slot: `{date, platform, post_type, tema, status, owner, copy_url, calendar_tag}` |
| `{cadence_preset}` | tidak | Reference ke `weekly-cadence-presets.md` |

---

## Template

```
# Content calendar Indonesia — {customer_name}
Bulan: {month} {year}
Cadence: {cadence_preset}
Platforms: {platforms_joined}

---

## Indonesian calendar context (bulan ini)

### Hari libur nasional + hari besar agama
- {libur_date_1}: {libur_name_1} ({libur_type_1})
- {libur_date_2}: {libur_name_2} ({libur_type_2})

### Event budaya
- {budaya_date}: {budaya_name}

### Event komersial
- {komersial_date}: {komersial_name} (mis. Harbolnas 12.12, Lazada Birthday)

### Seasonal shift (kalau applicable)
- {seasonal_note} (mis. Ramadhan dimulai → content shift ke buka puasa / sahur theme)

---

## Minggu 1 — {week_1_start} s/d {week_1_end}

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| {date} | Sen | {platform} | {post_type} | {tema} | {calendar_tag} | draft | {owner} | {copy_url} |
| {date} | Sel | {platform} | {post_type} | {tema} | {calendar_tag} | scheduled | {owner} | {copy_url} |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

## Minggu 2 — {week_2_start} s/d {week_2_end}

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

## Minggu 3 — {week_3_start} s/d {week_3_end}

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

## Minggu 4 — {week_4_start} s/d {week_4_end}

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... | ... |
```

### Contoh terisi — Bulan Agustus 2026 (HUT RI awareness)

```
# Content calendar Indonesia — Brand X
Bulan: Agustus 2026
Cadence: brand (daily mix)
Platforms: instagram, tiktok, linkedin

---

## Indonesian calendar context (Agustus 2026)

### Hari libur nasional + hari besar agama
- 17 Agustus 2026: HUT RI ke-81 (hari libur nasional, momentum brand patriotism)

### Event budaya
- Sepanjang Agustus: bulan kemerdekaan — lomba 17-an di RT/RW, panjat pinang, balap karung
- Minggu pertama Agustus: persiapan upacara di sekolah / kantor

### Event komersial
- 8 Agustus 2026 (8.8): Shopee 8.8 Sale Day — biasanya flash sale + voucher gratis ongkir
- 17 Agustus 2026 (17.8): Independence Day Sale di marketplace

### Seasonal shift
- Konten brand bisa shift ke patriotic theme minggu kedua Agustus — pakai warna merah putih sparingly, hindari over-commercialize hari kemerdekaan

---

## Minggu 1 — 3 Agustus s/d 9 Agustus

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| 03 Ags | Sen | instagram | carousel | Tips konsisten posting Agustus | — | draft | Rini | docs/draft-001 |
| 05 Ags | Rab | tiktok | short-video | Behind the scenes packing | — | draft | Rini | docs/draft-002 |
| 08 Ags | Sab | instagram | caption | Promo 8.8 — Diskon 20% pakai voucher AGUSTUS | komersial-8.8 | scheduled | Andi | docs/draft-003 |

## Minggu 2 — 10 Agustus s/d 16 Agustus

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| 10 Ags | Sen | linkedin | long-form | Refleksi 81 tahun: bagaimana UMKM Indonesia berubah | budaya-hutri | draft | Rini | docs/draft-004 |
| 14 Ags | Jum | instagram | reel | Story karyawan: kenapa kerja di brand Indonesia | budaya-hutri | draft | Rini | docs/draft-005 |
| 16 Ags | Min | tiktok | short-video | Lomba 17-an di kantor — sneak peek | budaya-hutri | scheduled | Andi | docs/draft-006 |

## Minggu 3 — 17 Agustus s/d 23 Agustus

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| 17 Ags | Sen | instagram | carousel | Selamat HUT RI ke-81 — kontribusi brand untuk UMKM lokal | libur-hutri | scheduled | Rini | docs/draft-007 |
| 17 Ags | Sen | linkedin | post | Hari kemerdekaan: 3 cara dukung UMKM Indonesia | libur-hutri | scheduled | Rini | docs/draft-008 |
| 20 Ags | Kam | tiktok | short-video | Recap lomba 17-an + ucapan tim | budaya-hutri | draft | Andi | docs/draft-009 |

## Minggu 4 — 24 Agustus s/d 30 Agustus

| Tanggal | Hari | Platform | Post type | Tema | Calendar tag | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|---|
| 25 Ags | Sel | instagram | caption | Wrap-up bulan kemerdekaan + persiapan September | — | draft | Rini | docs/draft-010 |
| 28 Ags | Jum | linkedin | long-form | Lessons learned: campaign HUT RI tahun ini | — | draft | Rini | docs/draft-011 |
```

---

## Reference packet — Indonesian calendar (annual recurring)

### Hari libur nasional (fixed-date — verifikasi tiap tahun via Kemenag / SKB Menteri)

- **1 Januari:** Tahun Baru Masehi
- **17 Agustus:** HUT RI (HUT Kemerdekaan)
- **25 Desember:** Hari Natal

### Hari besar agama (date geser per kalender lunar — cek tahun-spesifik)

- **Tahun Baru Imlek** (Januari/Februari, kalender lunar Tiongkok) — Indonesia tetapkan via SKB
- **Hari Raya Nyepi** (Maret, kalender Saka — Hindu) — Indonesia tetapkan via SKB
- **Wafat Isa Almasih** (Maret/April, Jumat Agung Kristen)
- **Hari Raya Waisak** (April/Mei, kalender Buddha) — Indonesia tetapkan via SKB
- **Kenaikan Isa Almasih** (Mei, Kristen)
- **Hari Raya Idul Fitri** (Mei/Juni di 2026, kalender Hijriah — 2 hari libur)
- **Hari Raya Idul Adha** (Juni/Juli di 2026, kalender Hijriah)
- **Tahun Baru Hijriah / 1 Muharram** (Juli/Agustus)
- **Maulid Nabi Muhammad** (September/Oktober)
- **Isra Mi'raj** (Februari/Maret)

### Event budaya nasional (fixed-date)

- **21 April:** Hari Kartini
- **2 Mei:** Hari Pendidikan Nasional
- **1 Juni:** Hari Lahir Pancasila
- **28 Oktober:** Hari Sumpah Pemuda
- **10 November:** Hari Pahlawan
- **22 Desember:** Hari Ibu

### Event komersial Indonesia (annual)

- **9.9** (9 September): Shopee / Lazada / Tokopedia 9.9 Sale
- **10.10** (10 Oktober): 10.10 Brand Festival
- **11.11** (11 November): Single's Day Sale (origin China, Indonesia adopt)
- **12.12** (12 Desember): Harbolnas (Hari Belanja Online Nasional) — campaign terbesar e-commerce Indonesia
- **Akhir tahun (Desember 25-31):** Year-end sale, Christmas + Tahun Baru combo

### Seasonal shift content

- **Bulan Ramadhan** (bulan ke-9 Hijriah, ~Maret-April-Mei di 2026): content shift ke buka puasa, sahur, takjil, tips menahan lapar di kantor. Brand makanan boost, brand entertainment shift jadwal posting ke late-night (setelah tarawih)
- **Minggu mudik Lebaran** (H-7 sampai H+7 Idul Fitri): konsumsi konten meningkat di perjalanan + di kampung halaman. Format video panjang + storytelling baik. Hindari hard-sell — momen reflektif keluarga
- **Awal tahun ajaran baru** (Juli): brand pendidikan + perlengkapan sekolah peak
- **Bulan Agustus:** patriotic theme, pakai sparingly. Hindari over-commercialize hari kemerdekaan
- **Desember:** belanja akhir tahun + tema retrospective brand

---

## Calendar tag values

Pakai di kolom `calendar_tag` untuk filter slot terkait event:

- `libur-hutri` / `libur-natal` / `libur-imlek` / `libur-nyepi` / `libur-waisak` / `libur-idulfitri` / `libur-iduladha`
- `budaya-hutri` / `budaya-sumpahpemuda` / `budaya-pahlawan` / `budaya-kartini` / `budaya-pendidikan`
- `komersial-9.9` / `komersial-10.10` / `komersial-11.11` / `komersial-12.12-harbolnas` / `komersial-8.8`
- `seasonal-ramadhan` / `seasonal-lebaran-mudik` / `seasonal-tahun-ajaran-baru` / `seasonal-yearend`

---

## Tone guide — Calendar Indonesia

- **Tanggal format Indonesia:** "17 Ags 2026" atau "17 Agustus 2026". Bukan ISO `2026-08-17` di display (boleh di DB)
- **Hari Senin-Minggu order:** Indonesian week (bukan US Sunday-first)
- **Hari libur nasional mark wajib:** kalau ada di window calendar, mark di context section bahkan kalau brand tidak posting hari itu
- **Hari besar agama spesifik:** Idul Fitri / Natal / Nyepi treated separately — Idul Fitri pull audience consumption tinggi via WA/IG; Nyepi (Bali) audience offline 24 jam
- **Event komersial pre-plan:** Harbolnas 12.12 needs prep H-14 (teaser → reminder → live day). Slot di calendar dari Nov 28
- **Calendar tag konsisten:** pakai exact value di reference packet — bukan freestyle naming
- **Seasonal note di header:** kalau bulan masuk Ramadhan atau periode mudik, tulis di context section supaya owner sadar shift jadwal
- **Zero exclamation marks** di header maupun cell content

---

## Validation rules (skill-side)

- Calendar harus include "Indonesian calendar context" section di top
- Tanggal display dalam format `DD MMM YYYY` BI (bukan ISO di view, ISO di DB)
- Slot yang overlap dengan hari libur nasional → flag warning (kemungkinan rendah engagement atau konten harus respect makna)
- Slot yang masuk periode Ramadhan → flag untuk shift jadwal posting ke late-night
- Calendar tag harus dari enumerated set (atau kosong `—`)
- Min 1 event komersial per bulan kalau brand consumer-facing (Harbolnas / 11.11 / 9.9)
