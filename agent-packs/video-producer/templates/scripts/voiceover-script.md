# Template — Voiceover script

Skrip voiceover untuk product video, explainer, atau ads — tanpa on-cam. Dibaca paragraph-by-paragraph dengan tone notes, pause cues, dan pronunciation hints supaya talent (atau AI VO) baca tepat di runtake pertama.

---

## Variables

- `{project_name}` — internal label
- `{video_purpose}` — product walkthrough, explainer, ad, brand film
- `{vo_talent}` — nama talent atau "AI VO (ElevenLabs / Resemble)"
- `{vo_gender_tone}` — preferensi (warm female, neutral male, energetic mixed, dst.)
- `{target_duration_sec}` — runtime estimate
- `{language_mix}` — BI only, BI+EN code-switch, atau EN only

---

## Template

```
VOICEOVER SCRIPT — {project_name}
Purpose: {video_purpose}
Talent: {vo_talent}
Tone: {vo_gender_tone}
Target: {target_duration_sec}s
Language: {language_mix}

────────────────────────────────────────
PRONUNCIATION SHEET (baca dulu sebelum take)
────────────────────────────────────────
| Term            | Phonetic guide                  | Notes                      |
|-----------------|--------------------------------|---------------------------|
| <term EN>       | <e.g. "kyoo-rey-ted">           | Jangan "kura-ted"          |
| <term BI>       | <e.g. "ru-pi-AH" — accent akhir>| Singular, bukan "rupiah-s" |
| <brand name>    | <e.g. "WEH-yoos-AY">            | Selalu konsisten           |
| <acronym>       | <spelled out or as-word>        | Confirm sebelum take       |

────────────────────────────────────────
PARAGRAPH 1   [duration: ~Xs]
Tone note: <warm, matter-of-fact, urgent, reflective, dst.>
Pace: <slow / medium / fast>
────────────────────────────────────────

<Tulisan paragraf, 2-3 kalimat. Satu ide per kalimat. Period default, koma cuma kalau memang ada anak kalimat.>

[pause 0.5s]

<Kalimat berikut atau bridge ke paragraf 2.>

────────────────────────────────────────
PARAGRAPH 2   [duration: ~Xs]
Tone note: <shift dari paragraf 1 — misal: dari warm ke confident>
Pace: <slow / medium / fast>
────────────────────────────────────────

<Paragraf 2.>

[pause 0.3s — biarin visual breathe]

<Kalimat penutup paragraf.>

────────────────────────────────────────
PARAGRAPH 3   [duration: ~Xs]
Tone note: <…>
Pace: <…>
────────────────────────────────────────

<Paragraf 3 — biasanya payoff atau insight inti.>

[pause 1s — biggest beat, sebelum CTA]

────────────────────────────────────────
CTA PARAGRAPH   [duration: ~Xs]
Tone note: <direct tapi tetap warm — bukan sales-y>
Pace: <medium, jangan rush CTA>
────────────────────────────────────────

<CTA paragraph — 1-2 kalimat. Spesifik action.>

────────────────────────────────────────
DELIVERY NOTES (overall)
────────────────────────────────────────
- Energy arc: <misal "start neutral → build → peak di paragraf 3 → calm di CTA">
- Smile-in-voice: <ya / tidak / specific paragraphs>
- Breath cues: <kalau ada baris panjang, mark di mana boleh ambil napas>
- Filler words: <none — talent diminta clean take, editor nggak punya budget remove filler>

────────────────────────────────────────
TAKE INSTRUCTIONS
────────────────────────────────────────
- Minimum 2 take per paragraf
- Take 1: as-scripted
- Take 2: tone variation (lebih warm / lebih confident, sesuai brief)
- Save room tone 30 detik untuk noise floor reference editor
```

---

## Tone guide

- Voiceover **ditulis untuk telinga**, bukan mata. Baca keras-keras sambil ngedit — kalau kepleset lidah, rewrite.
- Kalimat pendek menang dari kalimat panjang. Talent bisa intonasi lebih jelas, editor bisa cut lebih bersih.
- Pause cue bukan estetika — itu **ruang buat visual bernafas**. Tanpa pause, voiceover bertabrakan dengan B-roll dan keduanya jadi noise.
- Pronunciation sheet **wajib** kalau ada nama brand, term EN di tengah BI, atau angka rupiah. Talent nggak boleh nebak — kasih jawaban di sheet.
- Tone note jangan generic ("read normally"). Tone = arah emosi konkret: warm, matter-of-fact, reflective, confident.
- Code-switch BI/EN harus disetujui di brief — kalau iya, tandai term EN dengan italic atau notasi `[EN]` biar talent tahu shift.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di skrip. Penekanan dari delivery, bukan punctuation.
- Cerita dulu. Kalau script sudah penuh hint visual tapi narasinya tipis, balik dulu ke narasi.
