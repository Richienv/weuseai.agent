# Template — Email Casual (Profesional)

Email casual-profesional untuk hubungan kerja yang sudah cair: kolega di perusahaan lain, klien lama, partner kerja, freelancer yang sudah pernah collaborate.
Audience: kontak yang sudah dikenal, register cair tapi tetap profesional.
Pakai untuk update progress, follow-up santai, atau diskusi yang tidak butuh formalitas berat.

## Variables

- `{{recipient_first_name}}` — string. Nama panggilan penerima.
- `{{subject_line}}` — string. Subjek email (boleh casual, max 60 karakter).
- `{{opening_line}}` — string. Sapaan + small talk pendek (1 kalimat, opsional kalau kontak rutin).
- `{{main_paragraph}}` — string. Isi utama email (1-2 paragraf pendek).
- `{{action_line}}` — string. Permintaan atau next step yang jelas (1-2 kalimat).
- `{{closing_line}}` — string. Penutup hangat tapi singkat.
- `{{sender_first_name}}` — string. Nama panggilan pengirim.
- `{{sender_contact_line}}` — string. Kontak singkat (email + WhatsApp opsional).

## Template

---
template: email-casual
language: id
register: kamu
tone: warm-direct
---

**Subjek:** {{subject_line}}

---

Halo {{recipient_first_name}},

{{opening_line}}

{{main_paragraph}}

{{action_line}}

{{closing_line}}

Salam,
{{sender_first_name}}
{{sender_contact_line}}

## Tone guide

Register **kamu** (bukan Anda, bukan lo/gue). Boleh pakai kontraksi alami ("nggak", "gak", "udah") sewajarnya tapi jangan berlebihan — masih ranah kerja. Kalimat pendek. Total panjang email idealnya 80-150 kata. Pakai "Halo" atau "Hi" sebagai pembuka, "Salam" sebagai penutup. Tidak ada tanda seru di body; satu di sapaan opsional masih oke. Hindari frasa over-formal seperti "Dengan ini saya beritahukan bahwa" — langsung saja "Aku mau update soal ...".

> _Catatan customer: kalau ragu antara casual vs formal, default ke formal untuk first contact, lalu turunkan ke casual setelah balasan pertama menunjukkan register yang lebih cair. Mirror tone penerima — kalau dia formal, jangan dipaksa casual._
