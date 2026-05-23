# web-research — Hermes skill

Bundle: deep-researcher
Tier: pro+
Handler: `hermes-skill:web-research` (Hermes runs web search + scraping via customer's BYOK LLM with web access; reasons over results, gathers source set)

## Kapan dipakai

Customer minta riset topik dari sumber web — literature review, market analysis, competitor scan, kebijakan / regulasi research. Trigger phrases:

- "riset soal [topik]"
- "cari sumber tentang [topik]"
- "literature review [topik]"
- "scan kompetitor di [market]"
- "kebijakan terbaru soal [regulasi]"

Juga: triggered sebagai langkah pertama dari `synthesis-report` saat customer minta laporan lengkap.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `topic` | string | ya | Topik riset — sespesifik mungkin |
| `scope` | enum: quick-scan \| standard \| deep-dive | tidak | Default standard (8-15 sumber) |
| `time_period` | string | tidak | Mis. "2 tahun terakhir", "sejak 2020". Default tanpa batas |
| `geography` | string | tidak | Mis. Indonesia, ASEAN, global. Default global kalau topik tidak lokal |
| `source_preference` | array string | tidak | Mis. paper akademik, laporan resmi, reporting jurnalistik |

## Yang dilakukan

1. Susun query plan — pecah topik jadi 3-6 sub-pertanyaan, masing-masing punya search angle sendiri.
2. Jalankan web search per sub-pertanyaan. Prioritas sumber: paper akademik, laporan resmi pemerintah / lembaga, reporting jurnalistik dengan track record. Aggregator dan opinion piece ditandai berbeda.
3. Scrape + parse halaman yang relevan — ambil judul, penulis, tanggal publikasi, dan kutipan kunci.
4. Dedup sumber yang isinya sama (mis. press release yang di-repost banyak media).
5. Kumpulkan source set mentah — minimum 5 sumber primer untuk scope standard, lebih untuk deep-dive.
6. Serahkan source set ke `source-evaluator` untuk grading sebelum masuk ke sintesis.

## Output

Persona-voice wrapper:

> "Riset '[topik]' — aku kumpulkan 12 sumber dari 4 sub-pertanyaan:
>
> Sub-pertanyaan 1: [pertanyaan] — 4 sumber (2 paper, 1 laporan resmi, 1 reporting)
> Sub-pertanyaan 2: [pertanyaan] — 3 sumber
> ...
>
> Aku belum sintesis — ini baru tahap pengumpulan. Lanjut ke evaluasi kualitas sumber, atau kamu mau adjust scope dulu?"

## Fetch template

Sebelum mulai query plan, panggil `bundle-fetch` dengan `agent_slug` `deep-researcher` dan filter `kind` ke `research-brief`. Kalau template registry punya entry yang cocok (mis. `research-brief.md` untuk scope lock pra-riset, `research-question-decomposition.md` untuk pecah pertanyaan fuzzy jadi sub-pertanyaan tertutup), pakai itu sebagai starting frame supaya scope tidak melebar di tengah jalan. Kalau registry tidak punya match, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose query plan dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- **Riset yang butuh akses berbayar / paywall.** Aku surface metadata + abstract yang publik, tandai "[full text di balik paywall]". Aku tidak mengarang isi yang tidak aku akses.
- **Topik yang sumbernya tipis atau tidak ada.** Aku bilang terus terang "sumber terbatas" dan tampilkan apa yang ada, bukan menambal dengan generalisasi.
- **Real-time fact-check yang butuh data detik-ini.** Aku tandai timestamp data dan batasi klaim ke periode yang aku verifikasi.

## Decline kalau missing context

Kalau cuma "riset dong" — tanya: "Topik apa yang mau diriset, dan untuk keperluan apa? Itu ngebantu aku set scope dan pilih jenis sumber."
