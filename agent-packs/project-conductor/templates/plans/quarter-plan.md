# Template — Quarter plan

Dipakai untuk merencanakan kuartal — horizon 90 hari. Audiens: founder, lead per fungsi, plus stakeholder yang butuh tahu fokus kuartal. Lebih strategis dari sprint plan — tema dan outcome diukur, bukan daftar task harian. Milestone yang ditandai di sini yang nanti di-decompose jadi sprint.

## Variables

- `{{quarter_label}}` — string, label kuartal (mis. "Q3 2026", "Q2 FY27")
- `{{quarter_start}}` — string, tanggal mulai kuartal
- `{{quarter_end}}` — string, tanggal akhir kuartal
- `{{north_star}}` — string, satu kalimat yang menjawab "kalau kuartal ini berhasil, perubahan terbesar apa yang terasa?"
- `{{themes}}` — markdown bullet list, 3-5 tema kuartal. Tiap tema satu baris, tema yang lebih besar dari task — mis. "Pertumbuhan paid customer" bukan "Tambah landing page"
- `{{outcomes_table}}` — markdown table, outcome terukur per tema. Format: `| Tema | Outcome | Baseline | Target | Owner |`. Tiap outcome wajib measurable
- `{{milestones}}` — markdown bullet list, 3-5 milestone level kuartal dengan tanggal target. Format per baris: "**[Tanggal]** — [Milestone] (owner: [nama])"
- `{{key_risks}}` — markdown bullet list, 3-5 risiko terbesar yang bisa menggagalkan kuartal, plus mitigasi atau leading indicator yang dipantau
- `{{not_doing}}` — markdown bullet list, hal yang sengaja tidak dikerjakan kuartal ini supaya tema utama tidak terdilusi
- `{{checkin_cadence}}` — string, ritme check-in (mis. "Mingguan setiap Jumat 15:00 WIB plus monthly review minggu pertama bulan berikutnya")

## Template

# Quarter plan — {{quarter_label}}

**Periode:** {{quarter_start}} sampai {{quarter_end}}
**Check-in cadence:** {{checkin_cadence}}

## North star

{{north_star}}

## Tema kuartal

{{themes}}

## Outcome terukur

{{outcomes_table}}

## Milestone

{{milestones}}

## Risiko kunci

{{key_risks}}

## Yang tidak dikerjakan kuartal ini

{{not_doing}}

## Tone guide

Strategis, tema lebih dari task. Beda dengan sprint plan — di sini kamu tidak menulis "bikin landing page X", kamu menulis "tema: pertumbuhan paid customer; outcome: 40 customer baru tier Pro". Cara mencapainya nanti di-decompose jadi sprint. North star adalah tes apakah kuartal layak — kalau north star terlalu vague untuk dipantau ("scale up"), berarti kuartalnya belum ter-frame. Outcome wajib measurable dengan baseline + target — tanpa baseline, tidak ada cara tahu apakah pergerakan terjadi. "Yang tidak dikerjakan" adalah disiplin paling penting — kuartal hanya 13 minggu, dan 3-5 tema saja sudah berat; tema kelima dan seterusnya yang tidak masuk lebih banyak daripada yang masuk.
