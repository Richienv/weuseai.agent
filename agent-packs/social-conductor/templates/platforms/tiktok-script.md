# Template — TikTok script

> Dipakai `post-drafter` saat platform = `tiktok` dan customer minta script video pendek (bukan cuma caption). Format: 3 beats — hook (≤3 detik), setup, payoff — plus visual cue + audio cue per beat. Target durasi video 15-45 detik.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{hook_beat}` | ya | Kalimat yang diucapkan di 3 detik pertama. ≤12 kata. Visual cue terpisah |
| `{setup_beat}` | ya | Bangun konteks atau tension. 1-2 kalimat |
| `{payoff_beat}` | ya | Reveal, insight, atau result. 1-2 kalimat |
| `{cta_beat}` | tidak | Optional 4th beat: follow / save / comment. Satu kalimat singkat |
| `{caption}` | ya | Caption TikTok terpisah dari script. Ikut `platform-length-rules.md` (100-150 char) |
| `{hashtag_block}` | ya | 4-8 tag, mix niche + trending |

---

## Template

```
SCRIPT (durasi target: 30-45 detik)

[BEAT 1 — HOOK · 0-3 detik]
Ucapan: "{hook_beat}"
Visual cue: {visual_hook}
Audio cue: {audio_hook}

[BEAT 2 — SETUP · 3-15 detik]
Ucapan: "{setup_beat}"
Visual cue: {visual_setup}
Audio cue: {audio_setup}

[BEAT 3 — PAYOFF · 15-35 detik]
Ucapan: "{payoff_beat}"
Visual cue: {visual_payoff}
Audio cue: {audio_payoff}

[BEAT 4 — CTA · 35-45 detik] (optional)
Ucapan: "{cta_beat}"
Visual cue: {visual_cta}

---

CAPTION:
{caption}

{hashtag_block}
```

### Contoh terisi (register: educational, topic: "kenapa caption brand kamu flat")

```
SCRIPT (durasi: 35 detik)

[BEAT 1 — HOOK · 0-3 detik]
Ucapan: "Caption kamu flat karena satu hal ini."
Visual cue: close-up wajah, eye contact ke kamera, latar bersih
Audio cue: voice langsung, tanpa musik di 3 detik pertama

[BEAT 2 — SETUP · 3-15 detik]
Ucapan: "Brand voice itu satu pola. Kalau hari ini ramah, besok formal, lusa promo, audience bingung."
Visual cue: cut ke screen recording — tiga caption brand yang inkonsisten
Audio cue: musik instrumental masuk pelan, volume 30%

[BEAT 3 — PAYOFF · 15-30 detik]
Ucapan: "Lock voice dulu dari 20 sample writing lama. Setelah itu setiap caption baru di-check fit-nya."
Visual cue: cut ke voice profile card, signature phrases tampil satu per satu
Audio cue: musik naik ke 50%, sound design "tick" saat phrase muncul

[BEAT 4 — CTA · 30-35 detik]
Ucapan: "Kalau brand kamu butuh ini, save dulu."
Visual cue: kembali ke wajah, hand point ke bookmark icon

---

CAPTION:
Voice flat = audience bingung. Lock voice dulu, baru draft konsisten.

#brandvoiceid #captionwriter #socialmedia #brandbuilder #captioncopy
```

---

## Tone guide — TikTok

- **3-second rule:** beat 1 harus pull attention di bawah 3 detik. Statement, bukan pertanyaan. Visual + audio di beat 1 mendukung hook
- **Hook kalimat:** ≤12 kata, diucapkan jelas. Hindari intro tipe "Halo guys, aku mau bahas..."
- **Visual cue per beat:** wajib spesifik — close-up wajah, B-roll, screen recording, on-screen text. Bukan "tampilkan sesuatu yang menarik"
- **Audio cue per beat:** voice-only atau musik dengan volume jelas (30%, 50%). Trending sound boleh, tapi voice tetap dominan di beat 1
- **Cuts:** minimal 1 cut antar beat. TikTok algoritma reward retention, cut jaga attention
- **Caption:** terpisah dari script. 100-150 char. Hashtag 4-8 tag mix niche + 1-2 trending
- **Punctuation:** zero exclamation marks di script maupun caption
- **Voice:** "kamu", tidak pakai "guys" / "kalian" yang impersonal
- **Hindari di TikTok:** intro panjang, music keras menutup voice, transition gimmicky tanpa fungsi
- **CTA yang work:** "Save buat dipakai", "Follow buat next tutorial", "Komen kalau pengalaman serupa" — soft, beralasan
