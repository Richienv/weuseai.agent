# Template — Pricing table tiered (IDR)

Pricing table tiga tier dengan IDR formatting konvensi Indonesia (titik thousand, tanpa desimal), monthly/yearly toggle yang default ke monthly (preferensi cash-flow audiens Indonesia), badge "Paling Populer" (bukan "Most Popular" — translate ke bahasa lokal), dan FAQ section yang jawab concern khas Indonesia: PPN, e-faktur, refund per UU Perlindungan Konsumen.

## Variables

- `{tier_1_name}`, `{tier_2_name}`, `{tier_3_name}` — nama tier (contoh: "Pemula", "Pro", "Studio") (string).
- `{tier_1_price_monthly_idr}`, `{tier_2_price_monthly_idr}`, `{tier_3_price_monthly_idr}` — harga bulanan IDR integer, contoh `99000` (integer).
- `{tier_1_price_yearly_idr}`, `{tier_2_price_yearly_idr}`, `{tier_3_price_yearly_idr}` — harga tahunan IDR integer (biasanya 10x bulanan = hemat 2 bulan) (integer).
- `{tier_1_tagline}`, `{tier_2_tagline}`, `{tier_3_tagline}` — satu kalimat siapa yang cocok di tier ini (string).
- `{tier_1_features[]}`, `{tier_2_features[]}`, `{tier_3_features[]}` — 5-7 fitur per tier sebagai array of string, hasil (bukan teknis).
- `{tier_1_cta_label}`, `{tier_2_cta_label}`, `{tier_3_cta_label}` — label tombol per tier, contoh "Pilih Pemula" (string).
- `{tier_1_cta_url}`, `{tier_2_cta_url}`, `{tier_3_cta_url}` — URL checkout per tier (string).
- `{popular_tier_index}` — tier mana yang dapat badge, nilai `1`, `2`, `3`, atau `null` (integer | null).
- `{popular_badge_label}` — label badge, default "Paling Populer" (string).
- `{ppn_included}` — apakah harga sudah termasuk PPN 11%, boolean.
- `{currency_symbol}` — selalu "Rp" (string, locked).
- `{guarantee_days}` — window garansi refund dalam hari, contoh `7` atau `14` (integer).
- `{wa_support_e164}` — nomor WhatsApp untuk pertanyaan pricing (string).

## Page structure

### Toggle monthly/yearly (default: monthly)

Toggle di atas table, monthly selected default. Jangan toggle yearly default — audiens Indonesia mayoritas (terutama UMKM dan pekerja) cash-flow bulanan, lihat angka tahunan dulu langsung scroll out.

```html
<div class="billing-toggle">
  <button class="active" data-period="monthly">Bayar Bulanan</button>
  <button data-period="yearly">Bayar Tahunan <span class="saving">Hemat 2 bulan</span></button>
</div>
```

### Tier cards

Tiga card horizontal di desktop, stack vertical di mobile. Tier yang dapat badge `{popular_badge_label}` punya border warna accent dan badge di pojok atas.

```html
<div class="pricing-grid">
  <!-- Tier 1 -->
  <div class="tier-card">
    <h3 class="tier-name">{tier_1_name}</h3>
    <p class="tier-tagline">{tier_1_tagline}</p>
    <p class="tier-price">
      <span class="currency">Rp</span>
      <span class="amount" data-monthly="{tier_1_price_monthly_idr_formatted}" data-yearly="{tier_1_price_yearly_idr_formatted}">
        {tier_1_price_monthly_idr_formatted}
      </span>
      <span class="period">/bulan</span>
    </p>
    <p class="ppn-note">
      <!-- if ppn_included: -->Sudah termasuk PPN 11%
      <!-- else: -->Belum termasuk PPN 11%
    </p>
    <ul class="features">
      <!-- 5-7 baris dari tier_1_features[] -->
    </ul>
    <a href="{tier_1_cta_url}" class="cta">{tier_1_cta_label}</a>
  </div>

  <!-- Tier 2 dengan badge -->
  <div class="tier-card tier-featured">
    <span class="popular-badge">{popular_badge_label}</span>
    <!-- struktur sama seperti tier 1 -->
  </div>

  <!-- Tier 3 -->
  <div class="tier-card">
    <!-- struktur sama -->
  </div>
</div>
```

### Format harga IDR

- Titik sebagai thousand separator: `Rp 99.000`, bukan `Rp 99,000`.
- Tanpa desimal: `Rp 99.000`, bukan `Rp 99.000,00`.
- Spasi setelah `Rp`: `Rp 99.000`, bukan `Rp99.000`.
- Untuk harga juta: `Rp 1.290.000` atau bisa singkat `Rp 1,29 juta` (dengan koma desimal, sesuai konvensi BI).
- Untuk harga ribuan, hindari "Rp 99rb" di pricing table (OK di hero copy, jangan di card). "Rp 99.000" lebih clear di context komparasi tier.

### PPN clarity

UMKM di Indonesia banyak yang sudah PKP (Pengusaha Kena Pajak — omzet > Rp 4.8 miliar setahun) dan butuh tagihan dengan PPN terpisah untuk e-faktur. Setiap tier harus eksplisit:
- Kalau `ppn_included` true: "Sudah termasuk PPN 11%"
- Kalau false: "Belum termasuk PPN 11% (PKP saja)"

Jangan biarin ambigu — itu cara cepat ditanya ulang berkali-kali via WhatsApp.

### Badge convention

Pakai bahasa Indonesia, bukan English:
- "Paling Populer" (bukan "Most Popular")
- "Pilihan Founder" (bukan "Founder's Pick")
- "Hemat 30%" (bukan "Save 30%")
- "Cocok untuk UMKM" (bukan "Best for SMB")

Satu badge per table — kalau dua tier dapat badge, audiens bingung mana yang dipilih, conversion drop.

### FAQ section — Indonesia-specific

Minimal 6 pertanyaan, jawab tuntas:

**1. Bayar pakai apa?**
> Kamu bisa bayar pakai QRIS (paling cepat), e-wallet (OVO, DANA, GoPay, LinkAja, ShopeePay), Virtual Account (BCA, Mandiri, BRI, BNI), atau kartu kredit Visa/Mastercard. Semua diproses Xendit dengan koneksi terenkripsi.

**2. Harga sudah termasuk PPN?**
> [Sesuai `ppn_included`]. Untuk PKP yang butuh tagihan terpisah dengan PPN, kontak kami via WhatsApp sebelum bayar — kami siapkan invoice formal.

**3. Bisa dapat e-faktur?**
> Iya, kalau bisnismu sudah berbadan usaha (PT, CV, atau perseorangan dengan NPWP). E-faktur otomatis dikirim ke email dalam 1×24 jam setelah pembayaran. UMKM non-PKP cukup dapat invoice biasa (PDF, bukan e-faktur Coretax).

**4. Kalau nggak cocok, bisa refund?**
> Iya, dalam {guarantee_days} hari setelah pembayaran, sesuai UU Perlindungan Konsumen 8/1999. Refund diproses ke metode pembayaran asal dalam 7-14 hari kerja. Chat WhatsApp untuk inisiasi refund — tidak ada potongan biaya kalau dalam window garansi.

**5. Bisa upgrade atau downgrade?**
> Iya, kapan saja. Kalau upgrade, biaya pro-rata untuk sisa periode billing. Kalau downgrade, aktif di periode billing berikutnya — sisa kredit periode berjalan tetap valid sampai habis.

**6. Cara berhenti langganan?**
> Klik "Berhenti Langganan" di dashboard, atau chat WhatsApp. Berhenti efektif di akhir periode billing — tidak ada auto-charge berikutnya. Tidak ada biaya cancellation.

### Strip jaminan bawah

```html
<div class="guarantee-strip">
  <p>
    Garansi {guarantee_days} hari uang kembali (UU Perlindungan Konsumen 8/1999).
    Pertanyaan lain?
    <a href="https://wa.me/{wa_support_e164}">Chat WhatsApp</a>
  </p>
</div>
```

## Integration notes

### IDR formatter

```javascript
function formatIDR(amount) {
  // Indonesian convention: dot as thousand separator, no decimals
  return amount.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
// 99000 → "99.000"
// 1290000 → "1.290.000"
// Use as: `Rp ${formatIDR(99000)}` → "Rp 99.000"
```

### Toggle behavior

```javascript
const toggleBtns = document.querySelectorAll('.billing-toggle button')
const amounts = document.querySelectorAll('.tier-price .amount')
const periods = document.querySelectorAll('.tier-price .period')

toggleBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    toggleBtns.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    const period = btn.dataset.period
    amounts.forEach((el) => {
      el.textContent = period === 'monthly'
        ? el.dataset.monthly
        : el.dataset.yearly
    })
    periods.forEach((el) => {
      el.textContent = period === 'monthly' ? '/bulan' : '/tahun'
    })
  })
})
```

### UU Perlindungan Konsumen reference

Mencantumkan "UU Perlindungan Konsumen 8/1999" di FAQ refund adalah signal trust — banyak landing page asing tidak melakukan ini, audiens Indonesia tahu bedanya. Jangan klaim refund yang lebih ketat dari yang diatur UU (misal "tidak ada refund setelah 24 jam") karena itu bisa di-challenge konsumen.

### PPN realita Maret 2025+

PPN Indonesia naik dari 11% jadi 12% per 1 Januari 2025 (UU HPP), tapi pemerintah revisi cuma ke barang mewah — barang umum tetap efektif 11% (DPP 11/12). Untuk template ini, default copy pakai "PPN 11%" — kalau produk kamu masuk kategori barang mewah konsultasi pajak dulu sebelum publish.

### E-faktur konteks

E-faktur via Coretax DJP (live 2025) untuk PKP. UMKM non-PKP tidak butuh e-faktur — invoice PDF biasa cukup. Jangan janjikan e-faktur kalau bisnis kamu sendiri bukan PKP atau belum integrate Coretax.

## Tone guide

- Bahasa Indonesia, `kamu` form.
- Harga format konsisten: `Rp 99.000` (spasi, titik thousand, no decimal).
- Tagline tier sebut siapa yang cocok: "Buat freelancer yang baru mulai" bukan "Entry-level".
- Fitur tulis sebagai hasil: "Bisa setup di 10 menit" bukan "Quick onboarding".
- FAQ pakai pertanyaan yang beneran ditanyain audiens UMKM Indonesia, bukan promosi terselubung.
- Refund copy konkret dengan jangka waktu + dasar hukum.
- Zero exclamation marks. Satu badge per table maksimum.
