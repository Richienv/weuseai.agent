# Template — Research Brief

Brief scoping yang customer isi sebelum playbook riset besar dijalankan. Memaksa pertanyaan jadi tajam, scope jadi terbatas, dan ekspektasi sumber jadi eksplisit.
Audience: customer yang minta riset kompleks — analyst, founder, peneliti internal — yang siap commit waktu untuk hasil yang rapih.
Pakai sebelum `web-research` atau playbook `market-research` dimulai. Tanpa brief, scope sering bocor di tengah jalan.

## Variables

- `{{topic_one_line}}` — string. Topik riset dalam satu kalimat, fokus pada yang mau diketahui.
- `{{research_question_primary}}` — string. Pertanyaan utama yang harus dijawab laporan. Bentuk pertanyaan, bukan pernyataan.
- `{{why_now}}` — string. Kenapa riset ini relevan sekarang — keputusan apa yang menunggu hasilnya (2-4 kalimat).
- `{{decision_to_inform}}` — string. Keputusan konkret yang akan diambil setelah laporan jadi (mis. "go/no-go masuk pasar logistik B2B").
- `{{audience}}` — string. Siapa yang akan baca laporan ini — board, tim produk, regulator, atau internal sendiri.
- `{{scope_in}}` — string. Apa yang masuk scope. Topik, segmen, sub-pertanyaan yang wajib dijawab.
- `{{scope_out}}` — string. Apa yang sengaja dikeluarkan dari scope. Ini melindungi dari topic creep.
- `{{time_period}}` — string. Rentang waktu data yang relevan (mis. "2020 - sekarang", "5 tahun terakhir").
- `{{geography}}` — string. Geografi yang dicakup (mis. "Indonesia", "ASEAN minus Singapura", "global dengan fokus emerging market").
- `{{source_preference}}` — string. Tipe sumber yang diutamakan (mis. "paper akademik + laporan regulator > reporting media").
- `{{language_preference}}` — string. Bahasa sumber yang dipakai (mis. "Bahasa Indonesia + English", "tambah Mandarin kalau ada laporan industri China").
- `{{output_format}}` — string. Format akhir laporan: `brief-memo` / `executive-summary` / `full-report`.
- `{{output_length_target}}` — string. Target panjang akhir (mis. "1 halaman", "5-8 halaman").
- `{{deadline}}` — string. Tanggal + jam laporan harus siap (WIB).
- `{{checkpoint_preference}}` — string. Kapan customer mau diajak review sebelum laporan final — mis. "setelah source set terkumpul", "tidak perlu, langsung final".
- `{{budget_constraint}}` — string. Batasan tool atau sumber berbayar yang boleh dipakai (mis. "tidak ada akses paywall", "bisa pakai langganan customer untuk Statista").

## Template

---
template: research-brief
language: id
register: kamu
purpose: scope-lock pre-playbook
---

# Research Brief

**Topik:** {{topic_one_line}}

---

## Pertanyaan utama

{{research_question_primary}}

## Kenapa sekarang

{{why_now}}

## Keputusan yang menunggu hasil riset

{{decision_to_inform}}

## Audience laporan

{{audience}}

---

## Scope

**Masuk scope:**
{{scope_in}}

**Keluar scope:**
{{scope_out}}

## Parameter data

| Dimensi | Nilai |
|---|---|
| Periode | {{time_period}} |
| Geografi | {{geography}} |
| Bahasa sumber | {{language_preference}} |
| Sumber yang diutamakan | {{source_preference}} |

## Output yang diharapkan

- **Format:** {{output_format}}
- **Panjang target:** {{output_length_target}}
- **Deadline:** {{deadline}}
- **Checkpoint review:** {{checkpoint_preference}}

## Catatan operasional

{{budget_constraint}}

---

> Brief ini di-lock sebelum riset dimulai. Perubahan scope di tengah jalan akan didokumentasi di catatan riset, bukan diam-diam ditampung di laporan.

## Tone guide

Brief ini bukan customer-facing copy — ini dokumen kerja antara customer dan Deep Researcher. Bahasa Indonesia, kamu form, tidak ada tanda seru. Setiap field harus terjawab dengan satu kalimat atau satu list pendek; field yang dijawab "terserah" atau "fleksibel" wajib di-push balik sebelum brief dianggap selesai. Brief yang lemah sebabkan riset yang melebar.
