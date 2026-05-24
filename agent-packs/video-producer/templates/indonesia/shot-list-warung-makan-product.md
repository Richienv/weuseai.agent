# Template — Shot list untuk product video di warung makan / kafe Indonesia

Shot list khusus untuk product video yang di-shoot di setting otentik warung makan / kafe Indonesia. Bukan "studio ber-tema warung" — yang dimaksud setting **real**: kursi plastik, kaca tebal, AC sedang yang berisik, motor lewat di luar, abang-abang yang lewat dengan gerobak.

Lokasi otentik = budget production rendah, autenticity tinggi, **konfigurasi teknis lebih ribet**. Shot list ini buat plan supaya output bersih meski lokasi-nya hidup.

---

## Variables

- `{project_name}` — string. Internal label.
- `{product_name}` — string. Nama product yang di-shoot.
- `{warung_type}` — enum. `warung-nasi` | `warkop` | `kafe-indie` | `pkl` | `warmindo` | `bakso-mie` | `kopi-tubruk-stand`.
- `{location_name}` — string. Nama lokasi spesifik (mis. "Warung Bu Tini, Tebet").
- `{shoot_date}` — date.
- `{shoot_time_window}` — enum. `pagi (06-10)` | `siang (10-14)` | `sore (14-17)` | `malam (17-22)`.
- `{prop_drink_choice}` — enum. `kopi-tubruk` | `kopi-susu` | `es-teh-manis` | `latte` | `cappuccino` | `air-mineral`.
- `{audio_strategy}` — enum. `keep-ambient` | `clean-VO-redub` | `partial-mix`.

---

## Production notes

### Pilihan lokasi — autenticity vs control

| Warung type | Autenticity | Control teknis | Cocok untuk |
|-------------|-------------|----------------|-------------|
| Warung nasi (nasi padang, warteg) | Sangat tinggi | Rendah — meja kursi padat, audience makan | Konten kuliner, "behind-the-counter" story, product yang fit ke konteks makan siang |
| Warkop (warung kopi) | Tinggi | Sedang — biasanya ada sudut kosong sore hari | Product konsumer (rokok, kopi sachet, snack), interview lokal |
| Kafe indie | Sedang — sudah "produced" | Tinggi — biasanya ada ruang private, lighting OK | Product premium, lifestyle, fashion |
| PKL (pedagang kaki lima) | Tertinggi | Sangat rendah — outdoor, lalu lalang | B-roll, story-driven content, "raw" branded content |
| Warmindo (warung mie indomie) | Tinggi (target Gen-Z) | Rendah — pencahayaan kuning, sound ribut | Konten target mahasiswa, product makanan instan, late-night vibe |
| Bakso/mie | Tinggi | Sedang — biasanya ada kursi panjang, uap dari panci | Konten kuliner, comfort food positioning |
| Kopi tubruk stand | Tinggi — sangat ID | Rendah — biasanya outdoor / semi-outdoor | Lifestyle premium-vernacular, "back to basics" positioning |

### Pilihan prop drink — cultural specificity

- **Kopi tubruk** (kopi bubuk + air panas, ampasnya di gelas) = signal "warung lokal otentik", anchor visual to Indonesia. Cocok untuk brand yang positioning vernacular-premium.
- **Kopi susu** (kopi + susu kental manis) = signal mass market Indonesia, comfort. Cocok untuk brand mass.
- **Es teh manis** = signal universal Indonesia — hampir setiap warung punya, harga murah. Default untuk siang.
- **Latte / cappuccino** = signal kafe indie, urban. **Jangan paksa** di warung non-kafe — itu tone deaf, sinyal "ini iklan bukan otentik".
- **Air mineral botol** = signal neutral, safest tapi paling forgettable. Pakai kalau drink bukan story.

Rule: prop drink harus **fit ke jenis warung**. Latte di warung padang = visual-narrative dissonance.

### Lighting — tropical bright outdoor + dim indoor

Warung Indonesia punya **kontras lighting ekstrim**:
- Outdoor / dekat pintu: tropical bright, 5500-6500K, harsh.
- Indoor / belakang counter: 50-200 lux saja, dominasi lampu kuning 2700K.
- Mixed area (window seat): split light dari kedua sisi, white balance auto = warna kacau.

**Strategi:**
1. **Pilih sudut shoot** sebelum talent masuk. Window seat dengan side-light dari kiri = lighting natural terbaik. Hindari talent menghadap pintu (silhouette risk) atau membelakangi pintu (blown-out background).
2. **Bawa bounce card** (foam putih A2 cukup) untuk fill side gelap.
3. **Set white balance manual** ke 4000K untuk mixed area. Auto WB akan jump shot-to-shot.
4. **Hindari lampu warung overhead** sebagai key light — biasanya CRI rendah, skin tone hijau-kuning.
5. **Golden hour (16:30-17:30 Jakarta)** = jendela emas untuk window seat. Plan shoot prioritas window-shot di slot ini.

### Sound — yang lo terima, yang lo buang

**Sound otentik warung yang BIASANYA OK di final video:**
- Suara kompor / wajan (kalau warung nasi)
- Musik dangdut/lokal volume rendah (kalau memang ada — cek lisensi)
- Ambient chatter pelanggan (kalau diluar konteks, blur audibly)

**Sound yang biasanya harus DIHILANGIN atau DI-REDUB:**
- Motor lewat (tiap 30-60 detik di Jakarta — bikin VO unusable)
- Abang gerobak lewat dengan bell (suka muncul tiba-tiba)
- AC kompresor (constant whine — bikin VO sounds amateur)
- Adzan (HARUS skip shoot saat adzan — bukan teknis, ini respect culture)
- Klakson, sirene, alarm tetangga
- Hand-mixer / blender warung lain (high pitch yang nge-pikat di mic)

**3 strategi audio:**

1. **`keep-ambient`**: VO recorded on-location, ambient kept at -18dB to -24dB. Risiko: motor lewat ngerusak take. Mitigasi: shoot 3-5 take per line.
2. **`clean-VO-redub`**: VO direkord ulang di home studio / quiet room setelah shoot. Visual on-cam mouth-sync atau B-roll-heavy. Aman, tapi feel "produced" hilang.
3. **`partial-mix`**: VO direkord on-location dengan boom + lavalier, edited dengan ambient -30dB sebagai bed only. Best of both worlds, butuh editor cermat.

### Talent direction

- Talent makan / minum **beneran**, bukan pura-pura. Tangan + mulut + tubuh natural beda dari pretending. Bawa stand-by air mineral untuk break antara take.
- Hindari talent ngomong sambil mulut penuh — kasar dan susah edit.
- Kalau pakai talent + customer warung sebagai "incidental cast", **minta izin lisan dan tertulis** — UU PDP Indonesia mensyaratkan consent untuk publikasi gambar.

### Hubungan dengan pemilik warung

- **Bayar fair**. Sewa warung 2-4 jam shoot biasanya Rp 200-500rb, plus order makanan/minuman untuk crew. Bukan "boleh shoot gratis ya bos" — itu un-respect ke usaha mereka.
- **Brief pemilik** sebelum shoot: berapa orang crew, jam berapa, apakah warung tutup sementara atau tetap open.
- **Bawa kartu nama / contact** brand — pemilik warung biasanya curious dan bisa jadi advocate organic.
- **Tinggalin warung bersih** — semua kabel, light stand, prop di-kondisi-in seperti semula.

---

## Template

```
SHOT LIST — {project_name} (WARUNG SETTING)
Product: {product_name}
Warung: {warung_type} — {location_name}
Date: {shoot_date}
Time window: {shoot_time_window}
Prop drink: {prop_drink_choice}
Audio strategy: {audio_strategy}

────────────────────────────────────────
PRE-SHOOT CHECKLIST
────────────────────────────────────────
[ ] Izin pemilik warung — confirmed (kontak: ____, sewa: Rp ____)
[ ] Pemilik briefed (jumlah crew, jam, apakah warung tetap open)
[ ] Cek jadwal adzan Maghrib hari shoot — pause shoot 10 menit
[ ] Cek forecast hujan (Jakarta kerap sore hujan) — backup plan indoor-only
[ ] Bounce card + light stand + 1 LED panel kecil — ready
[ ] White balance preset 4000K mixed area
[ ] Boom mic + lavalier — both ready (lavalier sebagai backup ke boom)
[ ] Talent brief: outfit, prop drink, snack break window

────────────────────────────────────────────────────────────────────────────────
| # | Scene              | Shot type    | Camera move    | Duration | Notes                                             |
────────────────────────────────────────────────────────────────────────────────
| 1 | Establishing       | Wide outdoor | Static / slow pan | 4s    | Sign warung, foot traffic, golden-hour preferred  |
| 2 | Walking in         | Medium track | Tracking         | 3s     | Talent enter from outdoor, watch silhouette       |
| 3 | Sitting down       | Medium       | Static           | 2s     | Window seat ideal, prop drink already on table    |
| 4 | Drink pickup       | CU tangan    | Slow push        | 2.5s   | {prop_drink_choice}, fokus tekstur                 |
| 5 | Product reveal     | Insert macro | Static           | 2s     | Product di samping drink, natural placement       |
| 6 | Talking head       | Medium CU    | Static           | 6-8s   | Boom mic overhead, ambient -24dB                  |
| 7 | Eating / using     | Medium       | Slow push        | 3s     | Beneran makan/pakai, bukan pretend                |
| 8 | Reaction           | Close-up     | Static           | 2s     | Natural, bukan posed laugh                        |
| 9 | Detail product     | Macro insert | Static           | 1.5s   | Texture, branding, di setting warung              |
| 10| Wide context       | Wide indoor  | Slow pan         | 3s     | Show warung life — kompor, pelanggan lain blur    |
| 11| Outdoor exit / CTA | Medium       | Static / handheld | 3s    | Talent direct to camera atau over-shoulder        |
────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────
COVERAGE CHECK (sebelum wrap)
────────────────────────────────────────
- Establish shot warung exterior — wajib
- Talking head clean VO — minimal 3 take per line, dengarkan untuk motor / klakson
- Ambient room tone 60 detik — record saat warung quiet moment
- Detail product di 2+ angle (top-down + side)
- Pemilik warung credit shot (opsional, kalau pemilik OK) — sebagai courtesy

────────────────────────────────────────
CONTINGENCY
────────────────────────────────────────
- Hujan deras + harus shoot outdoor scene: gunakan teras / overhang warung, lighting compensate dengan LED panel
- Adzan jadwal saat shoot: pause 10 menit, crew istirahat, talent off-camera
- Motor lewat ngerusak take: take ulang. Jangan dipake "saved by editing" — pasti kentara di final.
- Listrik mati (sering di warung kecil): backup batt LED, gunakan natural light only
- Pelanggan lain interrupt: terima ramah, biarin selesai, lanjut shoot. Jangan keluarin orang — un-respect.
```

---

## Tone guide

- Setting otentik = **respect operasi** warung. Bayar fair, brief jelas, tinggalin bersih. Crew yang treat warung as "free studio" = blacklisted, juga ngerusak future shoot untuk semua orang.
- Prop drink **fit setting**. Latte di warung padang = visual-narrative dissonance.
- Audio strategy ditentuin **sebelum shoot**, bukan di edit. Kalau plan-nya `clean-VO-redub`, talent tahu dia akan re-record — mouth-sync expectation diset.
- Adzan = pause shoot. Bukan karena teknis, karena respect. Crew dan talent ada yang shalat, dan ambient sound adzan ngerusak audio.
- Pemilik warung adalah **collaborator**, bukan landlord. Kasih credit kalau memungkinkan, tanya kalau ada yang bisa-bantu (mereka tau warung paling tau angle terbaik).
- Talent makan / minum beneran. Pretend-eating selalu kentara di final cut.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark.
