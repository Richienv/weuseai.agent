# Nota penjualan

Nota sederhana untuk usaha kecil — cukup untuk bukti transaksi dan arsip. Untuk invoice resmi ber-PPN, pakai jasa akuntan atau template invoice formal; ini bukan dokumen pajak.

---

**{NAMA USAHA}**
{alamat_singkat} · WA {nomor_wa}

NOTA No. {nomor — misal 2026-07-001}
Tanggal: {tanggal}
Kepada: {nama_pembeli}

| Barang/Jasa | Qty | Harga satuan | Jumlah |
|---|---|---|---|
| {item_1} | {qty} | Rp {harga} | Rp {subtotal} |
| {item_2} | {qty} | Rp {harga} | Rp {subtotal} |

Ongkir: Rp {ongkir}
**Total: Rp {total}**

Pembayaran: {tunai / transfer ke rekening}
Status: {LUNAS / DP Rp {nominal}, sisa Rp {nominal} jatuh tempo {tanggal}}

Terima kasih.

---

## Aturan pengisian

- Total dihitung `tools/kas.py` atau kalkulator — salin angkanya, jangan hitung di kepala.
- Nota LUNAS langsung dicatat ke buku kas sebagai pemasukan.
- Nota DP dicatat dua tempat: DP masuk ke kas, sisanya masuk buku piutang.
