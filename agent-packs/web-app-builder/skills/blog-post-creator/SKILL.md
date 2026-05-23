# blog-post-creator — Hermes skill

Bundle: web-app-builder (Web Creator)
Tier: pro+
Handler: `hermes-skill:blog-post-creator` (Hermes generates the post locally on the customer's VPS using their BYOK LLM)

## Kapan dipakai

Customer minta tulis artikel blog SEO-optimized. Trigger phrases:

- "tulis blog post"
- "artikel SEO buat ..."
- "konten blog"
- "tulis post tentang X"
- "long-form article"
- "I need a blog post about ..."

Juga: ketika customer cerita topik yang relevan dengan bisnisnya dan butuh content marketing — aku tawarkan skill ini sebagai opsi.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `topic` | string | ya | Topik utama post |
| `format` | enum: long-form-article \| listicle \| case-study \| how-to \| comparison | ya | Default long-form-article kalau tidak jelas |
| `target_audience` | string | tidak | Default "umum-bisnis Indonesia" — better kalau customer kasih spesifik (mis. "pemilik UMKM Jakarta") |
| `primary_keyword` | string | tidak | Aku riset sendiri kalau kosong, pakai search-intent Indonesia |
| `word_count` | int | tidak | Default per format: long-form 1500-2000, listicle 1200-1500, case-study 1000-1500, how-to 1500-2000, comparison 1500-2000 |
| `cta` | string | tidak | Default soft CTA (subscribe / hubungi). Bisa diganti hard CTA (beli, daftar) |
| `include_faq` | bool | tidak | Default true untuk long-form + how-to (improves SEO snippet rate) |

## Yang dilakukan

1. Apply defaults.
2. Riset keyword (3-5 related terms) menggunakan search-intent heuristic Indonesia. Catat dalam frontmatter post.
3. Susun heading hierarchy: H1 (judul), H2 (3-5 sections), H3 (subsections kalau perlu).
4. Tulis intro hook (50-80 kata) yang surface masalah / curiosity.
5. Body sections sesuai format yang dipilih:
   - **long-form-article:** introduction → 3-5 angles → conclusion
   - **listicle:** intro context → 5/7/10 items dengan example + actionable takeaway → summary
   - **case-study:** situation → action → result → lesson
   - **how-to:** outcome statement → prerequisites → step-by-step → troubleshooting → summary
   - **comparison:** criteria framework → side-by-side analysis → recommendation by use case
6. Tulis FAQ section (3-5 questions) kalau `include_faq=true`.
7. Tulis CTA penutup yang action-oriented.
8. Output markdown ke `/tmp/web-creator-out/blog-<slug>-<timestamp>.md` dengan frontmatter:
   - `title`, `slug`, `date`, `keywords`, `meta_description` (155 chars), `format`, `target_audience`.

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "Aku tulis post-nya: [title]. Word count: ~X. Keyword utama: Y. FAQ: Z items. Markdown ada di [path] — cek dulu. Kalau cocok, aku tambahkan ke blog di Vercel deployment kamu."

## Fetch template

Sebelum tulis post, panggil `bundle-fetch` dengan `agent_slug` `web-app-builder` dan filter `kind` ke `markdown` (blog). Kalau template registry punya entry yang cocok dengan `format` yang customer pilih (mis. `blog/long-form-article/v1.md` untuk artikel 1500-2500 kata, `blog/listicle/v1.md` untuk listicle 5/7/10 items, `blog/how-to/v1.md` untuk tutorial step-by-step), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk format yang diminta (mis. case-study atau comparison), log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- Topik yang melanggar disinformation / medical-without-credential / financial-advice-tanpa-disclaimer → decline atau tambah disclaimer wajib.
- Plagiarism request ("tulis ulang artikel ini agar tidak ketahuan") → decline. Aku tulis original content, bukan rewrite-to-evade-detection.
- Tone yang tidak sesuai brand voice CLAUDE.md (banned words, exclamation overload, hype-y) → flag dan tawarkan calmer tone.

## Decline kalau missing context

Kalau cuma "tulis blog" — tanya: "Tentang topik apa, dan target audience-nya siapa?"
