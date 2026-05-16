# source-evaluator — Hermes skill

Bundle: deep-researcher
Tier: pro+
Handler: `hermes-skill:source-evaluator` (Hermes reasons over a source set via customer's BYOK LLM; grades each source on credibility dimensions)

## Kapan dipakai

Customer punya kumpulan sumber dan butuh penilaian kualitas — mana yang bisa disandari, mana yang harus hati-hati. Trigger phrases:

- "sumber ini kredibel ngga"
- "rank sumber-sumber ini"
- "evaluasi kualitas sumber"
- "mana yang paling bisa dipercaya"

Juga: dipanggil otomatis oleh `web-research` setelah source set terkumpul, sebelum sintesis.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `sources` | array | ya | Daftar sumber — URL, judul, atau hasil dari `web-research` |
| `claim_context` | string | tidak | Klaim yang sumbernya mau dipakai untuk dukung — informs relevance grading |

## Yang dilakukan

Grade tiap sumber pakai rubrik di `source-credibility-rubric.md`. Lima dimensi:

1. **Authority** — siapa penulis / lembaga, apa track record-nya.
2. **Recency** — kapan dipublikasi, masih relevan untuk topik atau sudah usang.
3. **Primary vs secondary** — sumber primer (data asli, paper, laporan resmi) atau secondary (rangkuman, reporting tentang sumber lain).
4. **Bias signal** — ada conflict of interest, agenda komersial, atau political slant yang patut diungkap.
5. **Corroboration** — klaim utama didukung sumber independen lain atau berdiri sendiri.

Tiap sumber dapat tier akhir: **A** (primer, otoritatif, ter-corroborate), **B** (kredibel dengan catatan), **C** (pakai hati-hati, butuh corroboration), **D** (tidak disarankan disandari).

## Output

Persona-voice wrapper:

> "Evaluasi 12 sumber:
>
> Tier A (4) — bisa disandari langsung:
> - [Judul], [Lembaga], 2025 — paper peer-reviewed, ter-corroborate 2 sumber lain
> - ...
>
> Tier B (5) — kredibel, tapi catat:
> - [Judul], [Media], 2024 — reporting solid, tapi single-source untuk angka kunci
> - ...
>
> Tier C (2) — pakai hati-hati:
> - [Judul] — blog industri, ada kepentingan komersial. Aku pakai cuma kalau ter-corroborate.
>
> Tier D (1) — aku sarankan drop: [Judul] — anonim, tanggal tidak jelas, klaim tidak bisa diverifikasi.
>
> Untuk sintesis, aku sandarkan klaim utama ke Tier A dan B. Setuju?"

## Decline criteria

- **Memberi nilai mutlak "benar / salah" pada isi sumber.** Aku menilai kredibilitas dan kecocokan, bukan memvonis kebenaran faktual sebuah klaim.
- **Sumber yang tidak bisa aku akses sama sekali.** Aku tidak grade dari judul saja — aku tandai "[tidak bisa dievaluasi, perlu akses]".

## Decline kalau missing context

Kalau cuma "evaluasi" tanpa daftar sumber — tanya: "Sumber mana yang mau dievaluasi? Kirim URL atau judulnya."
