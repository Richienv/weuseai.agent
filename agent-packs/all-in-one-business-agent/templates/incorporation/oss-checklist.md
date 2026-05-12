# OSS-RBA Checklist

> OSS = Online Single Submission Risk-Based Approach. Portal: oss.go.id. Wajib untuk semua badan usaha Indonesia post-2021.

---

## Step-by-step

### 1. Akun OSS
- Daftar di **oss.go.id** dengan NIK + email aktif
- Verifikasi email
- Login → pilih "Perseorangan / Badan Usaha"

### 2. Pilih KBLI (Klasifikasi Baku Lapangan Usaha Indonesia)
KBLI adalah kode 5-digit untuk kategorize aktivitas usaha. Contoh umum:
- `47919` — Perdagangan eceran via internet (e-commerce / D2C)
- `62012` — Aktivitas pengembangan aplikasi (SaaS / app dev)
- `70209` — Konsultasi manajemen (consulting / agency)
- `56101` — Restoran / kafe
- `47711` — Perdagangan eceran pakaian (fashion retail)
- `90019` — Aktivitas hiburan lainnya (creator / content)

**Tip:** Bisa pilih lebih dari 1 KBLI. Pilih yang mencerminkan **revenue stream utama** dulu, secondary KBLI optional.

Search KBLI lengkap di [oss.go.id/informasi/kbli-berbasis-risiko].

### 3. Tingkat risiko (auto-determined dari KBLI)

| Tingkat | Yang dibutuhkan | Contoh KBLI |
|---|---|---|
| **Rendah (R)** | NIB cukup. Auto-issued. | E-commerce, konsultan, jasa creative |
| **Menengah Rendah (MR)** | NIB + Sertifikat Standar (self-declare) | Restoran skala kecil, retail |
| **Menengah Tinggi (MT)** | NIB + Sertifikat Standar (verifikasi pemerintah) | Manufaktur ringan, food production |
| **Tinggi (T)** | NIB + Izin (verifikasi + lapangan) | Pertambangan, fintech, healthtech, broadcasting |

Mayoritas UMKM digital tier Rendah → setup ngga ribet.

### 4. Submit dokumen pendukung

**Common documents (semua tingkat risiko):**
- Akta pendirian PT/CV (kalau badan)
- NPWP badan
- KTP semua pemegang saham / sekutu
- NPWP semua pemegang saham
- Surat domisili kantor (kalau diminta — kebanyakan opsional sejak 2021)

**Tambahan untuk tingkat MR/MT/T:**
- Standar produk / proses (ISO, SNI, kalau applicable)
- Tata letak / lay-out fasilitas
- Dokumen lingkungan (UKL-UPL untuk MT, AMDAL untuk T)
- Dokumen K3 (Keselamatan & Kesehatan Kerja)

### 5. Submit + tunggu NIB issued
- Tingkat Rendah: NIB issued **instant** (auto)
- Tingkat MR: 1-3 hari kerja
- Tingkat MT/T: 7-30 hari kerja, plus verifikasi lapangan

### 6. Print NIB + simpan
NIB jadi identitas tunggal — pakai untuk:
- Buka rekening bank badan
- Submit pengadaan / tender
- Apply ke marketplace (Tokopedia Power Merchant, Shopee Mall, dll.)
- Apply pembiayaan bank / KUR

### 7. Verifikasi dokumen pendukung (90 hari)
**Penting:** setelah NIB terbit, kamu wajib **submit dokumen pendukung lengkap dalam 90 hari** lewat OSS. Kalau lewat, NIB bisa di-suspend.

Yang biasa di-submit di tahap ini:
- Akta pendirian + SK Kemenkumham
- NPWP badan asli
- Bukti modal disetor (kalau PT)
- Surat keterangan domisili (kalau diminta region tertentu)

---

## Common gotchas

1. **Salah pilih KBLI** → tingkat risiko mismatch dengan business reality. Fix: edit KBLI di OSS, NIB regenerate.
2. **NPWP badan belum terbit waktu submit OSS** → blok. Solusi: urus NPWP dulu di kantor pajak (1-3 hari).
3. **Domisili rumah dipakai** → boleh untuk UMKM digital, tapi beberapa region (Jakarta Selatan, Jakarta Pusat) minta surat persetujuan RT/RW.
4. **Pemegang saham WNA** → butuh KITAS / KITAP + dokumen tambahan. Tingkat risiko bisa berubah.
5. **Sektor regulated (fintech, healthtech, broadcasting)** → OSS tidak cukup. Butuh izin sektoral terpisah (OJK, BPOM, Kominfo).

---

## Estimated timeline (UMKM digital, tingkat Rendah)

```
Day 0:  Akta PT/CV ditandatangani notaris
Day 1:  SK Kemenkumham terbit (kalau PT)
Day 2:  NPWP badan terbit
Day 3:  Submit OSS — pilih KBLI, isi data
Day 3:  NIB issued (instant kalau tingkat Rendah)
Day 4:  Buka rekening bank badan dengan NIB + akta + NPWP
Day 7:  Submit dokumen pendukung di OSS
Day 90: Deadline verifikasi — done.
```

Total ~1 minggu kalau lancar, sampai ke first transaction.

---

## Kalau stuck

- **Helpdesk OSS:** 1500 100 (jam kerja)
- **OSS Telegram:** @kbli_oss_bot (info KBLI cepat)
- **Notaris** kamu biasanya bisa bantu submit OSS — tanya quote.

---

> _Catatan: rules OSS berubah berkala. Verifikasi terbaru di oss.go.id sebelum submit. Untuk industri regulated, konsultasi dengan konsultan hukum yang familiar sektor kamu._
