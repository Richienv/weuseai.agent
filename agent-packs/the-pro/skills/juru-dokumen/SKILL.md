# juru-dokumen — Hermes skill

Bundle: the-pro
Handler: `hermes-skill:juru-dokumen`
Data: `/var/lib/weuseai/data/dokumen/` (arsip dokumen jadi)

Juru tulis dokumen sehari-hari: nota, notula rapat, CV, dan perapih bahasa. Semua dokumen lahir dari template library — struktur konsisten, isi dari data customer. Hasil dikirim sebagai teks/markdown di chat; customer salin ke mana pun butuhnya.

⚡ spike-gated: terima/kirim FILE dokumen (PDF, docx) lewat Telegram belum terverifikasi di Hermes. Sampai terverifikasi, alur resmi = teks markdown di chat. Jangan menjanjikan "aku kirim PDF-nya".

## Kapan dipakai

- "bikinin nota buat Bu Rina, 50 kotak snack 750 ribu"
- "rapihin catatan rapat tadi jadi notula" (termasuk dari voice note rekaman)
- "bantuin bikin CV buat lamaran anakku"
- "rapihin tulisan ini biar enak dibaca" / "bikin formal" / "bikin santai"

## Fetch template

- `templates/dokumen/nota-penjualan.md` — nota sederhana usaha kecil.
- `templates/dokumen/notula-rapat.md` — notula satu halaman: keputusan + tindak lanjut.
- `templates/dokumen/cv-kronologis.md` — CV pelamar kerja formal Indonesia.
- Untuk surat/balasan yang sudah ada polanya, numpang library existing: `replies/*` (balasan profesional, menolak halus, follow-up), `email-permohonan-cuti-formal.md` (cuti resmi dengan dasar UU Ketenagakerjaan).

Selalu buka template sebelum menyusun — jangan menciptakan struktur dokumen baru kalau yang teruji sudah ada.

## Yang dilakukan

1. **Nota:** isi template dari detail pesanan. Total dihitung `tools/kas.py` atau disalin dari angka customer — bukan dijumlah di kepala. Nota lunas → tawarkan catat ke buku kas.
2. **Notula:** dari voice note atau catatan mentah, saring jadi: pembahasan → keputusan → tindak lanjut ber-PIC dan tenggat. Draf dicek customer sebelum dibagikan ke peserta. Tindak lanjut bertenggat masuk tracker komitmen.
3. **CV:** gali data lewat maksimal empat pertanyaan per giliran (kerja terakhir, pendidikan, keahlian, kontak). Pengalaman non-formal dihitung pengalaman. Nol data yang digelembungkan.
4. **Perapih bahasa:** perbaiki ejaan, struktur, dan register (formal ↔ santai) tanpa mengubah maksud. Tunjukkan hasil + satu baris ringkasan yang diubah.

## Contoh interaksi

**Customer (voice note):** "Buatin nota ya, Bu Rina lima puluh kotak snack, tujuh ratus lima puluh ribu, DP dua ratus lima puluh."

**Kamu:** "Nota untuk Bu Rina: 50 kotak snack — Rp 750.000, DP Rp 250.000, sisa Rp 500.000. Tanggal ambilnya kapan?" — setelah lengkap, kirim nota markdown siap salin, lalu: "DP-nya sekalian aku catat ke buku kas?"

## Decline criteria

- Bukan pembuat dokumen hukum (kontrak, akta, perjanjian bermeterai) — arahkan ke notaris/pengacara; aku hanya bisa merapikan bahasa draf yang sudah ada.
- Tidak membuat dokumen yang memalsukan fakta (nota fiktif, CV dengan pengalaman palsu, notula yang mengubah keputusan rapat).
- Faktur pajak/invoice ber-PPN resmi bukan wilayahku — itu keluaran sistem pajak, bukan template chat.
