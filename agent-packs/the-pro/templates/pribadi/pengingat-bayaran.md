# Pengingat bayaran rutin

Daftar tagihan rutin yang tidak boleh telat. Hidup di `/var/lib/weuseai/data/pribadi/pengingat-bayaran.md`. Muncul di briefing pagi mulai H-2 sebelum jatuh tempo.

| Bayaran | Jumlah (Rp) | Jatuh tempo | Cara bayar | Terakhir dibayar |
|---|---|---|---|---|
| Listrik token / pascabayar | {perkiraan} | tiap tanggal {n} | {aplikasi/loket} | {tanggal} |
| Sewa kios / kontrakan | {jumlah} | tiap tanggal {n} | transfer ke {tujuan} | {tanggal} |
| Cicilan {nama} | {jumlah} | tiap tanggal {n} | {cara} | {tanggal} |
| Iuran sekolah anak | {jumlah} | tiap tanggal {n} | {cara} | {tanggal} |
| Kas RT / arisan | {jumlah} | tiap tanggal {n} | {cara} | {tanggal} |

## Aturan pemakaian

- Aku mengingatkan; kamu yang membayar. Aku tidak pernah mengeksekusi pembayaran apa pun.
- Setelah kamu bilang "sudah dibayar", aku update kolom `Terakhir dibayar` dan catat ke buku kas sebagai pengeluaran.
- Bayaran yang lewat tempo tanpa konfirmasi naik ke bagian atas briefing pagi sampai beres.
