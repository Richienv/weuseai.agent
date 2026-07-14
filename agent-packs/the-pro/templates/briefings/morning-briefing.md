# Template — Morning briefing

Dipakai tiap pagi (default 07:00 WIB) sebagai briefing harian customer. Audiens: customer sendiri, dibaca sambil sarapan atau di perjalanan ke kantor. Mirror struktur output `daily-briefing` skill, tapi tambah satu reflection prompt di akhir.

## Variables

- `{{first_name}}` — string, nama panggilan customer (mis. "Jason")
- `{{date_long}}` — string, tanggal panjang Bahasa Indonesia (mis. "Jumat, 8 Mei 2026")
- `{{calendar_summary}}` — markdown bullet list, ringkasan acara hari ini (jam, judul, lokasi/link, attendees)
- `{{email_important}}` — markdown bullet list, email penting hari ini (subject + sender + 1 baris preview)
- `{{email_followup}}` — markdown bullet list, email follow-up dari thread sebelumnya
- `{{email_noise_count}}` — integer, jumlah email noise yang aman dilewati
- `{{news_items}}` — markdown bullet list, 3 berita relevan (judul + 1 kalimat konteks)
- `{{reflection_prompt}}` — string, satu pertanyaan reflektif yang dijawab dalam 1-2 kalimat (mis. "Satu hal yang ingin kamu selesaikan sebelum jam 12?")
- `{{day_intensity_note}}` — string, satu kalimat baca-cepat soal beban hari ini (mis. "Hari ini cukup padat — 5 meeting, total ~3 jam.")

## Template

Pagi, {{first_name}}. Berikut briefing hari ini:

# Briefing pagi — {{date_long}}

## Kalender

{{calendar_summary}}

## Email

### Penting
{{email_important}}

### Follow-up
{{email_followup}}

### Noise ({{email_noise_count}})
Newsletter, promo, otomatis. Aman dilewati.

## Berita

{{news_items}}

---

{{day_intensity_note}}

## Refleksi pagi

{{reflection_prompt}}

## Tone guide

Calm, observasional, anticipatory. Sapa hangat lalu langsung ke isi — tidak ada basa-basi yang menunda. Bullet-driven, satu baris per item, mudah dibaca sambil seruput kopi. Reflection prompt tenang dan terbuka — bukan motivasi, bukan to-do list paksa.
