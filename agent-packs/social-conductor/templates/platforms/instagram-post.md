# Template — Instagram post caption

> Dipakai `post-drafter` saat platform = `instagram` (carousel atau single image). Reels caption tetap pakai cadence Reels di `platform-length-rules.md`. Hook 220 char limit supaya tidak ke-cut di preview "...more".

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{hook_line}` | ya | 1-2 baris pertama, total ≤220 char sebelum "more". Drives the tap |
| `{body}` | ya | 2-4 paragraf pendek, satu ide per paragraf |
| `{cta_line}` | ya | save / comment / share / link in bio. Satu kalimat |
| `{hashtag_block}` | ya | 3-5 tag, lowercase, no spam tag. Pisah dengan spasi |
| `{emoji}` | tidak | Max 1 emoji per caption. Default: posisi akhir hook line atau setelah CTA |

---

## Template

```
{hook_line}

{body_paragraph_1}

{body_paragraph_2}

{body_paragraph_3}

{cta_line}

{hashtag_block}
```

### Contoh terisi (register: calm-edukasi)

```
Pernah lihat pelanggan booking lagi tanpa diingatkan. Itu sinyal voice brand kamu udah kebaca.

3 bulan terakhir aku kerja sama studio yoga kecil di Jakarta Selatan. Hipotesis awal: butuh ads. Realita: caption mereka udah ngundang, cuma kurang konsisten.

Yang berubah cuma cadence — dari acak jadi 3 post per minggu di jam yang sama. Bookmark naik 4x, DM masuk dari pelanggan lama.

Kalau caption kamu pernah dapat tanggapan tulus tapi tidak rutin diposting, save dulu post ini.

#brandingid #smallbiz #captioncopy #voiceconsistency
```

---

## Tone guide — Instagram

- **Hook style:** scroll-stopper. Pernyataan kuat, observasi tajam, atau angka konkret. Bukan pertanyaan retoris kosong tipe "Pernah ngga sih?"
- **Hook char limit:** 220 char total untuk dua baris pertama. Lebih dari itu kena truncate "...more"
- **Paragraph length:** 1-2 kalimat per paragraf. White space lebih banyak dari LinkedIn karena IG dibaca di layar HP
- **Emoji:** max 1 per caption. Pilih satu yang sesuai voice profile (calm = 💡 / 📌, playful = 😉 / 👀). Kalau profile zero-emoji, skip
- **Hashtag:** 3-5 tag relevan. Hindari tag mega-volume (#love #photooftheday). Tag niche lebih kuat
- **Punctuation:** zero exclamation marks. Em dash atau titik dua untuk emphasis
- **Banned phrases di IG:** "Tag teman kamu yang...", "Double tap kalau...", "Hit save kalau setuju" — feel forced
- **CTA yang work:** "Save buat referensi nanti", "Komen pengalaman kamu", "Kalau resonate, share ke story" — soft, opt-in
- **Caption length:** sweet spot 125-300 char total. Hard cap 2200, tapi >500 char audience drop-off
