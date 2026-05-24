# Template — Brief UGC creator (Indonesia)

Brief untuk engage creator UGC (user-generated content) Indonesia. Tone: peer-to-peer yang respectful, bukan hierarchy "talent-for-hire". Payment IDR dengan breakdown jelas (script fee, production fee, usage rights), usage rights duration eksplisit (default 6 bulan in-platform + 3 bulan out-of-platform), do's & don'ts yang fit ke konteks creator Indonesia.

Brief ini dikirim ke creator sebelum kontrak ditandatangani — supaya creator bisa decide fit/no-fit di depan, bukan setelah produksi.

---

## Variables

- `{brand_name}` — string. Nama brand client.
- `{campaign_name}` — string. Internal campaign label.
- `{creator_name}` — string. Nama / handle creator.
- `{creator_handle}` — string. @username platform utama.
- `{platform}` — enum. `TikTok` | `Instagram Reels` | `YouTube Shorts` | `multi-platform`.
- `{video_duration_sec}` — int. 15 / 30 / 60 / 90.
- `{deliverable_count}` — int. Jumlah video.
- `{script_fee_idr}` — int. Rupiah, format titik (e.g., `500.000`).
- `{production_fee_idr}` — int. Rupiah.
- `{usage_rights_fee_idr}` — int. Rupiah.
- `{total_fee_idr}` — int. Rupiah, total.
- `{usage_in_platform_months}` — int. Default `6`.
- `{usage_out_of_platform_months}` — int. Default `3`. `0` kalau in-platform only.
- `{deadline_date}` — date. Tanggal kirim final.
- `{revision_round}` — int. Default `2`.

---

## Production notes

### Tone framing — peer-to-peer

- Brief ditulis seolah-olah ngomong ke kolaborator, bukan ke kontraktor. Hindari "talent diharapkan", "talent wajib" — pakai "kita berdua sepakat", "kamu yang pegang kreatif".
- Creator Indonesia biasanya **multi-role**: dia editor sendiri, scriptwriter sendiri, kadang sound designer sendiri. Brief harus respect itu — kasih ruang untuk kreatif input, bukan dictate frame-by-frame.

### Payment convention Indonesia

- **Currency: IDR**. Format titik untuk ribuan (`500.000`, `1.250.000`, `5.000.000`). Jangan pakai koma untuk thousand separator — itu di Indonesia dipakai untuk decimal.
- **Breakdown wajib**, bukan lump-sum. Creator paham value-nya per komponen:
  - Script fee — kompensasi proses ideation + scripting
  - Production fee — kompensasi proses shoot + edit
  - Usage rights fee — kompensasi hak pakai brand
- **Term pembayaran**: 50% di kontrak signed, 50% di delivery final + revisi clear. Bukan "net-30 setelah invoice" — itu agency convention yang nggak fit creator UGC.
- **Pajak**: kalau invoice di atas Rp 4.500.000 setahun, sebut PPh Pasal 21 / 23 di brief — brand atau creator yang motong, jelasin di kontrak.

### Usage rights — explicit, time-bounded

- **In-platform** = posting di akun brand di platform yang sama dengan akun creator. Default 6 bulan.
- **Out-of-platform** = posting di platform lain (brand IG dipake video TikTok, ads di YouTube, dst.). Default 3 bulan, bisa di-extend dengan extra fee.
- **Paid ads boost** = kalau brand mau pakai video buat paid ads, fee terpisah (umumnya +30-50% dari production fee). Sebut eksplisit di brief.
- **Whitelisting / dark posting** = kalau brand mau run ads dari akun creator sendiri (spark ads, partnership ads di Reels), fee terpisah + creator approval per ad copy.

### Do's & don'ts kalibrasi Indonesia

| Do | Don't |
|----|-------|
| Pakai BI casual, register sesuai brand (kalau brand premium, casual-warm; kalau brand mass, lebih playful) | Jangan code-switch BI-EN berlebihan kalau audience-nya bukan urban Jakarta |
| Mention brand secara natural, biasanya di second-half video | Hard-sell di hook 3 detik — bikin video di-skip cepat |
| CTA disesuaikan platform (TikTok: "Save", IG: "Share ke story", YouTube: "Komen di bawah") | CTA generic "subscribe and like" — itu register YouTube US, bukan TikTok-ID |
| Attribution: tag @creator + @brand di caption | Hide attribution atau pakai branded hashtag yang ngubur creator |
| Disclosure: tulis `#ads` atau `[Iklan]` atau `dalam kerjasama dengan {brand}` di caption — UU Perlindungan Konsumen + ASEAN advertising standards | Disclosure di kolom komen atau di-edit-in setelah viral — pelanggaran UU |
| Respect waktu shalat — jangan schedule shoot di waktu Maghrib / Isya tanpa break | Schedule shoot full-day tanpa ngecek waktu ibadah talent |
| Boleh humor — humor adalah bahasa creator Indonesia | Jangan joke tentang agama, ras, suku, kelas sosial — sensitive area, bukan ruang humor |
| Boleh referensi pop culture lokal (idol Indonesia, sinetron, makanan daerah) | Jangan paksa referensi US/EU pop culture kalau creator-nya nggak natural pakai itu |
| Politik = neutral. Brand statement boleh, tapi positioning politik partai = no | Statement politik partai / capres / pilpres dilarang |

### Attribution convention

- Caption format: `[copy konten] · @creator_handle | @brand_handle · #ads #campaignhashtag`
- Tag in-video: di end card atau first 3 detik. Jangan di-bury di mid-video.
- Sound credit: kalau pakai sound dari creator lain, kredit di caption.

---

## Template

```
BRIEF KOLABORASI UGC — {campaign_name}

Brand:           {brand_name}
Creator:         {creator_name} ({creator_handle})
Platform:        {platform}
Durasi video:    {video_duration_sec} detik
Jumlah deliverable: {deliverable_count} video

────────────────────────────────────────
1. KONTEKS BRAND + GOAL CAMPAIGN
────────────────────────────────────────
<3-5 kalimat singkat soal brand, audience yang dituju, dan goal campaign — bukan brand book lengkap, bukan PowerPoint>

Kenapa kita ngundang kamu spesifik:
<1-2 kalimat — alasan jujur. Bukan "karena kamu influencer keren", tapi "karena video edukasi kamu soal X resonates dengan target audience kita yang Y">

────────────────────────────────────────
2. CREATIVE DIRECTION (ringan, kamu yang pegang)
────────────────────────────────────────
Tone:            <calm-warm / playful-conversational / educational / dst.>
Format:          <talking head / voiceover / day-in-the-life / tutorial / dst.>
Mandatory beats:
  - <hal yang wajib disebut — biasanya nama product + 1 benefit utama>
  - <CTA spesifik yang brand mau>
Optional beats (rekomendasi, kamu boleh adjust):
  - <hook angle saran>
  - <visual reference, kalau ada>

Yang KAMU pegang penuh:
  - Hook + body script (kamu yang nulis, kita review)
  - Editing style, music, transition
  - Caption + hashtag mix

────────────────────────────────────────
3. DO'S & DON'TS
────────────────────────────────────────
DO:
- <list spesifik — disesuaikan ke campaign>
- Mention {brand_name} secara natural
- Tag @{brand_handle} di caption + first 3 detik in-video
- Disclosure: tulis `dalam kerjasama dengan {brand_name}` atau `#ads` di caption

DON'T:
- Joke tentang agama, ras, suku, kelas sosial
- Statement politik partai / pilpres / pemilu
- Bandingin brand kita dengan kompetitor secara negatif
- Pakai music yang nggak punya lisensi
- Hide attribution atau disclosure

────────────────────────────────────────
4. PAYMENT — BREAKDOWN IDR
────────────────────────────────────────
Script fee:           Rp {script_fee_idr}
Production fee:       Rp {production_fee_idr}
Usage rights fee:     Rp {usage_rights_fee_idr}
─────────────────────────────────────────
TOTAL:                Rp {total_fee_idr}

Term:
- 50% di kontrak signed
- 50% di delivery final + revisi clear

Pajak: PPh Pasal 21 dipotong brand (kalau invoice > Rp 4.500.000/tahun)

────────────────────────────────────────
5. USAGE RIGHTS — TIME-BOUNDED
────────────────────────────────────────
In-platform (akun {brand_name} di {platform}):
  {usage_in_platform_months} bulan dari tanggal post

Out-of-platform (cross-post ke platform brand lain):
  {usage_out_of_platform_months} bulan dari tanggal post pertama
  (Set ke 0 kalau in-platform only)

Paid ads boost:
  Fee terpisah, +30-50% dari production fee. Quote ulang sebelum boost.

Whitelisting / spark ads dari akun {creator_handle}:
  Fee terpisah + approval per ad creative. Quote ulang sebelum on.

Setelah masa usage rights habis, brand wajib turunin post atau renegotiate.

────────────────────────────────────────
6. TIMELINE
────────────────────────────────────────
Kontrak signed:        <tanggal>
Script draft ke brand: <tanggal — kamu yang kirim>
Brand feedback:        <tanggal — max 48 jam after draft>
Shoot day:             <tanggal — kamu yang atur>
First cut ke brand:    <tanggal>
Revisi (max {revision_round} round): <window>
Final delivery:        {deadline_date}
Post-date:             <tanggal post>

────────────────────────────────────────
7. ASSET HANDOFF
────────────────────────────────────────
- Final mp4 (1080×1920 vertical, H.264, 30fps)
- Caption draft (TXT atau Notes)
- Hashtag list (3-5 utama, optional 5-10 niche)
- Cover thumbnail (kalau platform require)
- Raw footage (opsional, kalau brand request — extra fee)

────────────────────────────────────────
8. KONTAK
────────────────────────────────────────
Project lead:    <nama + WhatsApp>
Brand approver:  <nama + email>
Issue / blocker: WhatsApp dulu, baru email.
```

---

## Tone guide

- Brief ini **kontrak emosional**, bukan cuma kontrak legal. Kalau creator merasa di-respect dari brief, kualitas video naik. Kalau dia merasa di-treat as vendor, output-nya safe-mode.
- Payment breakdown wajib eksplisit. Creator Indonesia sering kena underpay karena lump-sum tanpa breakdown — brief yang transparent ini bikin trust.
- "Yang KAMU pegang penuh" section penting. Itu yang ngebedain UGC dari "scripted ad with influencer face". UGC = creator's voice, brand's product, both win.
- Disclosure non-negotiable. UU ITE + UU Perlindungan Konsumen Indonesia jelas — undisclosed paid post itu liability buat brand dan creator.
- Politik dan agama bukan ruang creative — bukan karena sensor, karena itu bukan tempat brand main. Brief eksplisit nge-prevent missteps di kemudian hari.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di brief copy.
