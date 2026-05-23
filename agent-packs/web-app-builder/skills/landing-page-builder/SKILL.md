# landing-page-builder — Hermes skill

Bundle: web-app-builder (Web Creator)
Tier: pro+
Handler: `hermes-skill:landing-page-builder` (Hermes generates HTML locally on the customer's VPS using their BYOK LLM, fills the chosen template variant)

## Kapan dipakai

Customer minta bikin landing page satu halaman. Trigger phrases:

- "bikin landing page"
- "buatin website satu halaman"
- "landing page buat bisnis aku"
- "halaman jualan untuk produk X"
- "bikin one-pager"
- "I need a landing page for ..."

Juga: ketika customer cerita produk / bisnis / event yang butuh URL untuk dibagikan.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `business_name` | string | ya | Nama brand atau bisnis |
| `template_kind` | enum: saas \| agency \| course \| portfolio \| ecommerce \| umkm-warung \| wedding \| event \| freelance \| nonprofit \| realestate \| clinic \| sekolah \| coworking \| fashion-boutique \| fb-menu | ya | Tanyakan kalau tidak jelas |
| `value_prop` | string | ya | One-liner — apa yang ditawarkan + buat siapa |
| `cta_label` | string | tidak | Default sesuai template (Daftar / Pesan Sekarang / Hubungi Kami) |
| `contact_method` | enum: whatsapp \| email \| form \| phone | tidak | Default WhatsApp untuk UMKM, form untuk B2B |
| `contact_value` | string | tidak | Nomor WA atau email tergantung method |
| `tone` | enum: profesional \| casual \| premium | tidak | Default profesional |

Kalau customer cuma kasih nama bisnis tanpa value prop, tanya satu pertanyaan klarifikasi: "Apa one-liner yang menggambarkan bisnis kamu? (mis. 'Konsultasi pajak buat UMKM Jakarta')"

## Yang dilakukan

1. Apply defaults berdasarkan `template_kind`.
2. Pilih template dari `agent-pack/templates/landing/<template_kind>/v1.html`.
3. Substitute placeholders: `{business_name}`, `{value_prop}`, `{cta_label}`, `{contact_method}`, `{contact_value}`, plus 3-5 supporting copy blocks yang aku susun (about, features, social proof placeholder, FAQ).
4. Tulis hasil ke `/tmp/web-creator-out/landing-<slug>-<timestamp>.html`.
5. Tunjukkan preview ringkas di Telegram + tawarkan deploy ke Vercel via `vercel-deploy-orchestrator` skill.

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "Aku susun landing page-nya. Preview lokal di [link]. Bisa kamu cek dulu copy-nya. Kalau approve, aku deploy ke Vercel — kamu dapet URL preview hidup dalam 2-3 menit."

## Fetch template

Sebelum compose landing, panggil `bundle-fetch` dengan `agent_slug` `web-app-builder` dan filter `kind` ke `html` atau `landing`. Kalau template registry punya entry yang cocok dengan `template_kind` yang customer pilih (mis. `landing/saas/v1.html`, `landing/agency/v1.html`, `landing/course/v1.html`, `landing/portfolio/v1.html`, `landing/ecommerce/v1.html`, plus block-level `landing/hero-section.md` dan `landing/pricing-section.md` untuk swap section, `copy/value-prop-canvas.md` dan `copy/positioning-statement.md` untuk lock pesan sebelum copy hero), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk template_kind tertentu, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- Konten yang melanggar policy (gambling, scam, illegal content) → decline dengan alasan singkat.
- Page yang nge-claim kredensial yang customer ngga punya (mis. "sertifikasi BPOM" tanpa bukti) → tanya konfirmasi.

## Decline kalau missing context

Kalau cuma "bikin landing", tanpa template_kind atau business_name — jangan tebak. Tanya: "Untuk bisnis apa, dan template mana yang cocok? Aku punya 15 variant: SaaS, agency, UMKM, wedding, event, e-commerce, dll."
