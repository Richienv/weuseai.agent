# Template — Year plan

Dipakai untuk merencanakan satu tahun penuh. Audiens: founder, exec, board, investor — dokumen orientasi bukan dokumen kerja. Paling strategis dari tiga plan — tema kuartal, bukan task, plus bet yang sengaja diambil dan ditch yang sengaja dilepas. Kuartal di sini yang nanti diturunkan jadi quarter plan, lalu sprint plan.

## Variables

- `{{year_label}}` — string, label tahun (mis. "2027", "FY27")
- `{{strategic_context}}` — string, 2-3 kalimat ringkas konteks bisnis saat plan disusun — situasi pasar, posisi kita, dan sinyal kuat yang membentuk pilihan tahun ini
- `{{themes}}` — markdown bullet list, 3-5 tema tahun. Tiap tema satu paragraf pendek (3-4 kalimat) yang menjelaskan kenapa tema ini penting tahun ini, bukan tahun depan
- `{{quarter_breakdown}}` — markdown table, fokus per kuartal. Format: `| Kuartal | Fokus utama | Milestone target |`. Empat baris, Q1 sampai Q4
- `{{bets}}` — markdown bullet list, 2-4 bet — pilihan besar yang punya upside tinggi tapi tidak pasti. Format per item: "**[Nama bet]** — [Tesis dalam 1-2 kalimat] · [Apa yang dipertaruhkan] · [Sinyal yang akan dipakai untuk evaluasi]"
- `{{ditches}}` — markdown bullet list, 2-4 ditch — hal yang sengaja dilepas tahun ini supaya bet bisa dikerjakan. Format per item: "**[Yang dilepas]** — [Alasan kenapa dilepas, bukan ditunda]"
- `{{capital_envelope}}` — string, batasan modal atau capacity tahun ini — anggaran, headcount, atau runway yang membatasi pilihan
- `{{review_cadence}}` — string, ritme review tahun (mis. "Quarterly review akhir kuartal plus monthly check-in tema utama")

## Template

# Year plan — {{year_label}}

## Konteks strategis

{{strategic_context}}

## Tema tahun

{{themes}}

## Breakdown per kuartal

{{quarter_breakdown}}

## Bet

{{bets}}

## Ditch

{{ditches}}

## Envelope modal dan capacity

{{capital_envelope}}

## Review cadence

{{review_cadence}}

## Tone guide

Tahun adalah horizon yang panjang — plan ini bukan to-do list, ia adalah pernyataan posisi. Tema bukan kategori task ("marketing", "engineering") — tema adalah pernyataan tentang arah ("dari produk single-tier ke multi-tier"). Quarter breakdown sengaja ringkas — detail per kuartal nanti hidup di quarter plan, bukan di sini. Bet dan ditch adalah dua sisi koin yang sama — kalau ada bet tapi tidak ada ditch, berarti kamu belum benar-benar memilih. Ditch wajib eksplisit "dilepas tahun ini", bukan "ditunda" — penundaan menumpuk dan menghantui. Konteks strategis di paragraf pertama supaya kalau plan dibuka enam bulan kemudian, pembaca bisa mengingat dunia seperti apa saat keputusan ini diambil. Zero exclamation marks, zero hyperbole — kalau tema dijual dengan kata "ambitious" atau "transformative", ia kehilangan bobot.
