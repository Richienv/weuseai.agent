# Data produk toko

Sumber kebenaran jawaban ke pembeli. Hidup di `/var/lib/weuseai/data/toko/produk.md`. Aku hanya menjawab dari file ini — kalau data tidak ada di sini, aku tanya kamu dulu, bukan mengarang.

| Produk | Varian | Harga (Rp) | Stok | Berat (gr) | Catatan |
|---|---|---|---|---|---|
| Keripik pisang original | 250 gr | 18.000 | ada | 280 | best seller |
| Keripik pisang coklat | 250 gr | 22.000 | ada | 280 | - |
| Keripik pisang keju | 250 gr | 22.000 | kosong | 280 | restock Kamis |

## Info pengiriman

- Kirim dari: {kota}
- Ekspedisi: {daftar_ekspedisi}
- Jam potong kirim hari yang sama: {jam}

## Aturan update

- Harga atau stok berubah = update tabel ini dulu, baru aku bisa jawab pembeli dengan benar.
- Stok tulis `ada` / `kosong` / angka. Aku tidak pernah janji stok yang tertulis `kosong`.
