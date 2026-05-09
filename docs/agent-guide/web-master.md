# Web Master

Bikin website komplit (landing, multi-page, blog), deploy ke Vercel, sarankan domain Indonesia (Niagahoster, IDwebhost, Hostinger), dan extract data dari 6 situs Indonesia populer (Tokopedia, Shopee, Glints, Kompas, OLX, Lamudi).

**Tier:** Pro, Studio.

---

## Apa yang kamu dapat

- **Landing page builder** — single-page dari 5 template (SaaS, agency, course, portfolio, e-commerce). Output preview URL siap deploy.
- **Multi-page site builder** — home / about / services / contact dengan navigation + typography konsisten. Cocok untuk UMKM yang butuh online presence tanpa designer.
- **Blog builder** — Markdown-driven blog dengan kategori, tag, RSS feed. Phase 2 wire ke headless CMS.
- **Domain advisor** — saran provider Indonesia (Niagahoster, IDwebhost, Hostinger) dengan harga + fitur breakdown. Saran TLD (`.id` vs `.co.id` vs `.com`).
- **Indonesia data extractor** — Phase 4-3 seed skills untuk Tokopedia, Shopee, Glints, Kompas, OLX, Lamudi. Status DRAFT (founder graduate via Autobrowse capture).

---

## Sample tasks

- "Bikin landing page untuk jasa konsultasi pajak aku, target UKM" — output preview URL + edit-tip.
- "Susun multi-page site UMKM dapur kue rumahan: home + menu + order + kontak" — output 4 halaman dengan style konsisten.
- "Domain `tokodapur.id` available? Saran provider mana?" — check availability + breakdown harga 3 provider Indonesia.
- "Extract data product page Tokopedia ini [paste URL]: title, harga, stok, rating" — output JSON structured (Phase 4-3 DRAFT, butuh graduation).

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `landing-page-builder` | Pro+ | Single-page dari 5 template, deploy Vercel |
| `multi-page-site-builder` | Pro+ | Home/about/services/contact UMKM-default |
| `blog-builder` | Pro+ | Markdown blog + RSS |
| `domain-advisor` | Pro+ | Niagahoster / IDwebhost / Hostinger comparison |
| `tokopedia-product-page` | Studio (DRAFT) | Extract product detail dari URL |
| `shopee-storefront` | Studio (DRAFT) | Extract toko + product list |
| `glints-job-post` | Studio (DRAFT) | Extract job listing |
| `kompas-article` | Studio (DRAFT) | Extract article body + metadata |
| `olx-listing` | Studio (DRAFT) | Extract listing detail |
| `lamudi-rental` | Studio (DRAFT) | Extract rental property listing |

---

## DRAFT seed skills (Phase 4-3)

6 skill extractor untuk situs Indonesia popular ditandai DRAFT. Skill ada di manifest dan `Tier: studio (DRAFT gate)`, tapi handler real-nya butuh **Autobrowse capture session** dari founder kita untuk graduate ke production.

Status: scaffolding ready (manifest + SKILL.md + drift tests). Live capture session dilakuin per minggu — kalau kamu butuh skill spesifik graduated lebih cepat, kontak support.

Kalau kamu Studio + butuh extractor non-listed (mis. Bukalapak, Carousell), [The Pro](./the-pro.md) `extend-capabilities` bisa generate one-off extractor — tidak via Autobrowse harness, jadi kualitas variable per situs.

---

## Deploy flow

1. Web Master generate site → preview URL di domain `*.weuseai-preview.app` atau `*.vercel.app`.
2. Kamu review preview, request adjustment kalau perlu.
3. Approve → site deploy ke production di domain yang kamu beli (provider Indonesia atau Vercel).

Phase 1 deploy via Vercel kita. Phase 2 ada handover script kalau kamu mau migrate ke Vercel akun kamu sendiri (untuk full ownership).

---

## Limitasi

- **Bukan custom design** — template-driven. Branding adjust via color + typography + content, bukan layout dari nol. Kalau butuh full custom, hire designer + dev.
- **Phase 1 tidak ada CMS** — content edit via re-trigger build, bukan dashboard CMS realtime. Phase 2 wire ke Sanity / Strapi.
- **Domain advisor adalah saran, bukan auto-purchase** — kamu yang beli + bind DNS sendiri.
- **Phase 4-3 DRAFT skills:** extractor butuh founder graduation. Sementara, fall-back ke `extend-capabilities` (kualitas variable).

---

## Kapan switch ke persona lain

- Kalau kamu butuh **content untuk halaman website (artikel blog, copy)** → [Doc Expert](./doc-expert.md) atau [Social Conductor](./social-conductor.md).
- Kalau kamu butuh **video embed** → [Video Producer](./video-producer.md).
- Kalau kamu butuh **incorporate bisnis dulu sebelum punya website** → [Business Director](./business-director.md).
