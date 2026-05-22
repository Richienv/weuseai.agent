# Template — Email Urgent (Action Required)

Email untuk minta tindakan cepat dengan deadline jelas: persetujuan tertunda, dokumen blocking, response yang diperlukan dalam 24 jam.
Audience: stakeholder yang sudah dikenal dan punya kewenangan tindak lanjut. Bukan untuk first contact.
Pakai saat ada deadline keras dan email rutin sudah tidak cukup mendesak.

## Variables

- `{{recipient_salutation_and_name}}` — string. Sapaan + nama (mis. `Bapak Andi`, `Kak Sari`).
- `{{subject_line}}` — string. Subjek dengan tag urgensi (mis. `[PERLU RESPON 24 JAM] Approval Invoice #2026-014`).
- `{{ask_one_sentence}}` — string. Permintaan dalam SATU kalimat di paragraf pertama.
- `{{deadline_datetime}}` — string. Deadline spesifik tanggal + jam + zona waktu (mis. `Jumat 24 Mei 2026 pukul 17.00 WIB`).
- `{{why_urgent_paragraph}}` — string. Alasan singkat kenapa urgent (1-3 kalimat). Sebut konsekuensi konkret kalau lewat deadline.
- `{{what_is_needed_list}}` — markdown list. Detail spesifik yang diperlukan (dokumen, approval, jawaban).
- `{{escalation_contact}}` — string. Kontak alternatif bila penerima utama tidak available.
- `{{sender_name}}` — string. Nama pengirim.
- `{{sender_title}}` — string. Jabatan.
- `{{sender_phone}}` — string. Nomor WhatsApp untuk follow-up cepat.
- `{{sender_email}}` — string. Email pengirim.

## Template

---
template: email-urgent
language: id
register: formal-anda
tone: respectful-urgent
---

**Subjek:** {{subject_line}}

---

{{recipient_salutation_and_name}},

Mohon respon dalam 24 jam: {{ask_one_sentence}}

**Deadline:** {{deadline_datetime}}.

{{why_urgent_paragraph}}

Yang dibutuhkan dari pihak Anda:

{{what_is_needed_list}}

Apabila Anda tidak available dalam jendela waktu di atas, mohon diteruskan ke {{escalation_contact}}, atau kabari saya melalui WhatsApp di {{sender_phone}} agar dapat dicari solusi sementara.

Terima kasih atas perhatian segeranya.

Hormat saya,

**{{sender_name}}**
{{sender_title}}
WhatsApp: {{sender_phone}}
Email: {{sender_email}}

## Tone guide

Register **Anda** — formal karena urgensi tidak boleh terkesan menggertak. Permintaan utama wajib muncul di paragraf pertama (jangan dipendam di tengah). Deadline ditulis spesifik tanggal + jam + zona waktu, bukan "secepatnya". Alasan urgensi pakai data konkret ("invoice harus terbit hari Senin agar tidak melewati closing bulan"), bukan pressure tactic kosong. Subjek pakai tag visual `[PERLU RESPON 24 JAM]` agar terdeteksi cepat di inbox. Body harus singkat — maksimal 100 kata. Hindari tanda seru meski urgent; format dan struktur sudah membawa urgency-nya.

> _Catatan customer: kalau urgensi datang berulang ke kontak yang sama dalam waktu pendek, evaluasi proses internal — bukan email-nya. Email urgent kehilangan efektivitas kalau jadi default mode komunikasi._
