# olx-listing — Hermes skill

Bundle: web-app-builder (Web Creator) — Phase 4-3 seed skill (DRAFT)
Tier: studio (DRAFT gate)
Handler: `hermes-skill:autobrowse-replay`

> **Status: DRAFT (Phase 4-3 scaffolding 2026-05-10).** Selectors are placeholders authored from OLX Indonesia's public DOM patterns at spec lock. Founder runs real Autobrowse capture sessions to refine. See "Graduation status" footer.

## Kapan dipakai

- "extract data listing OLX"
- "scrape OLX item"
- "tarik harga + lokasi dari URL OLX"
- "lookup listing di OLX"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `listing_url` | string | ya | URL halaman listing OLX (https://www.olx.co.id/item/...) |

## Yang dilakukan

1. Buka `listing_url` di browser engine.
2. Tunggu network-idle.
3. Ekstrak field berikut:
   - `listing_title` — heading utama listing
   - `listing_price` — harga (Rp X jt / Rp X rb format umum)
   - `condition` — Baru / Bekas (kalau item kategori barang)
   - `location` — kota + provinsi
   - `posted_date` — relative ("kemarin", "2 hari lalu") OR ISO datestamp
   - `seller_name` — nama penjual
   - `seller_member_since` — durasi member (e.g. "Anggota sejak Juni 2024")
   - `description` — body description text
   - `image_urls` — array of listing photo URLs
   - `category_breadcrumb` — array of category levels (e.g. ["Properti", "Rumah", "Dijual"])
4. Return JSON object.

## Output

Persona-voice wrapper:

> "Listing OLX:
>
> **Honda Civic 2020 Hitam Matic** — Rp 285.000.000
> 📍 Jakarta Selatan, DKI Jakarta · 🛻 Bekas
> 👤 BudiSantoso · Anggota sejak Maret 2023
> 🕒 Diposting kemarin
>
> **Deskripsi:**
> Honda Civic Turbo 2020, kondisi prima, KM 45.000, service record lengkap di bengkel resmi. Kontak via OLX chat untuk test drive.
>
> **Kategori:** Mobil → Honda → Civic
>
> Mau aku monitor listing ini untuk price change, atau bandingkan dengan Civic 2020 lain di area Jakarta?"

## Decline

- **URL bukan listing** (search result, kategori page, profile seller) — return `not_a_listing`.
- **Listing sold / removed** — return data partial + flag `status: 'closed'`.
- **Captcha** — pause + re-run.

## Failure handling

- **Price kosong** (some seller prefer "hubungi penjual") — `listing_price: null` + flag `price_disclosed: false`.
- **Image gallery lazy-load** — scroll dipicu jika img count < 3 setelah initial load.
- **Phone number obfuscated** — OLX hide nomor by default; skill ngga try to reveal (anti-spam policy).

## Graduation status

**Phase 4-3 v0 (2026-05-10): DRAFT scaffolding.** Real graduation: founder runs Autobrowse pada 5-10 listing OLX berbeda kategori (mobil, properti, elektronik, fashion) — OLX layout has minor variants per category vertical.
