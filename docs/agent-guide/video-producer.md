# Video Producer

Script TikTok dan Reels, hashtag research, sound trend tracking, caption drafting, **HyperFrames render aktual** — output mp4 ke kamu, bukan storyboard JSON.

**Tier:** Pro, Studio.

---

## Apa yang kamu dapat

- **TikTok script builder** — JSON script structured: hook + body + CTA + visual scenes + sound + hashtags. Validated edge function untuk format consistency.
- **Reels script builder** — adaptasi format ke Reels (durasi 30-90s sweet spot, hook 3 detik pertama).
- **Hashtag research** — top 20 hashtag relevant + difficulty score (low / mid / high competition).
- **HyperFrames storyboard** — JSON per-scene siap di-feed ke Runway / Sora / CapCut. Visual prompt + motion hint + duration + audio cue + transition.
- **HyperFrames render (Phase 4-2)** — eksekusi storyboard jadi mp4. Per-scene render via Runway (primary, $0.05/sec) atau Pika (fallback, $0.02/sec). Output: array per-scene mp4 URL + stitch recipe. Hermes kamu download tiap scene + jalanin `hyperframes-stitch` CLI lokal (ffmpeg) untuk merge.
- **Caption drafter** — caption fitting voice kamu (kalau pair-up dengan [Social Conductor](./social-conductor.md) voice-locker).

---

## Sample tasks

- "Bikin script TikTok 60 detik tentang launch produk baru, hook visual, CTA preorder" — JSON script + visual scenes + sound rec.
- "Hashtag research untuk niche home-decor Indonesia" — top 20 hashtag + difficulty + sample post yang ranking.
- "Susun HyperFrames storyboard 30 detik untuk script ini, 6 scene" — JSON storyboard ready render.
- "Render storyboard tadi pakai Runway" — output mp4 stitched, send link via Telegram.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `tiktok-script-builder` | Pro+ | JSON script TikTok format |
| `reels-script-builder` | Pro+ | JSON script Reels format |
| `hashtag-researcher` | Pro+ | Top 20 hashtag + difficulty |
| `hyperframes-storyboard` | Pro+ | JSON storyboard per-scene |
| `hyperframes-render` | Pro+ | Eksekusi storyboard → mp4 (Runway / Pika) |

---

## Cost render (BYOK)

Video render butuh API key kamu sendiri di provider:

- **Runway** ($0.05/sec) — primary, kualitas tinggi, motion smooth.
- **Pika** ($0.02/sec) — fallback, lebih murah, kualitas decent untuk low-stakes content.

Provider router pilih Runway by default. Pika dipakai kalau:

- Storyboard kasih `target_renderer: pika`
- Atau Runway error / quota habis

Hermes call edge function `hyperframes-render`, edge function call provider, kembalikan per-scene mp4 URL. Hermes download tiap scene ke VPS kamu, lalu `hyperframes-stitch` CLI (ffmpeg local di VPS) merge jadi single mp4.

Cost example: 30-detik video, 6 scene @ 5-detik per scene, semua Runway → 6 × 5s × $0.05/s = $1.50 (Rp 23rb).

---

## Limitasi

- **Bukan auto-publish** — output mp4 di-deliver ke kamu, kamu yang upload ke TikTok / Reels manually. Decision keep di kamu.
- **Render quality variable** — Runway / Pika output adalah AI-generated, tidak professional cinematography. Cocok untuk explainer + viral-style content, kurang cocok untuk brand premium.
- **Cost real money** — BYOK render = kamu bayar provider direct. Set spending cap di provider dashboard untuk safety.
- **Phase 4-2 ship code path; live smoke test** belum dilakukan (hindari spending tanpa founder approval). Kamu yang first run.

---

## Workflow recommended

1. **Brief idea** ke Video Producer — "TikTok 60 detik tentang X, target audience Y."
2. **Script JSON** review — adjust hook / CTA / pacing.
3. **Storyboard JSON** generate dari script — review per-scene visual prompt.
4. **Render** trigger — wait 5-10 menit per scene.
5. **mp4 stitched** delivered — review, upload ke TikTok manual.

---

## Kapan switch ke persona lain

- Kalau kamu butuh **content text-only (caption + hashtag tanpa video)** → [Social Conductor](./social-conductor.md).
- Kalau kamu butuh **deck slide presentasi** → [Slide Master](./slide-master.md).
- Kalau kamu butuh **landing page atau site untuk distribute video** → [Web Master](./web-master.md).
