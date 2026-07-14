# Template — Status report

Dipakai untuk laporan status project mingguan ke sponsor atau stakeholder eksekutif. Audiens: orang yang mendanai atau mengawasi project tapi tidak ikut eksekusi harian — mereka butuh tahu apakah project masih on track tanpa harus baca panjang. Satu halaman, scannable dalam 60 detik.

## Variables

- `{{project_name}}` — string, nama project
- `{{report_period}}` — string, periode laporan (mis. "Minggu W21 — 18-24 Mei 2026")
- `{{report_author}}` — string, nama pengirim laporan
- `{{recipients}}` — string, daftar penerima (mis. "Renita, Pak Budi (sponsor)")
- `{{overall_status}}` — string, satu kata RAG — `Hijau`, `Kuning`, atau `Merah`. Hijau = on track, Kuning = ada risiko yang sedang dikelola, Merah = butuh intervensi
- `{{status_rationale}}` — string, satu kalimat yang menjelaskan kenapa status RAG itu yang dipilih
- `{{highlights}}` — markdown bullet list, 2-4 highlight paling penting minggu ini — yang sponsor wajib tahu. Bukan daftar lengkap, tapi yang paling load-bearing
- `{{completed_this_week}}` — markdown bullet list, milestone atau deliverable yang ditutup minggu ini
- `{{in_progress}}` — markdown bullet list, hal yang sedang berjalan plus ETA realistis. Format per item: "[Item] — ETA [tanggal] (owner: [nama])"
- `{{blocked}}` — markdown bullet list, hal yang sedang macet plus blocker spesifik. Kalau tidak ada, tulis "Tidak ada blocker minggu ini."
- `{{decisions_needed}}` — markdown bullet list, keputusan yang sponsor atau stakeholder butuh ambil supaya project tidak macet. Format per item: "[Keputusan] — dibutuhkan paling lambat [tanggal] dari [nama]". Kalau tidak ada, tulis "Tidak ada keputusan eksternal yang dibutuhkan minggu ini."
- `{{next_week_focus}}` — string, 1-2 kalimat tentang prioritas minggu depan

## Template

# Status report — {{project_name}}

**Periode:** {{report_period}}
**Dari:** {{report_author}} · **Untuk:** {{recipients}}

## Status keseluruhan: {{overall_status}}

{{status_rationale}}

## Highlight

{{highlights}}

## Selesai minggu ini

{{completed_this_week}}

## Sedang berjalan

{{in_progress}}

## Blocker

{{blocked}}

## Keputusan yang dibutuhkan

{{decisions_needed}}

## Fokus minggu depan

{{next_week_focus}}

## Tone guide

Calm-premium-exec register — sponsor membaca ini sambil minum kopi pagi, bukan di meeting. Status RAG harus jujur — kuning lebih sering benar daripada hijau, dan menghindari kuning supaya laporan terlihat enak adalah anti-pattern paling umum. Status rationale wajib satu kalimat — kalau butuh paragraf untuk menjelaskan kenapa hijau, kemungkinan besar bukan hijau. Decisions needed adalah bagian paling load-bearing — di sinilah sponsor punya leverage untuk membantu. Kalau bagian ini selalu kosong, sponsor mulai bertanya kenapa mereka perlu dilibatkan. Kalau selalu penuh, project mungkin under-empowered. Tidak ada exclamation mark, tidak ada hedge — kalau ETA tidak pasti, tulis "ETA 5 Juni, confidence 60%", bukan "kayaknya selesai akhir bulan".
