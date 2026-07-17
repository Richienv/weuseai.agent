# Buku piutang

Ledger append-only semua tagihan yang belum lunas. Hidup di `/var/lib/weuseai/data/tagih/piutang.md` — salin format ini saat mulai. Satu baris satu tagihan. Status: `belum`, `sebagian`, `lunas`, `macet`.

| Tanggal | Nama | Kontak | Keterangan | Jumlah (Rp) | Jatuh tempo | Status | Terakhir ditagih | Catatan |
|---|---|---|---|---|---|---|---|---|
| 2026-07-10 | Bu Sari | 0812xxxxxx | 2 lusin donat acara arisan | 240.000 | 2026-07-20 | belum | - | janji bayar setelah gajian |

## Aturan pemakaian

- Tagihan baru = baris baru. Tagihan lunas = ubah status jadi `lunas`, jangan hapus barisnya.
- Kolom `Terakhir ditagih` di-update tiap kali pengingat terkirim — dari sini nada template berikutnya dipilih.
- Yang muncul di laporan pagi: jatuh tempo H-1, hari-H, dan semua yang lewat tempo.
