# shopee-storefront — Hermes skill

Bundle: web-master (Web Creator) — Phase 4-3 seed skill (DRAFT)
Tier: studio (DRAFT gate)
Handler: `hermes-skill:autobrowse-replay`

> **Status: DRAFT (Phase 4-3 scaffolding 2026-05-10).** Selectors are placeholders authored from Shopee's public DOM patterns at spec lock. Founder runs real Autobrowse capture sessions to refine. See "Graduation status" footer.

## Kapan dipakai

- "scrape produk dari Shopee storefront"
- "list produk Shopee"
- "harga + sold count dari halaman toko Shopee"
- "extract storefront Shopee"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `storefront_url` | string | ya | URL halaman toko Shopee (https://shopee.co.id/<store-name>) |
| `max_products` | number | tidak | Default 20. Cap pada 50. |

## Yang dilakukan

1. Buka `storefront_url` di browser engine.
2. Tunggu network-idle + scroll-to-load satu kali (Shopee uses lazy-load).
3. Iterate over `min(max_products, found)` product cards di halaman:
   - `product_title` — nama produk
   - `product_price` — harga (current + original kalau diskon)
   - `sold_count` — jumlah terjual (e.g. "10rb terjual" atau "234 terjual")
   - `rating_avg` — bintang (kalau ditampilkan; opsional)
   - `product_url` — link ke halaman produk
4. Return array of products + storefront metadata (toko name, total products on page).

## Output

Persona-voice wrapper:

> "Storefront [TokoXYZ] di Shopee — top 20 produk:
>
> | Produk | Harga | Terjual |
> |---|---|---|
> | Sneakers AirRun | Rp 350.000 | 3.2rb terjual |
> | Hoodie Oversized | Rp 220.000 | 1.8rb terjual |
> | ... | ... | ... |
>
> Toko ini punya 156 produk total. Mau aku pivot ke produk paling laris, atau bandingkan dengan toko kompetitor?"

## Decline

- **URL bukan storefront** (search result, kategori, halaman produk single) — return `not_a_storefront`.
- **Captcha** — high-volume → pause + re-run.
- **Halaman butuh login** (private storefronts rare) — return `auth_required`.

## Failure handling

- **Lazy-load tidak fully populate** — skill scroll 3× ke bawah; kalau masih < expected, return partial dengan flag.
- **Sold-count parse fail** (format Indonesia "rb"/"ribu" vs Latin numeric) — pakai parser dengan locale fallback; surface raw string kalau parse fail.

## Graduation status

**Phase 4-3 v0 (2026-05-10): DRAFT scaffolding.** Real graduation: founder runs Autobrowse capture pada 3-5 toko Shopee berbeda (different layouts: official store vs UMKM seller, different categories). See `tokopedia-product-page/SKILL.md` Graduation footer untuk full re-grade flow.
