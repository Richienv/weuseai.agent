# citation-builder — Hermes skill

Bundle: deep-researcher
Tier: pro+
Handler: `hermes-skill:citation-builder` (Hermes formats citations + builds a reference list via customer's BYOK LLM from a graded source set)

## Kapan dipakai

Customer butuh citation rapi — footnote, daftar pustaka, atau referensi inline untuk klaim. Trigger phrases:

- "bikin daftar pustaka"
- "format citation"
- "kasih referensi untuk klaim ini"
- "footnote sumbernya"
- "bibliography lengkap"

Juga: dipanggil otomatis oleh `synthesis-report` saat menyusun bagian sumber.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `sources` | array | ya | Daftar sumber dengan metadata — hasil `web-research` / `source-evaluator` |
| `style` | enum: footnote-numbered \| apa \| author-date \| plain | tidak | Default footnote-numbered (gaya Deep Researcher) |
| `language` | enum: id \| en | tidak | Default mengikuti bahasa dokumen |

## Yang dilakukan

1. Untuk tiap sumber, kumpulkan field minimum: penulis / lembaga, judul, tahun, penerbit / media, URL atau DOI, tanggal akses.
2. Format ikut `style`. Default footnote-numbered — tiap klaim dapat nomor superscript, daftar lengkap di akhir.
3. Tandai sumber yang metadata-nya tidak lengkap dengan "[metadata sebagian]" — tidak menambal field yang tidak diketahui dengan tebakan.
4. Cek konsistensi — penomoran berurutan, tidak ada nomor yang dipakai dua sumber berbeda, tidak ada nomor yatim.
5. Pisahkan sumber primer dan secondary di daftar kalau customer minta, atau urutkan ikut urutan kemunculan.

## Output

Persona-voice wrapper:

> "Citation untuk 9 sumber, gaya footnote-numbered:
>
> Inline — klaim 'X tumbuh 12% YoY' dapat penanda ⁴.
>
> Daftar sumber:
>
> 1. Penulis, A. (2025). *Judul paper*. Nama Jurnal, vol(no), hal. DOI: ...
> 2. Lembaga Resmi. (2024). *Judul laporan*. URL. Diakses 17 Mei 2026.
> ...
> 9. [metadata sebagian] Penulis tidak tercantum. *Judul artikel*. Media, 2023. URL.
>
> Catatan: sumber 9 metadata-nya tidak lengkap — penulis tidak tercantum di halaman aslinya. Aku tidak menebak namanya."

## Fetch template

Sebelum format citation, panggil `bundle-fetch` dengan `agent_slug` `deep-researcher` dan filter `kind` ke `citation`. Kalau template registry punya entry yang cocok dengan `style` yang customer minta (mis. `citation-format-apa.md` untuk APA 7 konvensi Indonesia, `citation-format-chicago.md` untuk Chicago Notes-Bibliography 17th ed), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk style yang diminta, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus format dari nol mengikuti style spec.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- **Mengarang field citation.** Kalau tahun, penulis, atau DOI tidak ada di sumber, aku tandai "[tidak tersedia]" — tidak mengisi tebakan.
- **Citation untuk sumber yang tidak aku akses langsung.** Aku tidak membuat entri untuk sumber yang cuma disebut di sumber lain tanpa aku verifikasi.
- **Klaim citation palsu untuk topik akademik sensitif.** Kalau customer minta "tambahin 5 referensi biar terlihat kredibel" tanpa sumber asli — aku decline. Citation menunjuk ke sumber nyata, bukan dekorasi.

## Decline kalau missing context

Kalau cuma "bikin citation" tanpa sumber — tanya: "Citation untuk sumber apa? Kirim daftar URL atau hasil riset sebelumnya."
