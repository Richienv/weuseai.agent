# Template — Email Formal

Email bisnis formal untuk korespondensi resmi: pertama kontak, surat menyurat antar institusi, atau email ke pihak yang belum dikenal.
Audience: kontak eksternal, instansi pemerintah, perusahaan besar, klien baru kelas korporat.
Pakai saat hubungan masih kaku dan registernya perlu menjaga jarak hormat.

## Variables

- `{{recipient_salutation}}` — string. Sapaan formal (mis. `Bapak`, `Ibu`, `Bapak/Ibu`).
- `{{recipient_name}}` — string. Nama penerima.
- `{{recipient_title}}` — string. Jabatan penerima (mis. `Direktur Pemasaran`).
- `{{recipient_company}}` — string. Nama institusi/perusahaan.
- `{{subject_line}}` — string. Subjek email (max 60 karakter, deskriptif).
- `{{opening_paragraph}}` — string. Pembuka — perkenalan diri + tujuan email (2-3 kalimat).
- `{{body_paragraph_1}}` — string. Konteks atau latar belakang permintaan/informasi.
- `{{body_paragraph_2}}` — string. Detail spesifik (data, tanggal, scope).
- `{{body_paragraph_3}}` — string. Permintaan atau call-to-action yang jelas.
- `{{closing_paragraph}}` — string. Penutup — ekspresi terima kasih + harapan tindak lanjut.
- `{{sender_name}}` — string. Nama pengirim lengkap.
- `{{sender_title}}` — string. Jabatan pengirim.
- `{{sender_company}}` — string. Perusahaan pengirim.
- `{{sender_phone}}` — string. Nomor telepon/WhatsApp.
- `{{sender_email}}` — string. Email pengirim.

## Template

---
template: email-formal
language: id
register: formal-anda
tone: respectful-distance
---

**Subjek:** {{subject_line}}

---

Kepada Yth.
{{recipient_salutation}} {{recipient_name}}
{{recipient_title}}
{{recipient_company}}

Dengan hormat,

{{opening_paragraph}}

{{body_paragraph_1}}

{{body_paragraph_2}}

{{body_paragraph_3}}

{{closing_paragraph}}

Atas perhatian dan kerjasama yang diberikan, kami sampaikan terima kasih.

Hormat kami,

**{{sender_name}}**
{{sender_title}}
{{sender_company}}
Telp: {{sender_phone}}
Email: {{sender_email}}

## Tone guide

Register paling formal. Gunakan **Anda** (atau lebih hormat: Bapak/Ibu + nama). Tidak ada kontraksi atau singkatan informal. Hindari frasa kasual seperti "btw", "fyi". Pembukaan selalu "Dengan hormat,"; penutup standar "Hormat kami,". Kalimat boleh sedikit lebih panjang dibanding email kasual karena register formal mendukung struktur kalimat majemuk. Tetap satu ide utama per kalimat. Tidak ada tanda seru. Subjek deskriptif, bukan clickbait.

> _Catatan customer: untuk first contact ke institusi pemerintah atau perusahaan besar, register ini wajib. Untuk follow-up email kedua dan seterusnya bisa diturunkan ke `email-casual.md` jika balasan pertama dari pihak penerima cair._
