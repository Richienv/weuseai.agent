# Template — Landing app launch (Indonesia)

Landing untuk peluncuran aplikasi mobile yang menyasar pasar Indonesia. Prioritas store badges disesuaikan share device Indonesia: Play Store paling pertama (Android dominan ~85% share), App Store kedua, AppGallery (Huawei) opsional untuk audiens yang lebih spesifik (Huawei punya basis loyal di kota-kota tertentu). Hero copy pakai pattern "Sekarang di Indonesia" atau "Khusus warga Indonesia" yang resonan dengan audiens lokal.

## Variables

- `{app_name}` — nama aplikasi (string).
- `{tagline}` — satu kalimat tagline app, 8-15 kata (string).
- `{hero_screenshot_url}` — URL screenshot HP utama, ratio 9:19.5 (modern phone) atau 9:16 (string).
- `{launch_status}` — `pre-launch`, `soft-launch`, atau `live` (enum).
- `{launch_region}` — `nasional`, `jabodetabek-only`, atau nama kota spesifik (string).
- `{playstore_url}` — URL Play Store listing, format `https://play.google.com/store/apps/details?id=...` (string).
- `{appstore_url}` — URL App Store listing, format `https://apps.apple.com/id/app/...` (string).
- `{appgallery_url}` — URL Huawei AppGallery, opsional (string).
- `{download_link_short}` — short link universal yang detect device dan redirect ke store yang tepat, contoh `app.namabrand.id/get` (string).
- `{wa_support_e164}` — WhatsApp support, format E.164 tanpa plus (string).
- `{app_size_mb_android}` — ukuran APK dalam MB (integer).
- `{app_size_mb_ios}` — ukuran iOS app dalam MB (integer).
- `{min_android_version}` — Android minimum, contoh `8.0` (string).
- `{min_ios_version}` — iOS minimum, contoh `14.0` (string).
- `{permissions_requested}` — array izin yang diminta app, contoh `["Lokasi (untuk fitur X)", "Kamera (untuk scan QR)"]` (array of string).
- `{download_count}` — jumlah download kalau sudah live dan > 1000, integer (skip kalau di bawah ini).
- `{rating_play}` — rating Play Store, contoh `4.6` (number, 1 desimal).

## Page structure

### Hero

H1 dengan klaim hasil + lokalisasi:
- Pre-launch: "{app_name} segera hadir di Indonesia"
- Soft-launch: "{app_name} sekarang di {launch_region}"
- Live: "{app_name} untuk warga Indonesia"

Subhead: tagline + audiens spesifik. "Aplikasi pengelola keuangan untuk pekerja gig Indonesia. Bahasa Indonesia, harga lokal, tanpa langganan."

Visual hero: screenshot HP modern (notch/punch-hole, ratio 9:19.5). Mockup iPhone OK tapi tambah mockup Android sekitarnya — audiens Indonesia mayoritas Android.

### Download CTAs — Android-first

Urutan vertical atau horizontal:

1. **Play Store** (paling besar, di tengah atau pertama) — badge resmi dari Google
2. **App Store** (sama besar) — badge resmi dari Apple
3. **AppGallery** (lebih kecil, opsional) — kalau target audiens include pengguna Huawei

Selain badge store, tampilkan **link universal** (download via link) di atas badges:

```html
<div class="download-row">
  <p class="download-headline">Download sekarang</p>

  <p class="download-link-share">
    Atau bagikan link ini: <code>{download_link_short}</code>
    <button onclick="copyLink()">Salin</button>
  </p>

  <div class="store-badges">
    <a href="{playstore_url}">
      <img src="/assets/play-store-badge-id.png" alt="Dapatkan di Google Play" />
    </a>
    <a href="{appstore_url}">
      <img src="/assets/app-store-badge-id.svg" alt="Unduh di App Store" />
    </a>
    <!-- AppGallery opsional -->
    <a href="{appgallery_url}" class="appgallery-badge">
      <img src="/assets/appgallery-badge.png" alt="Tersedia di AppGallery" />
    </a>
  </div>

  <p class="download-via-link-note">
    Atau scan QR code di bawah ini — auto-deteksi device kamu.
  </p>
</div>
```

**Download via link convention:** audiens Indonesia sering install via share link di WhatsApp grup, bukan dari Play Store search. Bikin short link yang deteksi device dan auto-redirect — itu pattern yang dipakai aplikasi sukses lokal (Halodoc, Tokopedia, Gojek).

### Compatibility strip

Baris kecil di bawah CTAs:
- Android: minimum {min_android_version}, ukuran ~{app_size_mb_android} MB
- iOS: minimum {min_ios_version}, ukuran ~{app_size_mb_ios} MB
- Bahasa: Indonesia + English

Audiens Indonesia banyak yang pakai HP 2-3 tahun, jangan klaim "iOS terbaru saja" tanpa pikir — kalau minimum kamu iOS 16, jangan pasang badge App Store besar-besar tanpa kasih info ini.

### Permissions transparency section

Trust di Indonesia turun karena banyak app abal-abal minta izin berlebihan. Jelasin permissions di muka, sebelum download:

```
Aplikasi ini minta izin:
- Lokasi: hanya saat kamu pakai fitur cari toko terdekat
- Kamera: untuk scan QRIS pembayaran
- Notifikasi: untuk update status pesanan

Aplikasi ini TIDAK minta:
- Akses kontak
- Akses SMS
- Akses file di luar app
```

Section ini ngeluarin app dari kategori "aplikasi mencurigakan" di mata audiens UMKM dan ibu rumah tangga.

### Feature highlights — 3 outcome

Jangan list 10 feature. Pilih 3 outcome paling penting dengan screenshot setiap section:

1. **[Outcome 1]** — 1 paragraf + screenshot
2. **[Outcome 2]** — 1 paragraf + screenshot
3. **[Outcome 3]** — 1 paragraf + screenshot

### Social proof

Kalau sudah live dan punya angka:
- "Sudah didownload {download_count}+ kali di Play Store"
- "Rating {rating_play}/5 dari pengguna Indonesia"

Kalau pre-launch atau soft-launch dengan angka kecil:
- "Beta tester dari {launch_region}: testimoni Bu/Pak X dari {kota}"
- Link ke press coverage media Indonesia (Kontan, Daily Social, Tech in Asia ID) kalau ada

### Support section

Card kecil dengan:
- WhatsApp support button ke `wa.me/{wa_support_e164}`
- "Jam balasan: Senin-Jumat 09:00-18:00 WIB"
- Link ke FAQ + privacy policy + terms

### Footer

Wajib:
- Link ke privacy policy (UU PDP compliance — bahasa Indonesia versi)
- Link ke terms
- Contact (alamat fisik kalau berbadan usaha — Google Play sekarang require)
- Tulisan "Made in Indonesia" kalau memang dikembangkan tim lokal — itu signal yang resonan

## Integration notes

### Universal download link (smart redirect)

Pakai service kayak Firebase Dynamic Links (sunset 2025, cari alternatif), Branch.io, atau bikin sendiri di Cloudflare Worker:

```javascript
// edge worker pseudo
export default {
  async fetch(req) {
    const ua = req.headers.get('user-agent') || ''
    if (/android/i.test(ua)) {
      return Response.redirect('{playstore_url}', 302)
    }
    if (/iphone|ipad|ipod/i.test(ua)) {
      return Response.redirect('{appstore_url}', 302)
    }
    if (/huawei|honor/i.test(ua) && '{appgallery_url}') {
      return Response.redirect('{appgallery_url}', 302)
    }
    // Fallback: landing dengan badge semua store
    return Response.redirect('/download', 302)
  }
}
```

### Store badge assets

Pakai badge resmi dengan teks bahasa Indonesia:
- Play Store: "Dapatkan di Google Play" — download dari `play.google.com/intl/en_us/badges/`
- App Store: "Unduh di App Store" — download dari Apple Marketing Tools, locale ID
- AppGallery: badge dari Huawei Developer site

Jangan modif badge (resize OK, ganti warna nggak boleh) — itu trademark violation.

### App Store URL locale

Format URL Indonesia: `https://apps.apple.com/id/app/...`. Default ke `/id/` (Indonesia store) bukan `/us/`. Pricing dan rating yang tampil bakal Indonesia-specific.

### Play Store country

Play Store auto-deteksi country dari device. Tapi listing kamu di Play Console harus include Indonesia di country list dan store listing harus ada terjemahan ID. Tanpa itu, app nggak akan tampil di Play Store Indonesia.

### Permissions disclosure required

Google Play sejak 2022 mandat Data Safety section. Permissions di landing page harus konsisten dengan Data Safety di Play listing. Kalau di landing kamu klaim "tidak minta akses kontak" tapi di Data Safety include "Contacts", listing kamu bisa di-flag.

## Tone guide

- Bahasa Indonesia primary, `kamu` form.
- Hero copy: lokalisasi explicit. "Sekarang di Indonesia" atau "Khusus untuk warga Indonesia" — bukan generic "Available worldwide".
- Permissions section: jujur dan spesifik, bukan defensive marketing. Audiens skeptis berkurang kalau kamu transparan duluan.
- Store badge alt text: bahasa Indonesia ("Dapatkan di Google Play"), bukan English.
- Download instruction sederhana: "Klik badge → install → buka aplikasi" — audiens non-tech butuh handholding.
- Zero exclamation marks. Maks satu emoji per section (download section boleh ada arrow).
