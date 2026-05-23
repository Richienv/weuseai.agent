# Template — Kuitansi Resmi (Konvensi Indonesia)

Kuitansi penerimaan pembayaran sesuai konvensi Indonesia, dengan slot materai Rp 10.000 untuk transaksi di atas Rp 5 juta.
Audience: penerima pembayaran yang butuh bukti penerimaan tertulis untuk arsip atau bukti pajak — UMKM, freelancer, jasa professional, sewa-menyewa, jual-beli barang tunai.
Pakai untuk transaksi tunai / transfer yang butuh bukti formal selain invoice (mis. pelunasan, uang muka, retur dana, honor).

> **DRAFT — BUKAN NASIHAT HUKUM.** Template ini mengikuti konvensi umum kuitansi di Indonesia (UU Bea Materai Nomor 10 Tahun 2020 jo. PP 86/2021). Untuk transaksi bernilai tinggi atau yang menjadi alat bukti dalam perkara hukum, **wajib direview oleh advokat / kuasa hukum bersertifikat** sebelum digunakan.

## Variables

- `{{kuitansi_number}}` — string. Nomor kuitansi (mis. `001/KW/V/2026`).
- `{{kuitansi_date_id}}` — string. Tanggal pembuatan format Indonesia (mis. `22 Mei 2026`).
- `{{kuitansi_city}}` — string. Kota tempat kuitansi dibuat.
- `{{payer_name}}` — string. Nama yang membayar (pihak yang dimaksud "Telah terima dari").
- `{{payer_address}}` — string. Alamat pembayar (opsional).
- `{{amount_words_id}}` — string. Nilai dieja dalam Bahasa Indonesia (mis. `Lima juta lima ratus ribu Rupiah`).
- `{{amount_numeric_id}}` — string. Nilai angka format Indonesia (mis. `Rp 5.500.000,-`).
- `{{payment_purpose}}` — string. Untuk pembayaran apa (deskriptif, 1-2 kalimat).
- `{{payment_method}}` — string. Cara pembayaran (mis. `Transfer Bank BCA`, `Tunai`, `QRIS`, `GoPay`).
- `{{payment_reference}}` — string. Nomor referensi transaksi (mis. nomor invoice yang dilunasi, nomor mutasi bank).
- `{{recipient_name}}` — string. Nama penerima uang.
- `{{recipient_title}}` — string. Jabatan / kapasitas penerima (mis. `Direktur PT Maju Bersama`, `Pemilik`, `Freelancer`).
- `{{recipient_npwp_or_nik}}` — string. NPWP atau NIK penerima.
- `{{materai_required}}` — boolean string. `true` atau `false` — apakah nominal >Rp 5.000.000 (wajib materai).
- `{{kuitansi_amount_box}}` — string. Nilai nominal dalam kotak khusus (biasanya disorot besar, sama dengan `{{amount_numeric_id}}`).

## Template

---
template: kuitansi-resmi
language: id
register: formal-receipt
jurisdiction: indonesia
---

```
═══════════════════════════════════════════════════════════════
                          KUITANSI
═══════════════════════════════════════════════════════════════
```

**Nomor:** {{kuitansi_number}}

| | |
| --- | --- |
| **Telah terima dari** | : {{payer_name}} |
| **Alamat** | : {{payer_address}} |
| **Uang sejumlah** | : **{{amount_words_id}}** |
| **Untuk pembayaran** | : {{payment_purpose}} |
| **Cara pembayaran** | : {{payment_method}} |
| **Nomor referensi** | : {{payment_reference}} |

---

> **Jumlah:** **{{kuitansi_amount_box}}**

---

{{kuitansi_city}}, {{kuitansi_date_id}}

Yang menerima,

<br>

`[ Tempat tempel Materai Rp 10.000 — wajib jika nominal > Rp 5.000.000 sesuai UU 10/2020 ]`

<br>

**{{recipient_name}}**
{{recipient_title}}
NPWP/NIK: {{recipient_npwp_or_nik}}

---

### Catatan Bea Materai

Kuitansi dengan nominal **di atas Rp 5.000.000,- (lima juta Rupiah)** wajib dibubuhi Bea Materai Rp 10.000 sesuai
Pasal 3 ayat (2) huruf a Undang-Undang Nomor 10 Tahun 2020 tentang Bea Materai. Materai dapat berupa:

- Materai tempel Rp 10.000 (fisik), ditandatangani sebagian di atas materai
- Materai elektronik (e-Meterai) untuk dokumen digital, sesuai PP Nomor 86 Tahun 2021

Kuitansi tanpa materai untuk nominal yang diwajibkan tetap sah sebagai bukti penerimaan, namun tidak dapat digunakan sebagai alat bukti di pengadilan tanpa pemeteraian kemudian (denda 200% dari nilai materai yang seharusnya).

---

### Catatan Akuntansi

Kuitansi ini menjadi bukti penerimaan dari sisi penerima (memorial penerimaan kas).
Pembayar wajib menyimpan salinan untuk bukti pengeluaran. Untuk transaksi B2B antara dua badan usaha PKP,
kuitansi ini tidak menggantikan faktur pajak — faktur pajak diterbitkan terpisah sesuai PER-03/PJ/2022.

## Tone guide

Register formal-receipt — konvensi kuitansi Indonesia. Pakai frasa baku: "Telah terima dari", "Uang sejumlah", "Untuk pembayaran", "Yang menerima". Penulisan nominal: ejaan kapital di baris "Uang sejumlah" (mis. `Lima juta lima ratus ribu Rupiah`), angka di kotak khusus (mis. `Rp 5.500.000,-`). Format Rupiah: titik sebagai pemisah ribuan, koma sebagai pemisah desimal, akhiri dengan `,-` setelah nol. Slot materai harus eksplisit, bukan diasumsikan. Tanggal format Indonesia (`22 Mei 2026`, bukan `2026-05-22` atau `May 22, 2026`). Tidak ada tanda seru. Tidak ada emoji. Tidak ada kontraksi.

> _Catatan customer: untuk transaksi >Rp 5jt, PASTIKAN tempel materai sebelum tanda tangan. Kuitansi e-Meterai untuk dokumen digital tersedia di [https://meterai-elektronik.com](https://meterai-elektronik.com) (operator PERURI). Simpan kuitansi minimal 10 tahun untuk kepentingan pajak — sesuai Pasal 28 ayat (11) UU KUP._
