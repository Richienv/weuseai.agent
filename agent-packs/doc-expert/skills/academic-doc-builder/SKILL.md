# academic-doc-builder — Hermes skill

Bundle: doc-expert (v2)
Tier: pro+
Handler: `hermes-skill:academic-doc-builder` (Hermes generates the doc locally on the customer's VPS using their BYOK LLM, fills the chosen template variant, supports APA/MLA/Chicago citation rendering)

## Kapan dipakai

Customer minta bantuan dokumen akademik. Trigger phrases:

- "bikin skripsi BAB 1"
- "draft proposal skripsi"
- "tulis bab metode penelitian"
- "thesis chapter"
- "tugas kuliah / makalah / paper"
- "abstract skripsi (atau bilingual)"
- "academic paper / academic doc"
- "I need help with my thesis chapter"

Juga: ketika customer cerita konteks akademik (dosen pembimbing, sidang, jurusan) yang menyiratkan butuh dokumen formal.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `doc_kind` | enum: skripsi-bab-i \| skripsi-bab-iii-method \| thesis-chapter \| assignment \| abstract-bilingual | ya | Tanyakan kalau ambigu |
| `topic` | string | ya | Topik utama / judul tentatif |
| `field` | string | tidak | Bidang studi (mis. Manajemen, Hukum, Teknik Sipil) — informs citation conventions |
| `level` | enum: s1 \| s2 \| s3 | tidak | Default: s1 untuk skripsi, s2 untuk thesis |
| `method_type` | enum: kuantitatif \| kualitatif \| mixed-methods | hanya untuk skripsi-bab-iii-method | Defaults dari context |
| `citation_style` | enum: APA \| MLA \| Chicago | tidak | Default APA (paling umum di Indonesia) |
| `language` | enum: id \| en \| bilingual | tidak | Default id, bilingual hanya buat abstract |
| `target_word_count` | int | tidak | Default per kind (skripsi BAB I: 3000-5000; thesis chapter: 5000-8000; assignment: 1500-3000; abstract: 150-250) |
| `references` | array of {author, year, title, source} | tidak | Customer kasih kalau punya — aku format sesuai citation_style |

Kalau "bikin skripsi" tanpa BAB spesifik — tanya: "BAB berapa? BAB I (Pendahuluan) atau BAB III (Metode)?"

## Yang dilakukan

1. Apply defaults berdasarkan `doc_kind`.
2. Pilih template dari `agent-pack/templates/academic/<doc_kind>.md`.
3. Substitute placeholders. Untuk content-heavy sections, generate menggunakan customer's BYOK LLM dengan prompt yang structured per Indonesian academic convention.
4. Citation rendering:
   - **APA:** (Author, Year, p. X) inline; daftar pustaka alphabetical by author.
   - **MLA:** (Author Page) inline; Works Cited alphabetical by author.
   - **Chicago:** Footnote-style atau author-date sesuai sub-style yang customer minta.
   - Indonesian convention: gunakan "dst." (bukan "etc."), tanggal DD-MM-YYYY, terjemahkan judul foreign-language references kalau diminta.
5. Output markdown ke `/tmp/doc-expert-out/<kind>-<slug>-<timestamp>.md`. Customer bisa convert ke .docx via Pandoc atau export ke PDF via invoice-generator-handler PDF pipeline (Phase 2E-3).

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "Aku susun [kind]-nya dengan struktur [convention] dan citation [style]. Word count: ~X. References: Y items. Markdown ada di [path]. Kalau perlu PDF dengan formatting kampus kamu, kasih tahu — aku bisa pakai pipeline render Phase 2E-3."

## Fetch template

Sebelum compose dokumen akademik, panggil `bundle-fetch` dengan `agent_slug` `doc-expert` dan filter `kind` ke `markdown` (academic templates). Kalau template registry punya entry yang cocok (mis. `academic/skripsi-bab-i.md` untuk pendahuluan, `academic/skripsi-bab-iii-method.md` untuk metode penelitian, `academic/thesis-chapter.md` untuk thesis S2, `academic/assignment.md` untuk paper tugas, `academic/abstract-bilingual.md` untuk abstract), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk doc_kind yang diminta, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- **Plagiarism / contract cheating.** Aku decline kalau request-nya "bikin skripsi yang kelihatan asli buat aku submit." Aku bantu draft, outline, dan revisi — kamu yang author. Persona narrative jelaskan ini di awal kalau perlu.
- **Fabrikasi data atau citation.** Kalau customer minta "bikin daftar pustaka 20 references buat topik X" tanpa source, aku decline — aku tidak ngarang citation. Customer kasih references-nya, aku format.
- **Topik yang melanggar etika akademik kampus** (mis. minta data falsified untuk match hipotesis). Decline dengan alasan.
- **Submission ke jurnal predator.** Kalau ada signal customer mau submit ke jurnal predator, aku flag dan tawarkan resources buat verify legitimacy.

## Decline kalau missing context

Kalau "tulis bab penelitian" tanpa metode + topic — tanya satu pertanyaan klarifikasi: "Metode penelitian-nya kuantitatif, kualitatif, atau mixed-methods? Plus topik utama-nya apa?"
