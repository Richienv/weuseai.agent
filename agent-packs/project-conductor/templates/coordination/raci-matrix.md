# Template — RACI matrix

Dipakai untuk memetakan tanggung jawab di project lintas-team — siapa Responsible, siapa Accountable, siapa Consulted, siapa Informed per task. Audiens: project lead, team yang terlibat, dan stakeholder yang punya peran di alur kerja. Dipasang di awal project sebelum eksekusi dimulai, lalu di-revisit kalau scope berubah signifikan.

## Variables

- `{{project_name}}` — string, nama project
- `{{matrix_owner}}` — string, nama orang yang menjaga matrix ini tetap up to date
- `{{set_date}}` — string, tanggal matrix di-set
- `{{role_definitions}}` — markdown table, definisi R/A/C/I dalam konteks project ini. Format: `| Kode | Arti | Definisi singkat |`. Biasanya 4 baris standar
- `{{matrix_table}}` — markdown table, grid task × orang. Format kolom: `| Task / Deliverable | Person 1 | Person 2 | Person 3 | ... |`. Tiap sel diisi `R`, `A`, `C`, `I`, atau kosong. Satu task hanya boleh punya satu `A`
- `{{escalation_path}}` — markdown bullet list, eskalasi kalau ada konflik R-A — siapa yang dihubungi, dengan urutan
- `{{review_cadence}}` — string, kapan matrix di-review ulang (mis. "Bulanan, minggu pertama bulan berikutnya")

## Template

# RACI matrix — {{project_name}}

**Owner matrix:** {{matrix_owner}}
**Di-set:** {{set_date}}
**Review cadence:** {{review_cadence}}

## Definisi peran

{{role_definitions}}

Standar RACI:

| Kode | Arti | Definisi singkat |
|------|------|------------------|
| **R** | Responsible | Yang mengerjakan task — eksekusi langsung |
| **A** | Accountable | Yang bertanggung jawab atas hasil — satu orang per task |
| **C** | Consulted | Yang konsultasi sebelum keputusan diambil — komunikasi dua arah |
| **I** | Informed | Yang dikabari setelah keputusan diambil — komunikasi satu arah |

## Matrix

{{matrix_table}}

## Eskalasi

{{escalation_path}}

## Kesalahan umum yang harus dihindari

- **Dua orang Accountable di satu task.** Tidak ada dua kursi A di satu baris. Kalau dua orang merasa accountable, salah satu sebenarnya Responsible, atau task itu sebenarnya dua task terpisah yang perlu dipecah.
- **Tiap sel diisi Consulted.** Kalau semua orang Consulted di semua task, sebenarnya tidak ada yang Consulted — itu jadi spam koordinasi. Consulted hanya untuk orang yang outputnya benar-benar dipakai sebelum keputusan diambil.
- **Tidak ada Responsible di satu baris.** Kalau satu task hanya punya A, C, dan I tanpa R, task itu tidak akan dikerjakan. A boleh sama dengan R kalau orang yang sama eksekusi sekaligus accountable, tapi R wajib ada.
- **Accountable di setiap baris untuk orang yang sama.** Kalau satu orang Accountable untuk semua task, itu bukan RACI — itu single-person project. Sebar A sesuai struktur kepemilikan asli.
- **Matrix dibuat sekali lalu ditinggal.** Scope project bergeser; matrix harus ikut bergeser. Kalau matrix tidak di-revisit di milestone besar, ia jadi dokumen mati.

## Tone guide

Matrix RACI adalah dokumen tata kelola, bukan dokumen kerja harian — gunakan ia di awal untuk mengeluarkan asumsi tentang siapa-melakukan-apa dari kepala orang ke kertas. Tiap sel adalah keputusan, bukan tag default. Kalau pengisian sel terasa otomatis ("ya, dia juga Consulted"), kemungkinan besar matrix-nya kembung — sederhanakan. Ukuran sehat: 5-15 baris task dengan 4-8 orang. Lebih dari itu, project terlalu besar untuk satu matrix dan perlu dipecah per fase. Tidak ada exclamation mark; bahasa tetap netral karena matrix ini akan dibaca lintas-fungsi yang punya konteks beda.
