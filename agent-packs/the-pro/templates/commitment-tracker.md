# Template — Commitment tracker

Append-only ledger untuk semua janji yang customer buat ke orang lain — di meeting, di chat, di email, lewat panggilan. Audiens: customer sendiri. Dipakai supaya tidak ada komitmen yang lupa. Update mingguan via weekly recap untuk geser status.

## Variables

Setiap baris baru di tracker pakai variabel ini:

- `{{date_made}}` — string, tanggal saat komitmen dibuat (YYYY-MM-DD)
- `{{commitment_text}}` — string, isi komitmen sespesifik mungkin (bukan "follow-up dengan Andi" tapi "kirim revisi proposal ke Andi")
- `{{committed_to}}` — string, nama orang/pihak yang menerima komitmen
- `{{due_date}}` — string, deadline (YYYY-MM-DD), atau "tidak ada deadline eksplisit" kalau memang belum
- `{{source}}` — string, dari mana komitmen ini muncul (mis. "Email thread Q2 proposal", "Meeting kickoff 8 Mei", "Telegram chat Andi")
- `{{status}}` — string, salah satu dari: `open` / `in-progress` / `done` / `dropped` / `renegotiated`
- `{{notes}}` — string opsional, catatan tambahan (perubahan scope, alasan dropped, dll)

## Template

# Commitment tracker — {{customer_name_if_shared}}

> Append-only. Komitmen baru ditambah di bawah. Status di-update di tempat, tanggal komitmen tidak diubah.

| Tanggal | Komitmen | Kepada | Due | Sumber | Status | Catatan |
|---------|----------|--------|-----|--------|--------|---------|
| {{date_made}} | {{commitment_text}} | {{committed_to}} | {{due_date}} | {{source}} | {{status}} | {{notes}} |

## Cara baca

- **open** — belum dimulai, masih dalam radar
- **in-progress** — sedang dikerjakan
- **done** — selesai, sudah disampaikan ke pihak yang dijanjikan
- **dropped** — sengaja dibatalkan, sudah komunikasikan ke pihak terkait
- **renegotiated** — deadline atau scope berubah, sudah dikonfirmasi dengan pihak terkait

## Tone guide

Ledger, bukan narasi. Setiap baris faktual, tanpa adjective. Komitmen ditulis dalam bahasa konkret — kalau tidak bisa diukur, mungkin masih intent, bukan komitmen. Status `dropped` dan `renegotiated` dipakai apa adanya — bukan tanda gagal, tapi tanda jujur. The Pro membantu customer review tracker ini di weekly recap dan flag yang due dalam 3-7 hari ke depan.
