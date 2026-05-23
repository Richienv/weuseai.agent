# Template — Surat Keterangan Domisili Usaha (untuk OSS-RBA)

Template Surat Keterangan Domisili Usaha (SKDU) untuk keperluan registrasi NIB di OSS-RBA atau dokumen perizinan usaha lainnya.
Audience: pelaku usaha mikro, kecil, atau menengah yang sedang mengurus NIB / OSS / dokumen perizinan, dan butuh keterangan domisili dari kelurahan/desa setempat.
Pakai untuk: pengajuan NIB OSS-RBA, pembukaan rekening usaha bank, registrasi BPJS Ketenagakerjaan, pendaftaran NPWP Badan.

> **DRAFT — TEMPLATE BANTUAN.** Template ini adalah kerangka draft untuk diisi dan dibawa ke kelurahan/desa setempat — **bukan dokumen yang sah tanpa stempel dan tanda tangan Lurah/Kepala Desa**. SKDU yang sah hanya bisa diterbitkan oleh kelurahan/desa di mana usaha berdomisili. Untuk DKI Jakarta, SKDU sudah tidak diwajibkan untuk NIB sejak 2019 (cukup pernyataan mandiri di OSS); tetap dibutuhkan di banyak daerah lain. **Cek kebijakan kelurahan setempat sebelum menggunakan template ini.**

## Variables

- `{{skdu_number}}` — string. Nomor surat yang dikeluarkan kelurahan (mis. `503/045/IV/2026`). Diisi kelurahan, bukan pemohon.
- `{{kelurahan_name}}` — string. Nama kelurahan / desa (mis. `Menteng`).
- `{{kecamatan_name}}` — string. Nama kecamatan.
- `{{kota_kabupaten_name}}` — string. Nama kota atau kabupaten.
- `{{provinsi_name}}` — string. Nama provinsi.
- `{{lurah_name}}` — string. Nama Lurah / Kepala Desa.
- `{{lurah_nip}}` — string. NIP Lurah (untuk ASN).
- `{{owner_name}}` — string. Nama pemilik usaha sesuai KTP.
- `{{owner_nik}}` — string. NIK pemilik (16 digit).
- `{{owner_birth_place}}` — string. Tempat lahir pemilik sesuai KTP.
- `{{owner_birth_date}}` — string. Tanggal lahir format Indonesia (`12 Maret 1990`).
- `{{owner_gender}}` — string. `Laki-laki` / `Perempuan`.
- `{{owner_nationality}}` — string. Kewarganegaraan (default `Indonesia (WNI)`).
- `{{owner_religion}}` — string. Agama (sesuai KTP).
- `{{owner_occupation}}` — string. Pekerjaan (mis. `Wiraswasta`).
- `{{owner_residential_address}}` — string. Alamat tempat tinggal sesuai KTP.
- `{{owner_rt_rw}}` — string. RT/RW alamat tempat tinggal (mis. `005/008`).
- `{{business_name}}` — string. Nama usaha (mis. `Warung Kopi Mahardika`).
- `{{business_type}}` — string. Jenis usaha (mis. `Perdagangan makanan dan minuman`, `Jasa konsultasi IT`).
- `{{business_kbli_code}}` — string. Kode KBLI 2020 yang relevan (mis. `56303 — Restoran/Rumah Makan`).
- `{{business_address}}` — string. Alamat tempat usaha (lengkap).
- `{{business_rt_rw}}` — string. RT/RW tempat usaha.
- `{{business_start_date}}` — string. Tanggal mulai berusaha di lokasi tersebut.
- `{{purpose_of_skdu}}` — string. Tujuan diterbitkan (mis. `Pengurusan NIB melalui OSS-RBA`, `Pembukaan rekening usaha`).
- `{{issue_date_id}}` — string. Tanggal penerbitan format Indonesia.

## Template

---
template: surat-keterangan-domisili-usaha-template
language: id
register: formal-government
jurisdiction: indonesia
status: DRAFT-FOR-KELURAHAN-ISSUANCE
---

> **CATATAN PENTING:** Dokumen ini adalah **draft pengantar** untuk dibawa ke kelurahan/desa setempat. SKDU yang sah harus diterbitkan, distempel basah, dan ditandatangani oleh Lurah/Kepala Desa.

---

```
═══════════════════════════════════════════════════════════════
            PEMERINTAH KOTA/KABUPATEN {{kota_kabupaten_name}}
                  KECAMATAN {{kecamatan_name}}
                  KELURAHAN {{kelurahan_name}}
       Alamat: [diisi alamat kantor kelurahan setempat]
═══════════════════════════════════════════════════════════════
```

# SURAT KETERANGAN DOMISILI USAHA

**Nomor:** {{skdu_number}}

Yang bertanda tangan di bawah ini, Lurah {{kelurahan_name}}, Kecamatan {{kecamatan_name}}, Kota/Kabupaten {{kota_kabupaten_name}}, Provinsi {{provinsi_name}}, dengan ini menerangkan bahwa:

| | |
| --- | --- |
| **Nama** | : {{owner_name}} |
| **NIK** | : {{owner_nik}} |
| **Tempat / Tanggal Lahir** | : {{owner_birth_place}}, {{owner_birth_date}} |
| **Jenis Kelamin** | : {{owner_gender}} |
| **Kewarganegaraan** | : {{owner_nationality}} |
| **Agama** | : {{owner_religion}} |
| **Pekerjaan** | : {{owner_occupation}} |
| **Alamat Tempat Tinggal** | : {{owner_residential_address}}, RT/RW {{owner_rt_rw}}, Kelurahan {{kelurahan_name}}, Kecamatan {{kecamatan_name}}, Kota/Kabupaten {{kota_kabupaten_name}} |

Adalah benar warga Kelurahan {{kelurahan_name}}, dan saat ini menjalankan kegiatan usaha dengan rincian sebagai berikut:

| | |
| --- | --- |
| **Nama Usaha** | : {{business_name}} |
| **Jenis Usaha** | : {{business_type}} |
| **KBLI 2020** | : {{business_kbli_code}} |
| **Alamat Usaha** | : {{business_address}}, RT/RW {{business_rt_rw}}, Kelurahan {{kelurahan_name}}, Kecamatan {{kecamatan_name}}, Kota/Kabupaten {{kota_kabupaten_name}} |
| **Tanggal Mulai Berusaha** | : {{business_start_date}} |

Surat keterangan ini diberikan untuk keperluan: **{{purpose_of_skdu}}**, dan berlaku selama yang bersangkutan menjalankan usaha di alamat tersebut atau sampai dengan adanya perubahan domisili usaha yang dilaporkan kembali kepada kelurahan.

Demikian Surat Keterangan ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.

---

Dikeluarkan di : {{kelurahan_name}}
Pada tanggal   : {{issue_date_id}}

**LURAH {{kelurahan_name}}**

<br><br><br>

`[ Tanda tangan & stempel basah Lurah ]`

<br>

**{{lurah_name}}**
NIP: {{lurah_nip}}

---

### Lampiran wajib (dibawa ke kelurahan)

1. Fotokopi KTP pemohon (1 lembar)
2. Fotokopi Kartu Keluarga (1 lembar)
3. Pas foto pemohon berwarna 3x4 (2 lembar) — jika diminta
4. Surat pengantar RT/RW setempat (asli + 1 fotokopi)
5. Bukti kepemilikan / sewa tempat usaha (sertifikat / PBB / surat sewa)
6. Foto tempat usaha (tampak depan, dalam ruangan)
7. Materai Rp 10.000 (1 lembar) — untuk surat pernyataan domisili jika diminta

### Dasar hukum + konteks regulasi

- **Permendagri Nomor 19 Tahun 2018** tentang Peningkatan Kualitas Layanan Lurah dan Camat — dasar kewenangan Lurah menerbitkan SKDU.
- **PP Nomor 5 Tahun 2021** tentang Penyelenggaraan Perizinan Berusaha Berbasis Risiko (OSS-RBA) — sejak 2021, NIB untuk UMK risk-rendah cukup dengan pernyataan mandiri tanpa SKDU. Namun banyak kelurahan, bank, dan instansi lain masih meminta SKDU sebagai dokumen pendukung.
- **UU Nomor 20 Tahun 2008** tentang Usaha Mikro, Kecil, dan Menengah — kategori UMKM berdasarkan omzet dan aset.
- **Permendagri Nomor 137 Tahun 2017** tentang Kode dan Data Wilayah Administrasi Pemerintahan — referensi penulisan nama wilayah (kelurahan/desa/kecamatan/kota).

### Catatan kebijakan per daerah

- **DKI Jakarta**: SKDU sudah tidak diwajibkan untuk NIB sejak 2019 — cukup pernyataan mandiri di OSS. Tetap diminta beberapa bank untuk pembukaan rekening usaha.
- **Daerah lain**: kebijakan bervariasi — beberapa kelurahan menerbitkan dalam 1-3 hari kerja, beberapa minta retribusi PERDA setempat. Cek dulu sebelum datang.
- **Usaha di rumah (home-based)**: alamat usaha boleh sama dengan alamat tinggal, asalkan tidak menggangu lingkungan dan dapat persetujuan tertulis dari RT/RW.

## Tone guide

Register **formal pemerintahan Bahasa Indonesia**. Pakai kata baku administrasi sipil: "Yang bertanda tangan di bawah ini", "dengan ini menerangkan bahwa", "untuk dapat dipergunakan sebagaimana mestinya". Pakai struktur tabel dua-kolom untuk data identitas — konvensi standar surat keterangan. Identifikasi pejabat lengkap dengan NIP. Tidak ada kontraksi. Tidak ada tanda seru. Tidak ada emoji.

> _Catatan customer: kalau kelurahan kamu punya format SKDU sendiri (banyak kelurahan punya template baku), pakai format kelurahan — template ini hanya pengantar. Bawa semua lampiran lengkap supaya nggak balik-balik. Surat pengantar RT/RW biasanya gratis tapi RT/RW kadang minta sumbangan sukarela (Rp 20-50rb). SKDU kelurahan umumnya gratis sesuai PP 60/2016, tapi cek apakah ada retribusi PERDA setempat._
