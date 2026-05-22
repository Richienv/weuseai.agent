# Template — Sprint plan

Dipakai untuk merencanakan sprint 1-2 minggu. Audiens: team yang akan eksekusi sprint plus stakeholder yang butuh tahu apa yang sedang dikerjakan. Fokus line-item — tiap task konkret, ada owner, ada estimasi, ada dependency yang dipetakan.

## Variables

- `{{sprint_label}}` — string, label sprint (mis. "Sprint 12", "Sprint W21-W22")
- `{{sprint_start}}` — string, tanggal mulai (mis. "Senin, 25 Mei 2026")
- `{{sprint_end}}` — string, tanggal selesai (mis. "Jumat, 5 Juni 2026")
- `{{sprint_goal}}` — string, satu kalimat outcome yang dianggap sukses kalau sprint ini ditutup
- `{{team_capacity_summary}}` — markdown bullet list, capacity per orang dalam jam atau hari (mis. "- Renita — 8 hari (cuti Kamis-Jumat W22)")
- `{{tasks_table}}` — markdown table, daftar task dengan id, judul, owner, estimasi, dependency. Format kolom: `| ID | Task | Owner | Estimasi | Dependency | Milestone |`
- `{{dependencies_outside_sprint}}` — markdown bullet list, hal yang dibutuhkan dari pihak luar sprint (decision dari atasan, output dari team lain, akses sistem). Kalau tidak ada, tulis "Tidak ada — sprint self-contained."
- `{{risks}}` — markdown bullet list, 2-4 risiko yang paling mungkin nyata di sprint ini, plus mitigasi singkat tiap risiko
- `{{out_of_scope}}` — markdown bullet list, hal yang sengaja tidak masuk sprint ini supaya scope creep punya batas yang bisa ditunjuk
- `{{review_datetime}}` — string, jadwal sprint review (mis. "Jumat, 5 Juni 2026, 15:00 WIB")

## Template

# Sprint plan — {{sprint_label}}

**Periode:** {{sprint_start}} sampai {{sprint_end}}
**Review:** {{review_datetime}}

## Goal sprint

{{sprint_goal}}

## Capacity team

{{team_capacity_summary}}

## Task

{{tasks_table}}

## Dependency luar sprint

{{dependencies_outside_sprint}}

## Risiko dan mitigasi

{{risks}}

## Out of scope

{{out_of_scope}}

## Tone guide

Operasional, line-item, konkret. Sprint plan adalah dokumen kerja — tiap task harus jelas owner-nya, jelas estimasi-nya, jelas dependency-nya. Goal sprint ditulis sebagai outcome, bukan daftar aktivitas — "Checkout flow live di staging dengan 3 test customer pass" bukan "Kerjakan checkout flow". Out of scope sengaja ada supaya saat permintaan baru muncul di tengah sprint, kamu punya tempat untuk menunjuk dan bilang "ini sprint berikutnya, bukan sekarang". Risiko dibatasi 2-4 — kalau lebih, itu sinyal sprint terlalu ambisius dan perlu di-rescope sebelum mulai.
