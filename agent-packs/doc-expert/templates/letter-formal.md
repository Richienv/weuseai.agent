# Template — Surat Formal Bahasa Indonesia

Surat formal Bahasa Indonesia lengkap dengan Kop Surat, Nomor Surat, Salam Pembuka, Isi, Salam Penutup, dan tanda tangan.
Audience: pihak eksternal yang membutuhkan dokumen tertulis resmi (instansi pemerintah, mitra korporat, klien institusional).
Pakai untuk surat penawaran, permohonan, pemberitahuan, undangan resmi, atau dokumen yang masuk arsip surat-menyurat institusi.

## Variables

- `{{kop_company_name}}` — string. Nama lembaga / perusahaan (untuk kop surat).
- `{{kop_address}}` — string. Alamat lengkap.
- `{{kop_phone}}` — string. Telepon kantor.
- `{{kop_email}}` — string. Email resmi.
- `{{kop_website}}` — string. Website (opsional).
- `{{letter_number}}` — string. Nomor surat (mis. `001/PT-ABC/V/2026`).
- `{{letter_classification}}` — string. Sifat surat (mis. `Biasa`, `Segera`, `Rahasia`).
- `{{attachment_count}}` — string. Jumlah lampiran (mis. `1 berkas`, `-`).
- `{{letter_subject}}` — string. Perihal surat (deskriptif).
- `{{recipient_name}}` — string. Nama penerima.
- `{{recipient_title}}` — string. Jabatan penerima.
- `{{recipient_company}}` — string. Institusi penerima.
- `{{recipient_address}}` — string. Alamat penerima.
- `{{recipient_city}}` — string. Kota penerima.
- `{{body_paragraph_intro}}` — string. Pembuka isi surat — konteks + tujuan.
- `{{body_paragraph_main_1}}` — string. Isi utama paragraf 1.
- `{{body_paragraph_main_2}}` — string. Isi utama paragraf 2 (opsional).
- `{{body_paragraph_main_3}}` — string. Isi utama paragraf 3 (opsional).
- `{{body_paragraph_closing}}` — string. Penutup isi — harapan / permintaan tindak lanjut.
- `{{sender_city}}` — string. Kota tanda tangan.
- `{{sender_date}}` — string. Tanggal tanda tangan (format `DD Bulan YYYY`).
- `{{sender_name}}` — string. Nama penandatangan.
- `{{sender_title}}` — string. Jabatan penandatangan.
- `{{sender_signature_note}}` — string. Catatan tanda tangan (mis. `Tanda tangan & cap basah`).
- `{{cc_list}}` — markdown list. Tembusan (opsional).

## Template

---
template: letter-formal
language: id
register: formal-anda
tone: official
---

```
═══════════════════════════════════════════════════════════════
                    {{kop_company_name}}
                    {{kop_address}}
            Telp: {{kop_phone}} | Email: {{kop_email}}
                       {{kop_website}}
═══════════════════════════════════════════════════════════════
```

{{sender_city}}, {{sender_date}}

Nomor    : {{letter_number}}
Sifat    : {{letter_classification}}
Lampiran : {{attachment_count}}
Perihal  : **{{letter_subject}}**

Kepada Yth.
{{recipient_name}}
{{recipient_title}}
{{recipient_company}}
{{recipient_address}}
di {{recipient_city}}

Dengan hormat,

{{body_paragraph_intro}}

{{body_paragraph_main_1}}

{{body_paragraph_main_2}}

{{body_paragraph_main_3}}

{{body_paragraph_closing}}

Demikian surat ini kami sampaikan. Atas perhatian dan kerjasama yang baik, kami sampaikan terima kasih.

Hormat kami,

<br><br><br>

**{{sender_name}}**
{{sender_title}}

_({{sender_signature_note}})_

---

**Tembusan:**

{{cc_list}}

## Tone guide

Register paling formal — Bahasa Indonesia baku, kata baku KBBI, struktur surat dinas standar (Permendagri No. 54 Tahun 2009 untuk acuan format pemerintah; sektor swasta lebih fleksibel tapi konvensinya mirip). Pembukaan wajib "Dengan hormat,"; penutup "Hormat kami,". Frasa standar "Demikian surat ini kami sampaikan" sebagai penutup isi sebelum salam. Gunakan "kami" untuk pengirim institusional, "Bapak/Ibu" + nama untuk penerima individual. Tidak ada tanda seru. Tidak ada kontraksi. Tidak ada singkatan informal.

> _Catatan customer: format kop surat di template ini representasi tekstual. Untuk produksi final, render dengan logo image + layout proper di Word / Google Docs / PDF. Nomor surat sebaiknya mengikuti sistem internal organisasi (urutan/kode unit/bulan romawi/tahun)._
