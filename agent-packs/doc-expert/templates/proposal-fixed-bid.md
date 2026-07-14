# Template — Proposal Fixed-Bid

Proposal harga tetap (fixed-price) untuk proyek yang scope-nya sudah jelas dan dipecah per milestone dengan deliverable spesifik.
Audience: klien B2B yang prefer kepastian budget dan timeline dibanding model hourly.
Pakai saat scope dapat di-frozen lebih dulu (mis. build website 5 halaman, develop fitur tertentu, produksi video kampanye).

## Variables

- `{{proposal_number}}` — string. ID proposal.
- `{{proposal_date}}` — string. Tanggal terbit.
- `{{valid_until}}` — string. Masa berlaku proposal.
- `{{sender_name}}`, `{{sender_title}}` — string. Identitas pengirim.
- `{{client_name}}`, `{{client_company}}`, `{{client_role}}` — string. Identitas klien.
- `{{project_title}}` — string. Nama proyek.
- `{{project_objective}}` — string. Tujuan satu kalimat.
- `{{success_metric_1}}`, `{{success_metric_2}}`, `{{success_metric_3}}` — string. Metrik keberhasilan terukur.
- `{{m1_title}}`, `{{m1_duration}}`, `{{m1_deliverables}}`, `{{m1_price_formatted}}` — string. Milestone 1.
- `{{m2_title}}`, `{{m2_duration}}`, `{{m2_deliverables}}`, `{{m2_price_formatted}}` — string. Milestone 2.
- `{{m3_title}}`, `{{m3_duration}}`, `{{m3_deliverables}}`, `{{m3_price_formatted}}` — string. Milestone 3.
- `{{m4_title}}`, `{{m4_duration}}`, `{{m4_deliverables}}`, `{{m4_price_formatted}}` — string. Milestone 4 (opsional).
- `{{total_price_formatted}}` — string. Total fixed-price.
- `{{total_duration}}` — string. Durasi total.
- `{{client_responsibilities}}` — markdown list. Tanggung jawab klien (akses, data, approval).
- `{{revision_policy}}` — string. Kebijakan revisi per milestone.
- `{{change_request_policy}}` — string. Kebijakan change request di luar scope.
- `{{warranty_period}}` — string. Garansi bug-fix pasca-delivery (mis. `30 hari kalender`).
- `{{sender_contact_line}}` — string. Email + WhatsApp.

## Template

---
template: proposal-fixed-bid
language: id
audience: b2b-decision-maker
register: formal
---

# Proposal Fixed-Bid — {{project_title}}

**Untuk:** {{client_name}} ({{client_role}}), {{client_company}}
**Dari:** {{sender_name}}, {{sender_title}}
**No. Proposal:** {{proposal_number}}
**Tanggal:** {{proposal_date}}
**Berlaku sampai:** {{valid_until}}
**Model harga:** Fixed-price per milestone

---

## 1. Tujuan Proyek

{{project_objective}}

### Indikator keberhasilan

- {{success_metric_1}}
- {{success_metric_2}}
- {{success_metric_3}}

## 2. Milestone &amp; Deliverable

Total durasi: **{{total_duration}}**. Setiap milestone diserahkan dengan deliverable terdaftar di bawah, dan pembayaran termin mengikuti penyelesaian milestone.

### Milestone 1 — {{m1_title}}

- **Durasi:** {{m1_duration}}
- **Deliverable:**
  {{m1_deliverables}}
- **Harga termin:** {{m1_price_formatted}}

### Milestone 2 — {{m2_title}}

- **Durasi:** {{m2_duration}}
- **Deliverable:**
  {{m2_deliverables}}
- **Harga termin:** {{m2_price_formatted}}

### Milestone 3 — {{m3_title}}

- **Durasi:** {{m3_duration}}
- **Deliverable:**
  {{m3_deliverables}}
- **Harga termin:** {{m3_price_formatted}}

### Milestone 4 — {{m4_title}}

- **Durasi:** {{m4_duration}}
- **Deliverable:**
  {{m4_deliverables}}
- **Harga termin:** {{m4_price_formatted}}

## 3. Total Investasi

**{{total_price_formatted}}** (sudah termasuk PPN bila berlaku). Pembayaran dibagi per termin di tabel milestone di atas. Invoice termin diterbitkan setelah deliverable milestone tersebut diterima oleh klien.

## 4. Tanggung Jawab Klien

Agar timeline terjaga, kami membutuhkan dukungan berikut dari pihak {{client_company}}:

{{client_responsibilities}}

Keterlambatan akses, data, atau approval lebih dari 5 hari kerja dapat menggeser timeline keseluruhan.

## 5. Kebijakan Revisi

{{revision_policy}}

## 6. Change Request di Luar Scope

{{change_request_policy}}

Setiap change request akan diestimasi terlebih dahulu dan dikirim sebagai addendum proposal untuk approval tertulis sebelum dikerjakan.

## 7. Garansi Pasca-Delivery

Kami memberikan garansi bug-fix selama **{{warranty_period}}** terhitung sejak delivery milestone terakhir. Garansi mencakup perbaikan kerusakan fungsional yang berasal dari pekerjaan kami; tidak mencakup perubahan scope atau permintaan fitur baru.

## 8. Persetujuan

Apabila proposal ini disetujui, mohon balas email atau tanda tangan halaman ini, dan kami akan menerbitkan invoice termin pertama serta menjadwalkan kick-off dalam 3 hari kerja.

| Disetujui oleh | Tanggal |
| --- | --- |
| {{client_name}} — {{client_role}} | _________________ |

Hormat kami,

**{{sender_name}}**
{{sender_title}}
{{sender_contact_line}}

## Tone guide

Register formal-bisnis, sama dengan `proposal-services.md`. Lebih spesifik dan kontraktual karena fixed-bid — hindari frasa lentur seperti "kira-kira" atau "sebisanya". Pakai bahasa terikat ("akan diserahkan", "wajib disediakan") untuk komitmen, dan bahasa kondisional ("dapat") hanya untuk hasil yang bergantung input klien. Tidak ada tanda seru.

> _Catatan customer: untuk proyek &lt;Rp 10jt cukup 2-3 milestone; untuk proyek &gt;Rp 50jt sebaiknya 4-5 milestone agar cash-flow seimbang dan klien punya checkpoint cukup sering._
