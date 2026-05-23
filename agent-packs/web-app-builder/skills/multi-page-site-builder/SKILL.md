# multi-page-site-builder — Hermes skill

Bundle: web-app-builder (Web Creator)
Tier: pro+
Handler: `hermes-skill:multi-page-site-builder` (Hermes generates a 4-page site bundle locally on the customer's VPS)

## Kapan dipakai

Customer minta site dengan beberapa halaman, bukan satu halaman saja. Trigger phrases:

- "bikin website lengkap"
- "site multi-halaman"
- "home, about, services, contact"
- "website bisnis komplit"
- "multi-page website"

Juga: ketika customer menyebutkan section yang biasanya butuh halaman terpisah (case studies, team, blog, careers).

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `business_name` | string | ya | Nama brand atau bisnis |
| `bundle_kind` | enum: umkm-default \| professional-services | ya | umkm-default cocok buat warung / toko / service kecil; professional-services cocok buat consultant / accountant / lawyer / agency. Tanyakan kalau tidak jelas. |
| `services_offered` | array string | ya | 3-6 services / produk utama |
| `about_blurb` | string | tidak | Default placeholder yang aku susun dari context — customer edit kalau perlu |
| `contact_method` | enum: whatsapp \| email \| form | tidak | Default WhatsApp untuk umkm-default, form untuk professional-services |
| `contact_value` | string | ya kalau contact_method ditentukan | Nomor WA atau email |
| `include_case_studies` | bool | tidak | Default true untuk professional-services, false untuk umkm-default |

## Yang dilakukan

1. Apply defaults berdasarkan `bundle_kind`.
2. Resolve template dari `agent-pack/templates/multipage/<bundle_kind>/v1/`. Bundle berisi 4 file: `index.html`, `about.html`, `services.html`, `contact.html`. Plus shared `style.css` + `nav.html`.
3. Substitute placeholders di tiap file: `{business_name}`, services list, about blurb, contact details. Generate copy yang konsisten across pages (tone matched).
4. Tulis ke `/tmp/web-creator-out/site-<slug>-<timestamp>/`.
5. Tunjukkan ringkasan di Telegram (4 halaman + screenshot mini index) + tawarkan deploy via `vercel-deploy-orchestrator`.

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "Site lengkap kamu udah jadi: home, about, services, contact. Preview lokal di [link]. Cek dulu copy-nya — kalau ada section yang perlu di-tweak, kasih tahu. Kalau udah pas, aku deploy ke Vercel."

## Fetch template

Sebelum compose site bundle, panggil `bundle-fetch` dengan `agent_slug` `web-app-builder` dan filter `kind` ke `site-bundle`. Kalau template registry punya entry yang cocok dengan `bundle_kind` (mis. `multipage/umkm-default/v1` untuk warung / toko / service kecil), pakai itu sebagai starting frame. Untuk konsistensi tone lintas halaman, juga cek `copy/value-prop-canvas.md` dan `copy/positioning-statement.md` supaya pesan lock dulu sebelum 4 halaman dirakit. Kalau registry tidak punya match untuk bundle_kind yang diminta, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- Site yang butuh fitur kompleks di luar 4-page bundle (booking calendar, e-commerce checkout, login, CMS) → flag bahwa di-luar-scope skill ini, sarankan landing-page-builder + integrasi pihak ketiga atau tunggu Phase 4 expansion.
- Lebih dari 4 halaman → tanya prioritas. Multi-page-site-builder default 4-page; 5+ halaman butuh self-extension via extend-capabilities skill atau manual page-add post-deploy.

## Decline kalau missing context

Kalau "bikin website lengkap" tanpa services list — tanya: "Apa 3-5 services / produk utama yang mau ditampilkan?"
