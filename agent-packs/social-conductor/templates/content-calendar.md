# Template — Content calendar 4 minggu

> Dipakai `content-calendar-builder` saat customer minta calendar view yang bisa dibaca-sortir, bukan cuma DB schema. Grid 4 minggu × 7 hari × platform. Persisted di local DB; bentuk markdown ini adalah render-out yang bisa di-share atau di-paste ke spreadsheet.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{week_start_date}` | ya | ISO date Senin pertama dari window 4-minggu |
| `{platforms[]}` | ya | List platform yang aktif (mis. `[instagram, tiktok, linkedin]`) |
| `{slots[]}` | ya | Tiap slot: `{date, platform, post_type, tema, status, owner, copy_url}` |
| `{cadence_preset}` | tidak | Reference ke `weekly-cadence-presets.md` — solopreneur / brand / creator |

---

## Template

```
# Content calendar — {customer_name}
Window: {week_start_date} → +4 weeks
Cadence: {cadence_preset}
Platforms: {platforms_joined}

---

## Minggu 1 — {week_1_start}

| Tanggal | Hari | Platform | Post type | Tema | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|
| {date} | Sen | {platform} | {post_type} | {tema} | draft | {owner} | {copy_url} |
| {date} | Sel | {platform} | {post_type} | {tema} | scheduled | {owner} | {copy_url} |
| {date} | Rab | — | — | — | — | — | — |
| {date} | Kam | {platform} | {post_type} | {tema} | draft | {owner} | {copy_url} |
| {date} | Jum | {platform} | {post_type} | {tema} | posted | {owner} | {copy_url} |
| {date} | Sab | — | — | — | — | — | — |
| {date} | Min | — | — | — | — | — | — |

## Minggu 2 — {week_2_start}

| Tanggal | Hari | Platform | Post type | Tema | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... |

## Minggu 3 — {week_3_start}

| Tanggal | Hari | Platform | Post type | Tema | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... |

## Minggu 4 — {week_4_start}

| Tanggal | Hari | Platform | Post type | Tema | Status | Owner | Copy URL |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... |

---

## Field rules

### `platform`
Nilai: instagram | reels | tiktok | x | linkedin | threads | facebook | blog. Satu slot satu platform.

### `post_type`
Nilai: caption | carousel | reel | story | thread | long-form | short-video | live. Membantu draft skill pilih length budget.

### `status`
Nilai: idea → draft → scheduled → posted → archived. Transitions one-way (kecuali archived bisa revive ke draft).

### `owner`
Nama orang yang draft slot ini. Default: customer. Bisa di-assign ke kolaborator kalau team.

### `copy_url`
URL ke dokumen draft (Notion, Docs, atau internal). Optional; bisa kosong kalau draft inline.

---

## Sorting + view

Grid markdown ini bisa di-paste ke Google Sheets / Notion database / Airtable untuk sortable view. Default sort: `date asc`. Secondary sort: `platform`.

Filter views yang berguna:
- Status = draft → daftar yang perlu di-finalize
- Status = scheduled → daftar yang siap posting
- Owner = nama → workload per orang
- Platform = X → cek per-channel cadence

---

## Render-out cycle

Calendar update tiap kali ada slot baru atau status berubah. Re-render markdown ini weekly (Senin pagi) jadi snapshot mingguan. Snapshot lama tetap di DB sebagai history.
```

---

## Tone guide — Calendar render

- **Header:** include customer_name, window, cadence preset, platforms aktif. Audience pembaca = customer + kolaborator. Bukan audience publik
- **Tabel:** kolom konsisten antar minggu. Slot kosong tetap baris (Hari Sen-Min lengkap) supaya rhythm terbaca
- **Em dash (`—`):** tanda slot off-day. Bukan "TBD" atau "N/A"
- **Status emoji:** opsional, bisa skip. Kalau dipakai, max 1 per row, konsisten (mis. ⏳ untuk draft, ✅ untuk posted). Default: tanpa emoji, status text saja
- **Hari order:** Senin sampai Minggu (Indonesian week order). Bukan Sunday-first
- **Date format:** ISO `YYYY-MM-DD` atau `DD MMM` (mis. "15 Mei"). Konsisten antar minggu
- **Tema field:** judul singkat (3-7 kata). Bukan full caption. Detail ada di draft URL
- **Voice:** netral, operational. Bukan marketing-y. Ini dokumen kerja, bukan deck pitch
- **Zero exclamation marks** di header maupun cell content
