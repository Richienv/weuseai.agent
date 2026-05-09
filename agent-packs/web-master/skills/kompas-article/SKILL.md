# kompas-article — Hermes skill

Bundle: web-master (Web Creator) — Phase 4-3 seed skill (DRAFT)
Tier: studio (DRAFT gate)
Handler: `hermes-skill:autobrowse-replay`

> **Status: DRAFT (Phase 4-3 scaffolding 2026-05-10).** Selectors are placeholders authored from Kompas.com's public DOM patterns at spec lock. Founder runs real Autobrowse capture sessions to refine. See "Graduation status" footer.

## Kapan dipakai

- "ringkas artikel Kompas"
- "ekstrak konten dari URL Kompas"
- "tarik headline + body Kompas"
- "lookup berita di Kompas"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `article_url` | string | ya | URL artikel Kompas (https://www.kompas.com/...) — domain harus `*.kompas.com` |
| `include_body` | boolean | tidak | Default true. Set false untuk metadata-only fetch (lebih cepat). |

## Yang dilakukan

1. Buka `article_url` di browser engine.
2. Tunggu DOM ready (Kompas server-rendered + lazy-load images).
3. Ekstrak field berikut:
   - `headline` — heading utama artikel
   - `byline` — penulis (kompas reporter atau guest contributor)
   - `published_at` — ISO 8601 dari `<time datetime="...">` atau parse dari display string
   - `category` — kategori artikel (Otomotif, Bisnis, Teknologi, Tren, dll.)
   - `tags` — array tag/topic chips di bagian akhir artikel
   - `body_paragraphs` — array string per-paragraph (kalau `include_body: true`)
   - `lead` — paragraph pertama (selalu di-extract bahkan dengan include_body=false)
   - `image_urls` — array of inline image URLs di artikel (max 10)
4. Strip ads + share-buttons + "Baca juga" links dari body.
5. Return JSON object.

## Output

Persona-voice wrapper:

> "Artikel Kompas:
>
> **[Headline persis]** · oleh [Reporter Name] · 12 Mei 2026, 14:30 WIB
> Kategori: Bisnis · Tags: ekonomi, IHSG, BI rate
>
> **Lead:** [first paragraph in 1-2 sentences]
>
> [Body content paragraphed, ~200-500 words. Aku tampilkan sampai 3 paragraph pertama; sisanya bisa kamu request kalau perlu.]
>
> Mau aku ringkas ke 3 bullet points, atau extract claim utama untuk dicross-check?"

## Decline

- **Domain bukan kompas.com** (mixed up dengan kompas.tv, kompasiana.com — those have different layouts) — return `unsupported_domain`. Phase 4.5+ dapat tambah variants.
- **Article paywalled** (Kompas Premium) — return `paywall_blocked`.
- **404 / dihapus** — return `article_not_found`.

## Failure handling

- **Body extraction noisy** (Kompas sering inject related-articles + ads di tengah body) — pakai content-density heuristic: skip nodes dengan high link-to-text ratio.
- **published_at parse fail** — fall back to relative-string ("kemarin") + current_date offset.
- **Image URLs stale** (Kompas pakai CDN dengan versioning) — capture-time URL dianggap canonical; staleness handled by customer's downstream consumer.

## Graduation status

**Phase 4-3 v0 (2026-05-10): DRAFT scaffolding.** Real graduation: founder runs Autobrowse pada 5-10 artikel Kompas berbeda kategori (Bisnis, Tren, Otomotif, Lifestyle) untuk capture variant layouts. Kompas struktur termasuk yang paling stabil di Indonesian news space; expect minimal selector drift over time.
