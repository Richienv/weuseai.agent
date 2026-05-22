# Template — Risk register

Dipakai untuk mencatat risiko project secara terstruktur — apa risikonya, seberapa mungkin terjadi, seberapa besar dampaknya, mitigasi apa yang sudah dijalankan, siapa yang menjaganya. Audiens: project lead plus stakeholder yang punya leverage untuk membantu kalau risiko menjadi nyata. Di-review bareng status report mingguan.

## Variables

- `{{project_name}}` — string, nama project
- `{{register_owner}}` — string, nama orang yang menjaga register ini up to date
- `{{last_review_date}}` — string, tanggal review terakhir
- `{{next_review_date}}` — string, tanggal review berikutnya
- `{{risks_table}}` — markdown table, daftar risiko. Format kolom: `| ID | Risiko | Likelihood | Impact | RAG | Mitigasi | Owner | Status |`. Lihat tone guide untuk konvensi scoring
- `{{retired_risks}}` — markdown bullet list, risiko yang sudah ditutup atau tidak relevan lagi, plus alasan ditutup. Format per item: "**[ID]** — [Risiko singkat] · ditutup [tanggal] karena [alasan]"

## Template

# Risk register — {{project_name}}

**Owner:** {{register_owner}}
**Last review:** {{last_review_date}}
**Next review:** {{next_review_date}}

## Risiko aktif

{{risks_table}}

## Risiko yang sudah ditutup

{{retired_risks}}

## Konvensi scoring

### Likelihood — seberapa mungkin terjadi

- **Rendah** — kemungkinan kurang dari 20% sebelum project ditutup
- **Sedang** — kemungkinan 20-60%
- **Tinggi** — kemungkinan lebih dari 60%

### Impact — seberapa besar dampak kalau terjadi

- **Rendah** — delay kurang dari satu minggu atau biaya tambahan kurang dari 5% budget
- **Sedang** — delay 1-3 minggu atau biaya tambahan 5-15% budget
- **Tinggi** — delay lebih dari 3 minggu, biaya tambahan lebih dari 15% budget, atau outcome project terancam

### RAG status

- **Hijau** — likelihood rendah dan impact rendah, atau mitigasi sudah membuat risiko tidak material lagi
- **Kuning** — likelihood atau impact sedang, mitigasi sedang aktif dipantau
- **Merah** — likelihood dan impact keduanya tinggi, atau mitigasi belum cukup; butuh perhatian eksplisit di review berikutnya

### Status mitigasi

- **Open** — risiko diakui, mitigasi belum dimulai
- **Mitigating** — mitigasi sedang berjalan
- **Watching** — mitigasi sudah dilakukan, sekarang dipantau apakah cukup
- **Closed** — risiko sudah lewat atau dimitigasi cukup; pindah ke daftar retired

## Tone guide

Risk register adalah dokumen jujur, bukan dokumen pencitraan. Risiko yang nyata harus tercatat walau tidak nyaman — registry yang isinya semua hijau adalah sinyal proses, bukan sinyal project sehat. Tiap risiko wajib punya owner — risiko tanpa owner adalah risiko tanpa mitigasi. Mitigasi ditulis sebagai tindakan konkret, bukan niat ("Renita ngecek setiap Senin pagi" bukan "Akan dimonitor"). Likelihood dan impact pakai skala kualitatif (rendah/sedang/tinggi) karena scoring numerik 1-10 di project kecil cenderung jadi teater — semua jadi 7. Pindahkan risiko ke daftar retired begitu sudah lewat — register yang isinya 30 baris di mana 25-nya stale akan kehilangan otoritas. Zero exclamation marks; bahasa netral karena dokumen ini dibaca pelan-pelan.
