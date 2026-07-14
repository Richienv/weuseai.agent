# Template — Status update

Dipakai untuk kirim status singkat ke stakeholder — atasan, investor, klien, partner. Audiens: stakeholder yang butuh update tanpa baca panjang. Maksimum 5 baris isi (di luar sapaan + tanda tangan). Cocok dipakai mingguan atau saat milestone.

## Variables

- `{{recipient_name}}` — string, nama penerima
- `{{period_label}}` — string, periode update (mis. "Minggu 19", "April 2026", "Sprint 12")
- `{{done_line}}` — string, satu baris ringkasan apa yang sudah selesai
- `{{next_line}}` — string, satu baris ringkasan apa yang berikutnya
- `{{blockers_line}}` — string, satu baris ringkasan blocker. Kalau tidak ada, tulis "Tidak ada blocker."
- `{{asks_line}}` — string, satu baris ringkasan apa yang dibutuhkan dari penerima. Kalau tidak ada ask, tulis "Tidak ada yang dibutuhkan minggu ini."
- `{{customer_signature_name}}` — string, nama customer

## Template

Halo {{recipient_name}},

Status update untuk {{period_label}}.

- **Selesai:** {{done_line}}
- **Berikutnya:** {{next_line}}
- **Blocker:** {{blockers_line}}
- **Ask:** {{asks_line}}

Kabarin kalau ada yang mau diperdalam.

Salam,
{{customer_signature_name}}

## Tone guide

Ketat, ringkas, scannable. Setiap baris berdiri sendiri dan bisa dibaca dalam 3 detik. Tidak ada hedge ("kayaknya", "mungkin"). Blocker dan ask harus eksplisit — kalau dikosongkan dengan "TBD", sinyalnya tidak siap. Kalau memang tidak ada blocker/ask, nyatakan dengan jelas supaya penerima tahu kamu sudah memikirkannya, bukan lupa.
