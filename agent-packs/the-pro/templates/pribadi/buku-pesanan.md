# Buku pesanan / PO

Tracker semua pesanan dan pre-order yang harus disiapkan. Hidup di `/var/lib/weuseai/data/pribadi/buku-pesanan.md`. Pesanan dengan tanggal ambil/kirim otomatis muncul di briefing pagi mulai H-1.

| Masuk | Pemesan | Kontak | Pesanan | Jumlah (Rp) | DP (Rp) | Ambil/kirim | Status |
|---|---|---|---|---|---|---|---|
| 2026-07-15 | Bu Rina | 0813xxxxxx | 50 kotak snack rapat | 750.000 | 250.000 | 2026-07-19 pagi | disiapkan |

Status: `baru` → `disiapkan` → `siap` → `selesai`. Batal tulis `batal` + alasan, jangan hapus baris.

## Aturan pemakaian

- Pesanan baru dari chat atau voice note: aku catat ke sini, bacakan ulang isinya, kamu konfirmasi benar.
- H-1 sebelum tanggal ambil/kirim: aku ingatkan di briefing pagi plus satu pesan siang.
- DP dan pelunasan dicatat juga ke buku kas lewat `tools/kas.py` supaya laporan keuangan tetap satu pintu.
- Sisa tagihan pesanan `selesai` yang belum lunas pindah ke buku piutang.
