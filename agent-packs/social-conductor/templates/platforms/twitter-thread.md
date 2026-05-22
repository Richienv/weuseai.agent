# Template — Twitter (X) thread

> Dipakai `post-drafter` saat platform = `x` dan customer minta thread (bukan single tweet). Struktur: 1 hook tweet + 5-10 body tweets bernomor + 1 CTA tweet. Tiap tweet ≤280 char (Premium 4000, tapi reach ke non-Premium tetap 280).

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{hook_tweet}` | ya | Tweet 1. Frame thread + indikator (🧵 atau "1/N"). ≤280 char |
| `{body_tweets[]}` | ya | 5-10 tweet. Satu ide per tweet. Bernomor "2/", "3/", dst. ≤280 char per tweet |
| `{cta_tweet}` | ya | Tweet terakhir. Soft CTA + thread-end indicator ("/end" atau "🧵💬"). ≤280 char |
| `{topic}` | ya | Topic kalimat singkat untuk frame thread |
| `{count_total}` | ya | Total tweet count (N). Diisi di hook tweet "1/N" |

---

## Template

```
[TWEET 1 — HOOK]
{hook_tweet}

🧵 1/{count_total}

[TWEET 2]
2/ {body_tweet_2}

[TWEET 3]
3/ {body_tweet_3}

[TWEET 4]
4/ {body_tweet_4}

[TWEET 5]
5/ {body_tweet_5}

[...]

[TWEET N — CTA]
{count_total}/ {cta_tweet}
```

### Contoh terisi (topic: cara baca voice drift sebelum audience drop)

```
[TWEET 1 — HOOK]
Voice drift jarang ketahuan sampai followers diam.

Ini 6 sinyal yang muncul lebih dulu — dan cara baca sebelum audience drop.

🧵 1/7

[TWEET 2]
2/ Signature phrase kamu tiba-tiba hilang dari draft.

Kalau biasa pakai "coba dulu" atau "kasih tahu", lalu 3 post terakhir nol — itu drift. Bukan variasi.

[TWEET 3]
3/ Sentence length berubah ≥30%.

Calm voice biasa 14 kata per kalimat. Drift ke 22 kata = beda register, beda reading speed audience.

[TWEET 4]
4/ Address form mulai mix.

"Kamu" jadi "Anda" di satu post, balik ke "kamu" di post berikut. Audience tidak tahu siapa yang nulis.

[TWEET 5]
5/ Emoji count naik.

Brand zero-emoji tiba-tiba 3 emoji per caption = sinyal copywriter berbeda atau drift bertahap.

[TWEET 6]
6/ Hook style berubah dari claim ke pertanyaan retoris.

"Bagaimana kalau aku bilang..." adalah tanda voice mulai meminjam template orang lain.

[TWEET 7 — CTA]
7/ Cara cek: ambil 5 post terakhir, bandingkan ke voice profile lock. Skor fit per dimensi.

Kalau ≥3 dimensi geser, voice perlu re-lock sebelum campaign berikutnya.

/end
```

---

## Tone guide — Twitter (X)

- **Hook tweet:** punchy claim atau angka konkret. Frame value thread di 1-2 baris. "🧵" emoji atau "1/N" indikator wajib supaya audience tahu ini thread, bukan one-off
- **Body tweets:** satu ide per tweet. Jangan paksa satu argumen dipotong ke dua tweet — pecah ke ide-ide diskret
- **Per tweet char:** target 250-280. Penuhi budget — tweet 80 char di tengah thread feel under-cooked
- **Numbering:** "2/", "3/", dst di awal tweet. Bukan "(2/7)" atau "Part 2:" — simpel
- **CTA tweet:** "/end" atau "🧵 done" sebagai indikator selesai. CTA-nya soft: "save thread ini", "share kalau ada teman butuh", "RT kalau resonate" — opt-in
- **Hashtag:** 0-2 tag max di Twitter (culture penalize tag-stuffing). Tag biasanya di tweet terakhir, bukan setiap tweet
- **Voice:** "kamu" konsisten antar tweet. Tidak switch ke "lo" atau "Anda" di tengah thread
- **Punctuation:** zero exclamation marks. Em dash boleh
- **Per-tweet structure:** boleh open dengan claim atau angka. Hindari "Btw," / "Also" / "Hot take:" yang feel filler
- **Cuts antar tweet:** logical transition, bukan random list. Tiap tweet harus ngebantu argument utama
- **Thread length:** 6-11 tweet sweet spot (hook + 5-10 body + CTA). Lebih dari 12 tweet, retention drop
