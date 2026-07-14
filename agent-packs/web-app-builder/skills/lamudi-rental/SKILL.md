# lamudi-rental — Hermes skill

Bundle: web-app-builder (Web Creator) — Phase 4-3 seed skill (DRAFT)
Tier: studio (DRAFT gate)
Handler: `hermes-skill:autobrowse-replay`

> **Status: DRAFT (Phase 4-3 scaffolding 2026-05-10).** Selectors are placeholders authored from Lamudi Indonesia's public DOM patterns at spec lock. Founder runs real Autobrowse capture sessions to refine. See "Graduation status" footer.

## Kapan dipakai

- "extract detail properti dari Lamudi"
- "scrape rental Lamudi"
- "tarik info sewa rumah dari URL Lamudi"
- "lookup property di Lamudi"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `property_url` | string | ya | URL halaman property Lamudi (https://www.lamudi.co.id/...) |

## Yang dilakukan

1. Buka `property_url` di browser engine.
2. Tunggu network-idle.
3. Ekstrak field berikut:
   - `property_title` — heading utama
   - `property_price` — harga + unit (per bulan / per tahun untuk rental; sekali untuk dijual)
   - `transaction_type` — "Disewa" / "Dijual"
   - `property_type` — Rumah / Apartemen / Ruko / Tanah / Villa
   - `bedroom_count` — jumlah kamar tidur
   - `bathroom_count` — jumlah kamar mandi
   - `floor_area_sqm` — luas bangunan (m²)
   - `land_area_sqm` — luas tanah (m², kalau applicable)
   - `location` — kota + provinsi + kecamatan kalau tersedia
   - `agent_name` — nama agen real estate (kalau ada)
   - `agency_name` — perusahaan agen (Century 21, ERA, dll. atau independent)
   - `description` — body description text
   - `amenities` — array of feature tags ("AC", "Garasi", "Carport", "Pool")
   - `image_urls` — array of property photo URLs
4. Return JSON object.

## Output

Persona-voice wrapper:

> "Property di Lamudi:
>
> **Rumah 2 Lantai di Pondok Indah** — Rp 35.000.000/bulan (sewa)
> 🏠 Rumah · 🛏 4 KT · 🛁 3 KM · 📐 250 m² bangunan / 350 m² tanah
> 📍 Pondok Indah, Jakarta Selatan
> 👤 Anita Wijaya · ERA Indonesia
>
> **Fasilitas:** AC central, garasi 2 mobil, taman, pool
>
> **Deskripsi singkat:** Rumah modern 2 lantai dengan view taman. Furnished. Cocok untuk keluarga ekspat atau corporate housing. Available immediately.
>
> Mau aku bandingkan dengan listing lain di Pondok Indah, atau monitor harga ini?"

## Decline

- **URL bukan property page** — return `not_a_property_page`.
- **Listing sudah di-take-off / sold** — return partial dengan flag `status: 'closed'`.
- **Geo-restricted** (rare; some premium listings region-locked) — return `geo_blocked`.

## Failure handling

- **Bedroom/bathroom count missing** (commercial property — ruko/tanah) — set to null + flag `is_residential: false` for downstream filtering.
- **Price unit ambiguous** ("Rp 1.5 jt" tanpa /bulan suffix) — try parse from page metadata; fall back to `price_unit: 'unknown'`.
- **Agency vs independent** — kalau `agency_name` field tidak ada / kosong, set `is_independent: true`.

## Graduation status

**Phase 4-3 v0 (2026-05-10): DRAFT scaffolding.** Real graduation: founder runs Autobrowse pada 5-10 property Lamudi berbeda jenis (rumah, apartemen, ruko, tanah; sewa + jual). Lamudi layout cukup konsisten antar property type, tapi commercial property has different field set than residential.

**Slip-able per Q3=B locked sequence:** kalau Phase 4-3 timeline tight, OLX + Lamudi defer ke Phase 4.5. Tokopedia + Shopee + Glints + Kompas adalah must-ship four.
