# Template — Shot list dengan framing hijab-aware

Shot list untuk produksi video dengan talent Muslim Indonesia berhijab. Modesty di sini adalah **parameter kreatif**, sama seperti aspect ratio atau color palette — bukan story-line dan bukan label "konservatif". Framing kepala-dada preferred, lighting respects siluet hijab, varian shot dibedain per gaya hijab (segi empat, pashmina, instan) supaya editor dan DP nggak ngira-ngira.

---

## Variables

- `{project_name}` — string. Internal label.
- `{talent_name}` — string. Nama talent (untuk call sheet).
- `{hijab_style}` — enum. `segi-empat` | `pashmina` | `instan` | `bergo` | `khimar` — gaya hijab utama yang dipakai talent di shoot ini.
- `{shoot_date}` — date. Tanggal shoot.
- `{location}` — string. Studio / outdoor / rumah / kantor.
- `{aspect_ratio}` — enum. `9:16` | `16:9` | `1:1`.
- `{brand_register}` — enum. `fashion` | `lifestyle` | `corporate` | `edukasi` | `kuliner`.

---

## Production notes

### Framing default

- **Kepala-dada (medium close-up) preferred** sebagai default shot. Hijab dan baju atasan ke-frame bersih, body shape tidak ter-emphasis.
- **Full-body shot** boleh, tapi cek dulu: pakaian outer (cardigan, blazer, outer panjang) menutupi siluet pinggang dan pinggul. Kalau outer-nya skintight, ganti shot ke medium atau atur talent posisi ¾.
- **Close-up** ke wajah, mata, tangan — aman. Pastikan jilbab tidak terdorong masuk frame dengan cara yang ngerusak siluet (misal angin kena pashmina, hijab geser dari leher).
- **Over-the-shoulder** dari belakang talent — perhatikan: bagian belakang hijab dan pundak harus rapih ter-frame, bukan kerudung "kelipat" di tengkuk.

### Lighting yang respects siluet hijab

- **Soft key light** dari arah depan-samping (45°) preferred. Hard light dari atas bikin shadow tajam di garis hijab dan bisa keliatan harsh.
- **Rim light** dari belakang aman dan bagus — bikin garis hijab terlihat sebagai design element, bukan "bayangan". Hati-hati rim light yang terlalu terang di kain tipis (pashmina, syari) karena bisa ter-translucent.
- **Bounce fill** dari arah bawah (reflector putih atau dinding terang) buat ngurangin shadow di area dagu-leher — area ini sering ter-shadow karena hijab nahan cahaya.
- **Hindari** uplight (cahaya dari bawah) — bikin shadow naik ke jilbab dan ke wajah, hasilnya tidak flattering dan tidak fit ke register fashion/lifestyle Indonesia.

### Varian per gaya hijab

| Gaya hijab | Framing tip | Lighting tip |
|------------|-------------|--------------|
| Segi empat (square scarf, terlipat) | Sisakan headroom ekstra 10-15% — lipatan di puncak kepala butuh ruang. Side profile bagus karena lipatan terlihat sebagai garis. | Soft front-side. Hard light bikin lipatan kasar. |
| Pashmina (rectangular, drape) | Lebih flowy — handheld dengan micro-movement bisa keliatan organik. Watch out untuk angin yang ngubah drape antara take. | Rim light bagus, tapi jaga jarak — pashmina tipis bisa ter-translucent. |
| Instan (slip-on, fitted) | Tightest shape — close-up wajah paling aman. Medium shot rapih tanpa adjustment per take. | Standard 3-point setup works. |
| Bergo (lebih panjang, menutup dada) | Frame kepala-pinggang preferred — bergo natural nutupin dada, jadi medium shot aman bahkan untuk register fashion. | Soft, satu key + bounce. Bergo tebal, nggak transparent. |
| Khimar (panjang, longgar) | Wide shot dan kepala-dada keduanya bagus. Khimar punya volume — sisakan headroom + sideframe. | Soft diffuse dari samping — volume khimar ngasih natural shadow yang flattering. |

### Sound

- Kerudung kain tipis bisa kena mic clip-on dan bikin static / rustle. Pakai **boom overhead** atau **lavalier dijepit ke baju atasan dalam**, bukan ke hijab langsung.

### Wardrobe handoff (untuk talent)

- Brief talent **sebelum shoot day**: outfit yang dibawa, lapisan outer, sepatu. Jangan dadakan minta ganti outfit karena "kurang fit framing" — itu un-respect ke talent.
- Sediakan pin / jarum pentul cadangan, kaca panjang, dan ruang ganti yang private dan tertutup.

---

## Template

```
SHOT LIST — {project_name} (HIJAB-AWARE)
Talent: {talent_name}
Hijab style: {hijab_style}
Date: {shoot_date}
Location: {location}
Aspect: {aspect_ratio}
Register: {brand_register}

────────────────────────────────────────────────────────────────────────────────
| # | Scene         | Shot type      | Framing zone        | Camera move  | Duration | Notes                                   |
────────────────────────────────────────────────────────────────────────────────
| 1 | Opening       | Medium CU      | Kepala-dada         | Static       | 3s       | Soft key 45° kiri, bounce dari kanan    |
| 2 | Product reveal| Close-up tangan| Tangan + product    | Slow push    | 2.5s     | Hijab out-of-frame, fokus tekstur product|
| 3 | Walking shot  | Medium full    | Kepala-pinggang     | Tracking     | 4s       | Outer panjang on, jaga drape pashmina   |
| 4 | Talking head  | Medium CU      | Kepala-dada         | Static       | 6s       | Eye-line tepat lensa, headroom 12%      |
| 5 | Detail outfit | Close-up      | Tekstur kain hijab   | Macro static | 1.5s     | Show fabric, bukan body shape           |
| 6 | Wide context  | Wide           | Full body, outer    | Slow pan     | 3s       | Cek outer nutup pinggang dari profil    |
| 7 | Reaction      | Close-up wajah | Mata + senyum       | Static       | 2s       | Natural laugh — bukan posed              |
| 8 | CTA           | Medium CU      | Kepala-dada         | Static       | 3s       | Direct to camera, soft smile             |
────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────
LEGEND — framing zone (hijab-aware)
────────────────────────────────────────
- Kepala-dada           — default safe zone, hijab + atasan ke-frame
- Kepala-pinggang       — outer panjang wajib menutupi pinggang
- Wajah only            — close-up, hijab di-frame sebagai background tekstur
- Tangan / detail       — hijab out-of-frame OK, fokus product
- Full body             — opsional, outer harus menutup siluet, hindari shot ¾ dari belakang yang nge-press kain ke pinggul

────────────────────────────────────────
COVERAGE CHECK (sebelum wrap)
────────────────────────────────────────
- Tiap scene minimal: 1 medium CU (talking) + 1 close-up (detail) + 1 wide (context)
- Wardrobe check terakhir per scene: hijab simetris, pin masih kencang, outer nggak naik ke pinggang
- Talent comfort check: tanya talent sendiri "ada framing yang nggak nyaman tadi?" — itu lebih penting daripada estetik shot
- Audio: mic placement test ulang setelah talent adjust hijab
```

---

## Tone guide

- Modesty adalah **parameter teknis**, bukan story-line. Kalau brief minta "tema religi karena talent berhijab" tanpa konteks brand sebenarnya — push back, itu tokenisme.
- Hijab style tanya ke talent **langsung**, jangan diasumsikan. Talent paling tau gaya mana yang dia nyaman di-shoot.
- Wardrobe + framing handoff dibikin **sebelum** shoot day. Improvisasi di hari shoot ngerusak alur kerja dan ngebebanin talent.
- Hindari shot angle yang nge-emphasize body shape (low angle ke pinggang, tracking shot dari belakang dekat). Bukan karena "tidak boleh" — karena tidak menambah cerita.
- Talent comfort > shot ambition. Kalau talent bilang shot tertentu tidak nyaman, ganti — bukan negosiasi.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark.
