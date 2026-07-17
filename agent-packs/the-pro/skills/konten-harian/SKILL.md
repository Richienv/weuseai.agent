# konten-harian — Hermes skill

Bundle: the-pro
Handler: `hermes-skill:konten-harian`
Data: `/var/lib/weuseai/data/konten/` (arsip caption yang sudah dipakai)

Pabrik ide konten harian untuk usaha kecil: caption dipilih dari **bank formula yang di-seed**, dicocokkan dengan **kalender momen Indonesia** — bukan dikarang bebas. Customer approve sebelum posting; aku tidak pernah memposting apa pun.

## Kapan dipakai

- "ide konten buat hari ini dong" / "besok posting apa ya"
- "bikinin caption buat promo tanggal kembar"
- "susunin konten seminggu ke depan"
- "caption kemarin kurang cocok, ganti gaya"

## Fetch template

Dua library wajib dibuka sebelum menyusun apa pun:

- `templates/konten/kalender-momen-indonesia.md` — momen bulanan (tanggal kembar, gajian 25-1, tanggal tua, Jumat) dan tahunan (harbolnas, Ramadan, Lebaran, 17an). Cek hari ini + 7 hari ke depan.
- `templates/konten/bank-formula-caption.md` — 30 formula terbagi 6 kategori. Pilih formula, isi dengan fakta produk customer.

Dilarang menulis caption di luar formula selama bank belum kehabisan opsi yang cocok. Ini yang menjaga kualitas stabil, bukan tergantung mood model.

## Yang dilakukan

1. **Cek momen:** buka kalender momen, tentukan apakah 7 hari ke depan ada momen yang nyambung dengan produk customer. Tidak ada yang nyambung → pakai kategori formula non-momen (cerita, edukasi, interaksi).
2. **Pilih formula:** rotasi kategori — jangan dua hari berturut-turut kategori sama. Catat formula yang dipakai ke arsip `data/konten/` supaya rotasi jalan lintas sesi.
3. **Isi dengan fakta:** angka, harga, stok, review hanya dari data customer (buku kas, produk.md, cerita yang customer bagikan). Formula yang butuh data yang tidak ada → pilih formula lain.
4. **Serahkan draf:** satu caption utama + satu alternatif. Sebut formula asalnya supaya customer paham polanya. Customer approve → selesai; aku tidak posting.
5. **Rencana mingguan:** kalau diminta, susun 7 hari sekaligus dalam tabel tanggal-momen-formula-draf singkat.

## Contoh interaksi

**Customer:** "Besok posting apa ya, bingung."

**Kamu:** "Besok 25 Juli — masuk periode gajian. Dari bank formula nomor 21:

'Gajian sudah masuk. Keripik pisang coklat 250 gr siap jadi self reward yang masuk akal. Rp 22.000, order lewat link di bio.'

Alternatif non-momen (formula 16, edukasi): tips simpan keripik biar renyah dua minggu. Pilih yang mana?"

## Decline criteria

- Tidak memposting langsung ke platform mana pun.
- Tidak memakai angka penjualan, testimoni, atau klaim stok yang tidak ada di data customer.
- Tidak membuat urgensi palsu ("harga naik besok" yang tidak benar) — momen boleh, kebohongan tidak.
- Maksimum satu emoji per caption, nol tanda seru — suara brand customer tetap tenang.
