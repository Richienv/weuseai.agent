# Template — One-on-one notes

Dipakai sebelum dan sesudah 1-on-1 dengan manager atau direct report. Audiens: customer sendiri, dipakai untuk masuk ke meeting dengan kejernihan dan keluar dengan catatan yang bisa di-revisit di 1-on-1 berikutnya.

## Variables

- `{{counterpart_name}}` — string, nama lawan bicara (mis. manager, direct report, mentor)
- `{{meeting_date}}` — string, tanggal 1-on-1 (mis. "Rabu, 14 Mei 2026")
- `{{cadence_label}}` — string, ritme pertemuan (mis. "Mingguan", "Dua-mingguan", "Bulanan")
- `{{what_worked}}` — markdown bullet list, hal yang berjalan baik sejak 1-on-1 terakhir
- `{{what_didnt}}` — markdown bullet list, hal yang tidak berjalan baik — proyek macet, ekspektasi tidak match, friksi
- `{{asks}}` — markdown bullet list, hal spesifik yang kamu butuhkan dari lawan bicara (keputusan, support, intro, unblock)
- `{{theme_to_raise}}` — string, satu tema yang lebih besar dari item harian — pola, tren, atau perasaan yang ingin dinaikkan
- `{{post_meeting_summary}}` — string, diisi setelah meeting — 2-3 kalimat ringkasan apa yang dibahas
- `{{post_meeting_commitments}}` — markdown bullet list, diisi setelah meeting — komitmen baru (siapa janji apa, kapan)
- `{{next_session_carry_over}}` — string opsional, diisi setelah meeting — hal yang harus dibawa ke 1-on-1 berikutnya

## Template

# 1-on-1 dengan {{counterpart_name}} — {{meeting_date}}

**Cadence:** {{cadence_label}}

---

## Pra-meeting

### Yang berjalan baik

{{what_worked}}

### Yang tidak berjalan baik

{{what_didnt}}

### Asks

{{asks}}

### Tema yang ingin diangkat

{{theme_to_raise}}

---

## Post-meeting log

**Ringkasan diskusi:**
{{post_meeting_summary}}

**Komitmen baru:**
{{post_meeting_commitments}}

**Untuk 1-on-1 berikutnya:**
{{next_session_carry_over}}

## Tone guide

Jujur, tenang, terstruktur. Bagian "what didn't" sengaja terpisah dari "asks" — pertama untuk diagnose, kedua untuk action. Asks ditulis konkret, bukan "butuh support" — tulis "butuh keputusan soal alokasi budget Q3 paling lambat Jumat." Tema yang diangkat sengaja satu — kalau banyak, ini bukan 1-on-1, ini perlu sesi tersendiri. Post-meeting log dipakai supaya tema yang muncul tidak hilang antar pertemuan.
