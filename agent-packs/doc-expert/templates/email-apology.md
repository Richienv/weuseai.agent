# Template — Email Apology

Email permohonan maaf / pengakuan kesalahan: keterlambatan delivery, kesalahan teknis, miskomunikasi yang berdampak pada pihak penerima.
Audience: klien atau partner yang dirugikan oleh kesalahan dari pihak pengirim.
Pakai saat ada masalah yang sudah terjadi dan butuh tanggung jawab + langkah perbaikan komunikatif.

## Variables

- `{{recipient_salutation_and_name}}` — string. Sapaan + nama (mis. `Bapak Andi`, `Ibu Sari`).
- `{{subject_line}}` — string. Subjek email (mis. `Permohonan Maaf — Keterlambatan Delivery Project X`).
- `{{issue_one_sentence}}` — string. Pengakuan masalah dalam satu kalimat di paragraf pertama. Spesifik.
- `{{impact_paragraph}}` — string. Pengakuan dampak ke pihak penerima (1-2 kalimat). Jangan minimize.
- `{{root_cause_paragraph}}` — string. Penjelasan singkat akar masalah TANPA menyalahkan pihak lain (1 paragraf).
- `{{fix_immediate_paragraph}}` — string. Langkah perbaikan langsung yang sudah / sedang dilakukan.
- `{{fix_prevention_paragraph}}` — string. Langkah pencegahan agar tidak terulang.
- `{{compensation_or_offer}}` — string. Kompensasi atau gesture niat baik (opsional — kosongkan jika tidak relevan).
- `{{follow_up_commitment}}` — string. Komitmen tindak lanjut (kapan update berikutnya).
- `{{sender_name}}`, `{{sender_title}}`, `{{sender_phone}}`, `{{sender_email}}` — string. Identitas + kontak pengirim.

## Template

---
template: email-apology
language: id
register: formal-anda
tone: accountable-warm
---

**Subjek:** {{subject_line}}

---

{{recipient_salutation_and_name}},

Saya menulis untuk menyampaikan permohonan maaf: {{issue_one_sentence}}

{{impact_paragraph}}

**Akar masalah.** {{root_cause_paragraph}}

**Langkah perbaikan.** {{fix_immediate_paragraph}}

**Pencegahan ke depan.** {{fix_prevention_paragraph}}

Sebagai bentuk pertanggungjawaban, {{compensation_or_offer}}

{{follow_up_commitment}}

Saya bertanggung jawab penuh atas situasi ini dan terbuka untuk diskusi lebih lanjut bila diperlukan. Mohon hubungi saya langsung di {{sender_phone}} atau {{sender_email}}.

Hormat saya,

**{{sender_name}}**
{{sender_title}}

## Tone guide

Register **Anda** — formal, bertanggung jawab. Permohonan maaf eksplisit di paragraf pertama, tidak dipendam. Hindari kalimat menyalahkan ("kami terkendala oleh ...", "ada masalah dari tim X") — ambil tanggung jawab dengan kalimat aktif ("kami terlambat", "kami salah"). Jangan over-apologize berulang kali — sekali di pembuka, sekali di penutup cukup. Akar masalah dijelaskan jujur tanpa detail teknis berlebihan yang membuat pembaca defensif. Langkah perbaikan harus konkret dan terukur, bukan janji generik ("kami akan lebih hati-hati"). Tidak ada tanda seru. Tidak ada emoji.

> _Catatan customer: kompensasi/offer tidak selalu wajib — terkadang transparansi + perbaikan sudah cukup. Tawarkan kompensasi bila kesalahan menimbulkan kerugian finansial atau reputasi yang nyata. Untuk masalah besar (impact &gt;1 minggu kerja klien), pertimbangkan call telepon dulu sebelum email — email-nya jadi rekaman tertulis pasca-call._
