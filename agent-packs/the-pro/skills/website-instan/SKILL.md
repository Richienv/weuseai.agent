# website-instan — Hermes skill

Bundle: the-pro
Handler: `hermes-skill:website-instan`
Data: `/var/lib/weuseai/data/website/` (jawaban intake + file HTML jadi per situs)

Website satu halaman dalam satu percakapan: customer pilih jenis, jawab maksimal 4 pertanyaan, `tools/fill.py` mengisi template HTML self-contained (<30KB, mobile-first, nol aset eksternal). Deterministik — template yang menentukan tampilan, bukan improvisasi model.

⚡ spike-gated: serving lewat Caddy di VPS customer (plus arah domain) belum terverifikasi. File HTML dibuat dan disimpan sekarang; sampai spike serving lulus, sampaikan jujur bahwa file-nya sudah jadi di server dan cara online-nya menyusul lewat update sistem — jangan menjanjikan "langsung bisa diakses di internet".

## Kapan dipakai

- "aku pengen punya website buat usahaku"
- "bikinin menu digital buat di-scan di meja"
- "buatin link bio" / "buatin katalog online" / "undangan digital" / "CV online"
- "ganti harga di menu website" (re-generate dari jawaban tersimpan yang di-update)

## Fetch template

 8 template + 1 config di `templates/website/`:

| Template | Untuk |
|---|---|
| `umkm-profil.html` | profil usaha + tombol WhatsApp |
| `menu-qr.html` | daftar menu untuk QR di meja |
| `linkbio.html` | kumpulan link ala bio Instagram |
| `katalog.html` | katalog produk + harga |
| `undangan.html` | undangan acara |
| `cv-online.html` | CV yang bisa dibagikan sebagai link |
| `toko-sederhana.html` | daftar barang + order WhatsApp |
| `jasa.html` | daftar layanan + tarif |

`templates/website/config.json` = daftar pertanyaan per template (maksimal 4). Bertanya HANYA dari config itu, satu per satu — jangan menambah pertanyaan sendiri.

## Yang dilakukan

1. **Pilihkan jenis:** dari cerita customer, sebut 2 kandidat template paling cocok dengan satu kalimat alasan. Customer pilih.
2. **Intake:** ajukan pertanyaan dari `config.json` satu per satu (ramah voice note — customer boleh jawab suara, aku transkrip). Simpan jawaban ke `data/website/<slug>/jawaban.json`.
3. **Isi template via shell:**

```
BUNDLE="/var/lib/weuseai/bundle/the-pro/$(cat /var/lib/weuseai/bundle/the-pro/.installed-version)"
python3 "$BUNDLE/tools/fill.py" isi \
  --template "$BUNDLE/templates/website/menu-qr.html" \
  --jawaban /var/lib/weuseai/data/website/menu-warung/jawaban.json \
  --out /var/lib/weuseai/data/website/menu-warung/index.html
```

   fill.py meng-escape semua nilai dan menolak jawaban kurang — kalau exit 1, tanyakan field yang disebut di error.
4. **Tunjukkan hasil:** bacakan ringkasan isi halaman (judul, bagian, tombol) dalam tiga baris. Perubahan kecil ("ganti harga") = update `jawaban.json`, jalankan ulang fill.py — bukan edit HTML manual.
5. **Status online:** jelaskan status serving sesuai catatan spike-gated di atas. File selalu tersimpan aman di `data/website/`.

## Contoh interaksi

**Customer:** "Pengen bikin menu yang bisa discan di meja warung."

**Kamu:** "Cocoknya template menu QR. Empat pertanyaan saja. Pertama: nama warungnya apa?" — kumpulkan 4 jawaban, jalankan fill.py, lalu: "Menu digital Kopi Senja sudah jadi: 12 menu, tombol pesan WhatsApp aktif. Mau ubah sesuatu?"

## Decline criteria

- Tidak menulis HTML dari nol atau menambah bagian di luar template — perubahan besar = permintaan template baru, dicatat untuk founder, bukan diimprovisasi.
- Tidak memasukkan skrip, iframe, atau aset eksternal ke halaman.
- Tidak menjanjikan SEO, ranking Google, atau jumlah pengunjung.
- Konten halaman mengikuti aturan jujur yang sama dengan konten lain: nol klaim yang tidak bisa dibuktikan.
