# tokopedia-product-page — Hermes skill

Bundle: web-app-builder (Web Creator) — Phase 4-3 seed skill (DRAFT)
Tier: studio (DRAFT gate)
Handler: `hermes-skill:autobrowse-replay`

> **Status: DRAFT (Phase 4-3 scaffolding 2026-05-10).** Selectors are placeholders authored from Tokopedia's public DOM patterns at spec lock. Founder runs real Autobrowse capture sessions to refine before enabling for paying customers — flip `enabled_for_tiers: []` → `["pro", "studio"]` post-graduation. See "Graduation status" footer.

## Kapan dipakai

- "extract data produk tokopedia"
- "scrape detail produk Tokopedia"
- "tarik harga + seller dari URL Tokopedia"
- "lookup produk di Tokopedia"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `product_url` | string | ya | URL halaman produk Tokopedia (https://www.tokopedia.com/...) |

## Yang dilakukan

1. Buka `product_url` di browser engine.
2. Tunggu network-idle (Tokopedia adalah SPA; konten produk load setelah XHR awal).
3. Ekstrak field berikut dari DOM:
   - `product_title` — heading utama produk
   - `product_price` — harga ter-display (inc. discount kalau ada)
   - `seller_name` — toko/store yang jual
   - `seller_location` — kota toko (Jakarta, Surabaya, dll.)
   - `stock_count` — jumlah stok available (kalau ditampilkan; opsional)
   - `rating_avg` — rating bintang rata-rata (1-5 float)
   - `rating_count` — jumlah ulasan
4. Return JSON object dengan field di atas.

## Output

Persona-voice wrapper:

> "Detail produk dari Tokopedia:
>
> - **iPhone 14 Pro 256GB** — Rp 18.500.000 (diskon dari Rp 19.999.000)
> - Seller: TokoOfficial Store · Jakarta Pusat
> - Stok: 12 unit
> - Rating: 4.9 ★ (127 ulasan)
>
> Bisa aku monitor harga ini, atau lanjut ke kompetitor produk serupa?"

## Decline

- **Halaman bukan produk** (misalnya: search result, kategori, profile toko) — return error `not_a_product_page`.
- **Halaman butuh login** (jarang di Tokopedia, tapi terjadi untuk produk dewasa) — return `auth_required`.
- **Captcha trigger** (high-volume scraping) — return `captcha_blocked`. Customer pause + re-run.
- **Bulk extraction** (looping multiple URLs) — bukan scope; pakai paginated variant kalau Phase 4.5+ ship.

## Failure handling

- **Selector miss** — Tokopedia DOM berubah berkala. Skill flag `partial: true` dengan whichever fields berhasil diekstrak; founder re-graduate dari Autobrowse session baru.
- **Network timeout** — 1 retry dengan exponential backoff (3s, 6s); fail hard kalau retry kedua juga timeout.
- **Geo-blocked** — Tokopedia kadang serve non-ID payload. Pastikan VPS region jakarta atau cyc01.

## Graduation status

**Phase 4-3 v0 (2026-05-10): DRAFT scaffolding.** Selectors hand-authored dari pengamatan public DOM struktur Tokopedia. Belum verified deterministic via Autobrowse capture-replay loop.

Untuk graduate ke production:
1. Founder buka Tokopedia di Chromium via Autobrowse: `npm run -w @weuseai/autobrowse cli -- capture --skill-slug tokopedia-product-page --start-url https://www.tokopedia.com/`.
2. Click ke 5-10 produk berbeda; right-click setiap field yang harus di-extract; mark dengan label.
3. Run `npm run -w @weuseai/autobrowse cli -- synthesize --skill-slug tokopedia-product-page` untuk emit SkillSpec.
4. Run `npm run -w @weuseai/autobrowse cli -- iterate --skill-slug tokopedia-product-page` untuk verify replay deterministic.
5. Run `npm run -w @weuseai/autobrowse cli -- graduate --skill-slug tokopedia-product-page --target web-master --tier pro+` untuk overwrite ini SKILL.md dari real capture data.
6. Update `agent-packs/web-app-builder/manifest.json` skill entry: `enabled_for_tiers: []` → `["pro", "studio"]`.
7. Drift test akan auto-update; founder commit.
