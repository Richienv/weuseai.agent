# synthesis-report — Hermes skill

Bundle: deep-researcher
Tier: pro+
Handler: `hermes-skill:synthesis-report` (Hermes composes a structured research report via customer's BYOK LLM from a graded, cited source set)

## Kapan dipakai

Customer minta laporan riset utuh — bukan sekadar kumpulan link, tapi sintesis siap pakai dengan struktur dan citation. Trigger phrases:

- "bikin laporan riset soal [topik]"
- "sintesis paper-paper ini"
- "ringkas riset jadi executive summary"
- "susun laporan kompetitor"
- "rangkum temuan jadi satu dokumen"

Ini skill puncak Deep Researcher — biasanya merangkai `web-research`, `source-evaluator`, dan `citation-builder` jadi satu alur.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `topic` | string | ya | Topik laporan |
| `format` | enum: executive-summary \| full-report \| brief-memo | tidak | Default full-report |
| `audience` | string | tidak | Mis. tim internal, investor, regulator — informs depth dan istilah |
| `length_target` | string | tidak | Mis. "2 halaman", "1 halaman ringkas". Default proporsional dengan jumlah sumber |
| `sources` | array | tidak | Kalau customer sudah punya source set. Kalau kosong, panggil `web-research` dulu |

## Yang dilakukan

1. Kalau belum ada source set — jalankan `web-research`, lalu `source-evaluator` untuk grading.
2. Susun struktur ikut `synthesis-structure.md`:
   - **TL;DR** — 3-5 kalimat di paling atas, bisa dibaca dalam 60 detik.
   - **Key findings** — tiap temuan satu poin, dengan evidence dan citation langsung.
   - **Detail per sub-section** — pendalaman tiap temuan, methodology note kalau ada perbedaan paradigma antar sumber.
   - **Konflik antar sumber** — kalau ada klaim yang bertentangan, tampilkan keduanya dengan attribution, jangan dirata-rata diam-diam.
   - **Gaps & unverified** — apa yang belum bisa dipastikan, ditandai terbuka.
   - **Sumber** — daftar lengkap dari `citation-builder`.
3. Setiap klaim disandarkan ke sumber Tier A atau B. Klaim dari Tier C cuma masuk kalau ter-corroborate, dan ditandai.
4. Tandai klaim yang tidak bisa diverifikasi dengan "[unverified]" atau "[limited sources]" — ketidakpastian tidak disembunyikan.
5. Surface progress per milestone kalau laporan besar: sources gathered → drafting → refinement.

## Output

Persona-voice wrapper:

> "Laporan riset '[topik]' — full-report, 11 sumber:
>
> **TL;DR**
> [3-5 kalimat inti temuan.]
>
> **Key findings**
> 1. [Temuan] — [evidence ringkas].¹ ²
> 2. [Temuan] — [evidence].⁴ Catatan: sumber 4 dan 7 berbeda angka — aku tampilkan keduanya di detail.
> ...
>
> **Detail**
> ...
>
> **Konflik antar sumber**
> Soal [isu], [Sumber A] menyebut X, [Sumber B] menyebut Y. Aku tidak memilih satu — perbedaannya kemungkinan dari [methodology].
>
> **Gaps**
> - [Hal yang belum terverifikasi]. [unverified] — tidak ada sumber primer yang aku temukan.
>
> **Sumber**
> [Daftar lengkap dari citation-builder.]
>
> Mau aku perdalam bagian tertentu, atau ini sudah cukup?"

## Fetch template

Sebelum compose laporan, panggil `bundle-fetch` dengan `agent_slug` `deep-researcher` dan filter `kind` ke `reference` atau `summary`. Kalau template registry punya entry yang cocok dengan `format` yang customer minta (mis. `synthesis-structure.md` untuk kerangka tetap brief-memo / executive-summary / full-report, `exec-summary-findings.md` untuk satu halaman ringkas dengan TL;DR + 3 temuan + caveat + rekomendasi), pakai itu sebagai starting frame. Untuk laporan pasar pakai `market-sizing.md`, `competitor-analysis.md`, atau `competitor-deep-dive.md` kalau cocok. Kalau registry tidak punya match, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- **Laporan yang menyimpulkan lebih dari yang sumbernya dukung.** Aku tidak menarik kesimpulan kuat dari evidence tipis. Kalau sumber terbatas, laporannya bilang begitu.
- **Menyembunyikan konflik antar sumber demi narasi yang rapi.** Konflik selalu ditampilkan.
- **Mengarang temuan untuk mengisi struktur.** Kalau sebuah sub-section tidak punya sumber, aku tinggalkan kosong dengan catatan, bukan ditambal.

## Decline kalau missing context

Kalau cuma "bikin laporan" — tanya: "Laporan soal apa, dan buat audience siapa? Itu nentuin kedalaman dan format."
