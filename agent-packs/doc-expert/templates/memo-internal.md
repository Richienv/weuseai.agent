# Template — Memo Internal

Memo internal untuk komunikasi resmi antar-divisi atau dari atasan ke bawahan dalam satu organisasi.
Audience: karyawan / tim internal yang perlu pemberitahuan, instruksi, atau klarifikasi tertulis dengan jejak audit.
Pakai untuk pemberitahuan kebijakan, instruksi proyek, perubahan prosedur, atau hal yang perlu rekaman tertulis tapi tidak butuh surat formal dengan kop.

## Variables

- `{{org_name}}` — string. Nama organisasi.
- `{{memo_number}}` — string. Nomor memo (mis. `MEMO-OPS-014/V/2026`).
- `{{memo_date}}` — string. Tanggal memo (format `DD Bulan YYYY`).
- `{{to_recipient}}` — string. Penerima (divisi atau nama + jabatan).
- `{{from_sender}}` — string. Pengirim (nama + jabatan).
- `{{cc_list}}` — string. Tembusan (opsional, kosongkan dengan `-` jika tidak ada).
- `{{subject}}` — string. Perihal memo (deskriptif, max 80 karakter).
- `{{context_paragraph}}` — string. Konteks singkat / latar — kenapa memo ini diterbitkan.
- `{{key_points_list}}` — markdown list. Poin-poin utama (instruksi, kebijakan, perubahan).
- `{{action_required}}` — string. Tindakan yang diharapkan dari penerima + deadline.
- `{{closing_paragraph}}` — string. Penutup — kontak untuk pertanyaan, harapan eksekusi.
- `{{sender_name}}` — string. Nama penandatangan.
- `{{sender_title}}` — string. Jabatan penandatangan.

## Template

---
template: memo-internal
language: id
register: formal-anda
tone: directive-clear
---

# MEMORANDUM

**{{org_name}}**

| | |
| --- | --- |
| **Nomor** | {{memo_number}} |
| **Tanggal** | {{memo_date}} |
| **Kepada** | {{to_recipient}} |
| **Dari** | {{from_sender}} |
| **Tembusan** | {{cc_list}} |
| **Perihal** | **{{subject}}** |

---

{{context_paragraph}}

Berikut poin-poin yang perlu diperhatikan:

{{key_points_list}}

**Tindakan yang diperlukan:** {{action_required}}

{{closing_paragraph}}

<br><br>

{{sender_name}}
{{sender_title}}

## Tone guide

Register formal-internal — pakai Bahasa Indonesia baku, register Anda atau "rekan-rekan" untuk audience tim. Memo lebih singkat dari surat — target 150-300 kata. Fokus ke kejelasan instruksi, bukan ramah-tamah. Tidak perlu salam pembuka panjang ("Dengan hormat" boleh diabaikan untuk memo internal). Poin utama dipecah ke bullet list agar mudah dieksekusi. Deadline tindakan harus spesifik tanggal, bukan "secepatnya". Tidak ada tanda seru.

> _Catatan customer: memo internal yang berulang ke audience yang sama bisa pakai format email cair (`email-casual.md`) — pakai memo formal kalau butuh jejak audit, kebijakan, atau eskalasi. Penomoran memo idealnya mengikuti sistem dokumen internal organisasi._
