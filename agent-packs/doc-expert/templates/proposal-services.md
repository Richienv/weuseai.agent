# Template — Proposal Layanan

Proposal layanan untuk klien yang sudah punya minat awal tapi belum committed.
Audience: decision-maker B2B (manager / direktur / owner UMKM) yang butuh ringkasan satu-dokumen sebelum approve scope dan budget.
Pakai saat klien minta "kirimin proposalnya dulu" setelah pertemuan eksplorasi atau email perkenalan.

## Variables

- `{{proposal_number}}` — string. ID proposal (mis. `PROP-2026-001`).
- `{{proposal_date}}` — string. Tanggal proposal diterbitkan (format `DD Bulan YYYY`).
- `{{valid_until}}` — string. Tanggal kadaluarsa proposal (umumnya 14-30 hari setelah terbit).
- `{{sender_name}}` — string. Nama vendor / perusahaan / freelancer yang menawarkan.
- `{{sender_title}}` — string. Jabatan pengirim (mis. `Founder`, `Account Lead`).
- `{{client_name}}` — string. Nama klien / kontak utama.
- `{{client_company}}` — string. Nama badan usaha klien.
- `{{client_role}}` — string. Jabatan kontak di klien.
- `{{project_title}}` — string. Judul proyek / layanan yang ditawarkan.
- `{{problem_paragraph_1}}` — string. Konteks masalah dari sudut pandang klien (1 paragraf).
- `{{problem_paragraph_2}}` — string. Dampak jika masalah tidak diselesaikan (1 paragraf).
- `{{approach_paragraph}}` — string. Ringkasan pendekatan / metode (1-2 paragraf).
- `{{approach_pillar_1_title}}`, `{{approach_pillar_1_body}}` — string. Pilar pendekatan pertama.
- `{{approach_pillar_2_title}}`, `{{approach_pillar_2_body}}` — string. Pilar kedua.
- `{{approach_pillar_3_title}}`, `{{approach_pillar_3_body}}` — string. Pilar ketiga (opsional, kosongkan jika tidak relevan).
- `{{scope_in_items}}` — markdown list. Hal yang INCLUDED di scope.
- `{{scope_out_items}}` — markdown list. Hal yang TIDAK termasuk (penting untuk hindari scope creep).
- `{{timeline_week_1}}`, `{{timeline_week_2}}`, `{{timeline_week_3}}`, `{{timeline_week_4}}` — string. Aktivitas per minggu.
- `{{total_duration}}` — string. Durasi total (mis. `4 minggu`, `2 bulan`).
- `{{investment_amount_formatted}}` — string. Total investasi dengan format IDR (mis. `Rp 25.000.000`).
- `{{investment_payment_schedule}}` — string. Skema pembayaran (mis. `50% di awal, 50% saat delivery`).
- `{{next_step_1}}`, `{{next_step_2}}`, `{{next_step_3}}` — string. Langkah konkret berikutnya.
- `{{sender_contact_line}}` — string. Email + WhatsApp pengirim.

## Template

---
template: proposal-services
language: id
audience: b2b-decision-maker
register: formal
---

# Proposal Layanan — {{project_title}}

**Untuk:** {{client_name}} ({{client_role}}), {{client_company}}
**Dari:** {{sender_name}}, {{sender_title}}
**No. Proposal:** {{proposal_number}}
**Tanggal:** {{proposal_date}}
**Berlaku sampai:** {{valid_until}}

---

## 1. Konteks &amp; Masalah

{{problem_paragraph_1}}

{{problem_paragraph_2}}

## 2. Pendekatan

{{approach_paragraph}}

Kami mengusulkan tiga pilar kerja:

**{{approach_pillar_1_title}}.** {{approach_pillar_1_body}}

**{{approach_pillar_2_title}}.** {{approach_pillar_2_body}}

**{{approach_pillar_3_title}}.** {{approach_pillar_3_body}}

## 3. Lingkup Pekerjaan

### Termasuk dalam scope

{{scope_in_items}}

### Tidak termasuk

{{scope_out_items}}

Hal di luar scope dapat dikerjakan dengan kesepakatan tambahan.

## 4. Timeline

Durasi total: **{{total_duration}}**.

| Minggu | Aktivitas |
| --- | --- |
| 1 | {{timeline_week_1}} |
| 2 | {{timeline_week_2}} |
| 3 | {{timeline_week_3}} |
| 4 | {{timeline_week_4}} |

## 5. Investasi

Total: **{{investment_amount_formatted}}** (sudah termasuk PPN 11% bila berlaku).

Skema pembayaran: {{investment_payment_schedule}}.

Investasi mencakup seluruh deliverable di bagian "Termasuk dalam scope" di atas. Permintaan revisi mayor di luar scope dihitung terpisah.

## 6. Langkah Berikutnya

1. {{next_step_1}}
2. {{next_step_2}}
3. {{next_step_3}}

Setelah proposal ini disetujui, kami akan menerbitkan invoice termin pertama dan menjadwalkan kick-off meeting dalam waktu 3 hari kerja.

---

Terima kasih atas kepercayaan dan waktu Bapak/Ibu {{client_name}} untuk mempertimbangkan proposal ini. Kami siap menjawab pertanyaan apa pun terkait scope, timeline, atau investasi.

Hormat kami,

**{{sender_name}}**
{{sender_title}}
{{sender_contact_line}}

## Tone guide

Register formal Bahasa Indonesia bisnis — gunakan "kami" untuk pengirim dan "Bapak/Ibu" untuk klien sapaan pembuka/penutup. Tubuh dokumen pakai "kamu"-implisit (tanpa kata ganti, fokus ke statement) agar tidak terlalu kaku. Hindari kata banned dan tanda seru. Kalimat satu ide per baris. Jangan over-promise; pakai bahasa kondisional saat menyebut hasil ("dapat menghasilkan", bukan "akan menghasilkan").

> _Catatan customer: ganti header "Bapak/Ibu" sesuai gender klien atau buang sapaan bila terlalu formal untuk hubungan yang sudah cair. Untuk klien startup / agency muda, register bisa diturunkan ke "kamu" — tetap profesional._
