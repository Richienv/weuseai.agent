# Template — Caption Shopee Live / TikTok Shop

> Dipakai `post-drafter` saat customer punya listing produk di Shopee atau TikTok Shop dan butuh caption yang conversion-optimized untuk e-commerce Indonesia. Pakai bahasa konversi Indonesia: "Diskon X% pakai voucher Y", "Gratis ongkir minimal pembelian Z", "Cashback A%", "Garansi 1 tahun". Mengikuti Permendag 31/2023 disclosure requirements: harga, stok, deskripsi akurat.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{produk_name}` | ya | Nama produk lengkap |
| `{harga_normal}` | ya | Harga sebelum diskon, IDR formatted dengan titik thousand (`Rp 250.000`) |
| `{harga_diskon}` | tidak | Harga setelah diskon (kalau ada promo) |
| `{voucher_code}` | tidak | Kode voucher kalau promo butuh redemption |
| `{ongkir_terms}` | tidak | "Gratis ongkir minimal Rp X", atau "Subsidi ongkir 50%" |
| `{cashback_pct}` | tidak | Persentase cashback (mis. "5%") |
| `{garansi_terms}` | tidak | "Garansi resmi 1 tahun", "Garansi toko 7 hari" |
| `{stok_terbatas_flag}` | tidak | True kalau stok rendah — trigger urgency line |
| `{platform}` | ya | `shopee_live` / `tiktok_shop` / `shopee_listing` |

---

## Template

### Untuk Shopee Live / TikTok Shop (live streaming caption)

```
{produk_name} — {short_value_prop_one_line}.

HARGA:
- Normal: ~~Rp {harga_normal}~~
- Promo: Rp {harga_diskon}

PROMO HARI INI:
- Diskon {diskon_pct}% pakai voucher {voucher_code}
- {ongkir_terms}
- Cashback {cashback_pct} ShopeePay / TikTok Saldo
- {garansi_terms}

{stok_urgency_line_if_low}

Klik keranjang kuning buat order langsung.
```

### Untuk Shopee Listing (product description / caption)

```
{produk_name}

{produk_description_2_3_lines}.

SPESIFIKASI:
- {spec_1}
- {spec_2}
- {spec_3}

PROMO:
- Harga normal: Rp {harga_normal}
- Promo: Rp {harga_diskon} (hemat Rp {selisih})
- Voucher: {voucher_code} (klaim di toko)
- {ongkir_terms}

GARANSI:
- {garansi_terms}

CARA ORDER:
1. Klik "Beli Sekarang"
2. Pilih variasi (kalau ada)
3. Klaim voucher {voucher_code} di halaman checkout
4. Bayar via ShopeePay / Transfer / COD
```

---

## Contoh terisi

### Shopee Live (skincare lokal, harga Rp 180.000)

```
Serum Brightening Vitamin C 30ml — kulit lebih cerah dalam 14 hari.

HARGA:
- Normal: ~~Rp 180.000~~
- Promo: Rp 99.000

PROMO HARI INI:
- Diskon 45% pakai voucher SERUM45
- Gratis ongkir minimal pembelian Rp 100.000
- Cashback 5% ShopeePay
- Garansi resmi BPOM, exp 2028

Stok cuma 30 buah lagi buat malam ini.

Klik keranjang kuning buat order langsung.
```

### TikTok Shop (case HP, harga Rp 75.000)

```
Case iPhone 15 Anti-Crack Premium — proteksi 360 derajat.

HARGA:
- Normal: ~~Rp 75.000~~
- Promo: Rp 39.000

PROMO HARI INI:
- Diskon 48% pakai voucher CASE48
- Gratis ongkir tanpa minimum
- Cashback 3% TikTok Saldo
- Garansi toko 7 hari (tukar baru kalau cacat)

Stok cuma 50 buah, dulu-duluan.

Klik keranjang kuning buat order langsung.
```

### Shopee Listing (sepatu lokal, harga Rp 350.000)

```
Sepatu Sneakers Pria — Local Brand Bandung

Bahan kulit sintetis premium, sol karet anti-slip, design minimalis cocok untuk daily wear maupun semi-formal. Tersedia warna hitam, putih, navy. Size 39-44.

SPESIFIKASI:
- Bahan upper: Kulit sintetis premium
- Sol: Karet TPR anti-slip
- Berat: 320 gram (size 42)

PROMO:
- Harga normal: Rp 350.000
- Promo: Rp 249.000 (hemat Rp 101.000)
- Voucher: SEPATU101 (klaim di toko)
- Gratis ongkir minimal pembelian Rp 200.000

GARANSI:
- Garansi toko 14 hari (tukar size atau warna gratis)

CARA ORDER:
1. Klik "Beli Sekarang"
2. Pilih warna dan size
3. Klaim voucher SEPATU101 di halaman checkout
4. Bayar via ShopeePay / Transfer / COD
```

---

## Reference packet — E-commerce Indonesia compliance

### Permendag 31/2023 (Perdagangan Melalui Sistem Elektronik) — disclosure requirements

- **Identitas pelaku usaha:** nama toko, alamat operasional, kontak — wajib di profile toko (bukan harus di caption tiap produk, tapi caption tidak boleh contradict)
- **Harga jelas:** harga akhir yang dibayar, termasuk pajak. Tidak boleh "harga mulai dari" tanpa specify untuk varian mana
- **Stok akurat:** kalau caption bilang "stok 30 buah", database harus reflect actual count. Tidak boleh urgency-fake
- **Deskripsi produk akurat:** spesifikasi, bahan, dimensi sesuai produk asli. Tidak boleh exaggerate
- **Garansi jelas:** kalau caption tulis "garansi 1 tahun", terms harus tertulis di toko (apa yang covered, cara klaim)
- **Promo terms:** voucher code, periode promo, syarat redemption — tulis lengkap, tidak boleh hidden T&C

### Bahasa konversi Indonesia (recommended)

| Indonesian phrase | English equivalent | When to use |
|---|---|---|
| "Diskon X% pakai voucher Y" | "X% off with code Y" | Promo with voucher |
| "Gratis ongkir minimal Rp X" | "Free shipping over X" | Subsidized shipping |
| "Cashback X% ShopeePay / TikTok Saldo" | "X% cashback" | Wallet rebate |
| "Garansi resmi X tahun" | "X-year official warranty" | Brand-issued warranty |
| "Garansi toko X hari" | "X-day store warranty" | Reseller-issued return |
| "Klik keranjang kuning" / "Klik Beli Sekarang" | "Click cart" / "Click Buy Now" | Direct action |
| "COD tersedia" | "Cash on delivery available" | Payment option |
| "Stok terbatas, dulu-duluan" | "Limited stock, first come first served" | Genuine urgency (verify stock) |
| "Resi otomatis update" | "Tracking auto-updates" | Logistics |

### Format harga Indonesia (wajib)

- IDR formatted dengan titik thousand: `Rp 99.000`, `Rp 1.250.000`, `Rp 15.000.000`
- Bukan: `Rp99000`, `Rp 99,000` (koma adalah desimal di BI), `IDR 99000`
- Diskon: format `~~Rp 180.000~~` → `Rp 99.000` (strikethrough harga normal)

### Voucher code convention

- All caps, alphanumeric: `SERUM45`, `BELI3GRATIS1`, `HEMAT20K`
- Relevan ke promo (bukan random string)
- Tulis lengkap di caption — copy-paste friendly untuk pelanggan

---

## Tone guide — E-commerce Indonesia

- **Direct + actionable:** caption produk e-commerce bukan untuk story-telling panjang. Audience scroll untuk decide beli atau tidak — kasih info yang butuh untuk decide
- **IDR formatting konsisten:** titik thousand. Selalu cek format sebelum publish — typo angka di e-commerce = customer complaint
- **CTA spesifik:** "Klik keranjang kuning" (Shopee) / "Klik Beli Sekarang" (TikTok Shop) — pelanggan Indonesia sudah terbiasa dengan instruksi UI ini
- **Urgency wajib jujur:** "Stok 30 buah" hanya boleh kalau actual count 30. Permendag + reputation risk
- **Spesifikasi singkat:** 3-5 bullet, bukan paragraf. Audience scan, bukan baca
- **Garansi terms transparan:** "Garansi toko 7 hari" beat "Garansi terjamin". Specific term build trust
- **Zero exclamation marks:** termasuk di urgency line. Calm-premium register, even di sales context

---

## BANNED di caption Shopee / TikTok Shop (jangan pakai sama sekali)

- `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`
- Exclamation marks (zero)
- Caps lock berlebih ("MURAH BANGET BURUAN ORDER")
- Frase yang exaggerate / phishing-like: "MENANG JACKPOT", "DAPAT HADIAH JUTAAN", "GRATIS 100%"
- Stok urgency fake (Permendag 31/2023 violation + Shopee/TikTok Shop seller suspension risk)
- "Best seller no. 1 di Indonesia" tanpa data sumber (klaim superlatif yang tidak bisa di-back)
- Voucher code yang tidak active (frustrasi pelanggan + complaint cycle)

---

## Validation rules (skill-side)

- IDR amount harus formatted titik thousand (`Rp X.XXX.XXX`) — auto-flag kalau pakai koma desimal atau no separator
- Voucher code wajib disebutkan ulang di "PROMO" section kalau ada
- Stok urgency line hanya boleh kalau `stok_terbatas_flag = true` (mengindikasikan actual low stock)
- Garansi terms wajib jelas (durasi + scope) kalau disebutkan
- Spesifikasi 3-5 bullet max
- Caption Shopee Live ≤200 karakter (audience baca cepat di mobile)
- Caption Shopee Listing ≤1500 karakter (audience baca di product detail page)
- Voice-fit score sebelum publish
