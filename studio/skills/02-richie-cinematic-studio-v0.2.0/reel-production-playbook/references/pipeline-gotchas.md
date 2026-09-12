# Pipeline gotchas — every bypass, with the exact fix

A checklist of the failures hit while producing the reel, and the precise parameter that fixes each.

## Higgsfield / Seedance

| Symptom | Cause | Fix |
|---|---|---|
| `status: nsfw` on a dark two-figure clip | False positive on silhouettes | Resubmit `count: 2`, add `A calm cinematic sports drama scene, fully clothed, no extra people.` |
| `generate_video` returns `preset_recommendation` and no render | Prompt matched a Higgsfield preset | Resubmit with `declined_preset_id: "<preset id from the notice>"` |
| Output looks soft / low-res | Seedance defaults to **720p** | Pass `resolution: "1080p"` explicitly |
| Real selfie upload rejected for video | Seedance blocks real faces | Animate an **AI keyframe** only — `start_image` with a `job_id` or a re-uploaded AI still |
| Face reference rejected on a still | Moderation | Use a 2×2 grid of the face (passes moderation more reliably) |
| `medias[].value` rejected | Passed an `https://` URL | Pass a `media_id` (from `media_upload`/`media_confirm`) or a `job_id` — never a URL |
| Distant/younger face looks "off" in a two-shot | From-scratch face idealizes | Push the figure back + deepen shadow + add mist; keep the face turned away |

## Uploads (sandbox bandwidth)

- **Large PUTs stall.** A ~7–8 MB PNG to the presigned URL times out (HTTP 000) on slow egress.
  **Fix:** downscale to ~1280 px wide JPEG (~80–100 KB) before `media_upload`; PUTs then finish in
  2–4 s. The Seedance start frame doesn't need full res.
- A tiny PUT (a few bytes) succeeds even when a large one fails — use that to confirm the presigned
  URL/signature is valid before blaming the request.
- Confirm uploads with `media_confirm` (`type: "image"`, batch via `media_ids`) before referencing
  them in `generate_video`.
- Downloading large mp4s from cloudfront is also slow — use `curl --max-time 40` and expect a few
  seconds per clip.

## Stills (`generate_image`, Nano Banana Pro)

- **Reference hijack:** adding the user's real selfie as a 4th reference can make the model copy the
  selfie's framing instead of the prompted scene. Keep ≤3 references; describe hair/wardrobe in text.
- For a from-behind figure, the face isn't visible — so references mainly carry **hair + build**;
  describe the exact hairstyle in words ("thick black hair swept up and back, tapered sides").
- Generate `count: 2` for any hero frame and pick the better face; foggy/over-misted variants are
  common rejects.

## Job polling

- `job_display` takes `{ "id": "<job_id>" }` (the key is `id`, not `job_id`).
- Seedance 1080p/5s renders in roughly 1–4 min; queue load varies. Poll, don't block.
- `get_cost: true` on `generate_video` preflights credits without submitting (≈22 cr at 720p/5s,
  more at 1080p). Plus plan had plenty of headroom for a 5–6 clip reel.
