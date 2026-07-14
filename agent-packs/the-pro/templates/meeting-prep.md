# Template — Meeting prep

Dipakai sebelum meeting penting — sales call, 1-on-1 dengan board member, kickoff project. Audiens: customer sendiri, dipakai 5-15 menit sebelum meeting untuk pasang konteks. Juga punya slot post-meeting log supaya catatan tidak nyangkut di kepala.

## Variables

- `{{meeting_title}}` — string, judul meeting
- `{{meeting_datetime}}` — string, tanggal + jam (mis. "Selasa 14 Mei 2026, 14:00-15:00 WIB")
- `{{attendees}}` — markdown bullet list, nama + peran setiap peserta
- `{{objective}}` — string, satu kalimat yang menjawab "apa yang dianggap sukses kalau kita keluar dari ruangan ini?"
- `{{talking_point_1}}` — string, poin pertama yang harus disampaikan
- `{{talking_point_2}}` — string, poin kedua
- `{{talking_point_3}}` — string, poin ketiga
- `{{open_questions}}` — markdown bullet list, pertanyaan terbuka untuk diajukan ke peserta
- `{{materials_checklist}}` — markdown bullet list, materi yang harus dibawa/disiapkan (slide, dokumen, link, akun login)
- `{{post_meeting_decisions}}` — string, diisi setelah meeting — keputusan yang diambil
- `{{post_meeting_actions}}` — string, diisi setelah meeting — action items dengan owner + deadline
- `{{post_meeting_observation}}` — string opsional, diisi setelah meeting — observasi yang ingin diingat untuk meeting berikutnya dengan kelompok ini

## Template

# Meeting prep — {{meeting_title}}

**Waktu:** {{meeting_datetime}}

## Peserta

{{attendees}}

## Tujuan

{{objective}}

## Tiga talking point

1. {{talking_point_1}}
2. {{talking_point_2}}
3. {{talking_point_3}}

## Pertanyaan terbuka

{{open_questions}}

## Materi yang dibutuhkan

{{materials_checklist}}

---

## Log setelah meeting

**Keputusan:** {{post_meeting_decisions}}

**Action items:** {{post_meeting_actions}}

**Catatan untuk lain kali:** {{post_meeting_observation}}

## Tone guide

Pragmatis, scannable, dibaca cepat. Tujuan ditulis sebagai outcome konkret, bukan agenda. Talking point dibatasi tiga supaya jelas mana yang prioritas — bukan dump semua yang mungkin dibahas. Post-meeting log sengaja ada di file yang sama supaya saat buka ulang, kamu lihat niat awal vs hasil aktual.
