# Template — Internal Review Deck (Quarterly)

Audience: leadership team atau cross-functional internal review. Use case: review kuartal — apa yang dijanjikan vs apa yang dideliver, plan kuartal depan, risiko, dan keputusan yang butuh diambil. Scope: deck 10 slide operasional, tone honest dan keputusan-fokus.

## Variables

- `{{team_name}}` — tim atau divisi yang review
- `{{quarter_just_ended}}` — kuartal yang baru selesai (contoh: "Q1 2026")
- `{{quarter_upcoming}}` — kuartal berikutnya
- `{{presenter_name}}` — pemimpin review
- `{{q_targets}}` — list target kuartal lalu (3-5 item)
- `{{q_results}}` — hasil aktual per target (hit / miss / partial + angka)
- `{{wins_to_celebrate}}` — 2-3 hal yang patut diakui
- `{{misses_to_own}}` — 1-2 hal yang miss + root cause
- `{{next_q_priorities}}` — 3 prioritas kuartal depan
- `{{risks_watch}}` — 2-3 risiko yang perlu diawasi
- `{{decisions_needed}}` — keputusan yang butuh diambil di review ini
- `{{resource_asks}}` — kalau ada ask budget/headcount

## Template

```
---
template: pitch-deck-internal-review
audience: leadership-internal
duration_minutes: 30
slide_count: 10
language: id
---

# Slide 1 — Cover
**Title:** {{team_name}} — Review {{quarter_just_ended}}
**Visual:** Nama tim + kuartal + tanggal + presenter
**Speaker note:** Pembukaan operasional, bukan ceremonial. "Kita lihat target vs hasil, lalu plan {{quarter_upcoming}}, lalu keputusan yang butuh kita ambil hari ini." ~30 detik.

# Slide 2 — Scorecard {{quarter_just_ended}}
**Title:** Target vs Hasil
**Visual:** Tabel: kolom target, kolom target value, kolom actual, kolom delta, kolom status (hit/miss/partial dengan color code)
**Speaker note:** Lead dengan scorecard. Jangan sembunyikan miss. Audience leadership respect kejujuran lebih dari spin. ~90 detik.

# Slide 3 — Wins yang Patut Diakui
**Title:** Wins Kuartal Ini
**Visual:** 2-3 wins {{wins_to_celebrate}} dengan satu metrik atau outcome per win
**Speaker note:** Sebut nama orang atau tim yang deliver. Recognition yang spesifik lebih berarti dari "good job team." ~75 detik.

# Slide 4 — Misses yang Kami Own
**Title:** Yang Tidak Sesuai Rencana
**Visual:** Per miss: target — actual — root cause singkat — apa yang diubah
**Speaker note:** Sebut root cause asli, bukan blame. "Kami mis-estimasi X karena Y. Yang akan kami ubah: Z." Format ini built trust. ~90 detik.

# Slide 5 — Apa yang Kami Pelajari
**Title:** Pembelajaran
**Visual:** 3 insight, masing-masing satu kalimat
**Speaker note:** Insight operasional, bukan motivasi. "Sales cycle kita lebih panjang 30% dari asumsi awal — implikasinya pipeline kita underweight 1 kuartal." ~75 detik.

# Slide 6 — Prioritas {{quarter_upcoming}}
**Title:** Prioritas Kuartal Depan
**Visual:** 3 prioritas {{next_q_priorities}} terurut by impact, dengan owner per prioritas
**Speaker note:** Tiga, bukan tujuh. Kalau lebih dari tiga, itu bukan prioritas, itu daftar tugas. Sebut owner eksplisit. ~75 detik.

# Slide 7 — Target Numerik {{quarter_upcoming}}
**Title:** Yang Akan Kami Hit
**Visual:** Tabel target numerik dengan baseline dari {{quarter_just_ended}} + target {{quarter_upcoming}} + asumsi kunci
**Speaker note:** Sebut target dalam angka. Sertakan asumsi yang mendukung target — bukan untuk excuse nanti, untuk supaya audience bisa challenge sekarang. ~60 detik.

# Slide 8 — Risiko yang Perlu Diawasi
**Title:** Risiko
**Visual:** Per risk {{risks_watch}}: probability, impact, mitigation, early warning signal
**Speaker note:** Surface dari sekarang. "Kalau X terjadi, kami sudah punya playbook Y." Risiko yang sudah dipikirkan dampak lebih kecil dari yang dimunculkan kuartal berikut. ~75 detik.

# Slide 9 — Keputusan yang Dibutuhkan Hari Ini
**Title:** Decisions Needed
**Visual:** Per decision {{decisions_needed}}: konteks, opsi A vs B, rekomendasi, deadline
**Speaker note:** Eksplisit. "Kami butuh keputusan dari kamu hari ini soal X — opsi A vs B, rekomendasi kami A karena Z." Tanpa keputusan, plan {{quarter_upcoming}} stuck. ~120 detik.

# Slide 10 — Ask & Diskusi
**Title:** Ask + Diskusi
**Visual:** Resource ask {{resource_asks}} kalau ada + waktu buka untuk diskusi
**Speaker note:** Ringkas ask budget/headcount kalau ada. Lalu buka diskusi. Punya backup data untuk pertanyaan yang umum (per-team breakdown, cohort detail). ~90 detik diskusi, lebih kalau dibutuhkan.
```

## Tone guide

- Operasional-presisi. Setiap klaim diikat ke metrik. Tidak ada ruang untuk vague language.
- Honest soal miss. Internal review yang sembunyikan miss merusak trust untuk kuartal berikutnya.
- Decision-fokus. Slide 9 adalah inti — kalau tidak ada keputusan yang diambil, review ini gagal.
- Bahasa Indonesia primer; English untuk istilah operasional (scorecard, root cause, RAG, cohort).
- Tone serius tapi tidak defensive. "Kami miss, ini root cause, ini yang kami ubah" lebih kuat dari pembelaan.
- Tidak ada exclamation marks. Tidak ada hype-speak. Audience internal sudah tahu konteks — sampaikan datanya, mereka yang interpret.
