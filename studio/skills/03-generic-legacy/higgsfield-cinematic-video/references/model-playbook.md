# Higgsfield model playbook — pick the right tool, chain them right

The pipeline that produces cinema is **still → image-to-video shot → edit**. Skipping the still forces
the video model to invent a face and a world from text — that's where slop comes from.

## The Cinema Studio stack (each tool does ONE job)

Higgsfield wraps several engines. Combining them — instead of asking one to do everything — is what
makes a sequence look directed, not assembled:

1. **Higgsfield Popcorn** → generate keyframe images (lock tone + composition).
2. **Seedream** → edit/transform character appearance on those frames.
3. **Seedance 2.0** → animate frames (identity, micro-motion, dolly, atmosphere). Up to 15s @1080p,
   native audio, up to ~12 reference inputs.
4. **Google Veo 3.1** → performance, dialogue, emotional/lip-sync scenes.
5. **Sora 2** → long single-take continuous action (up to ~15s).
6. **Higgsfield Recast** → swap a character while preserving light, motion, atmosphere.

### Platform quick-reference

| Need | Use |
|------|-----|
| Ultra-real commercial / strong prompt adherence / identity | **Seedance 2.0** |
| Dialogue + performance + lip-sync | **Veo 3.1** |
| Multi-shot connected sequences (up to ~6 scenes) | **Kling 3.0** |
| Long continuous single-take action | **Sora 2** |
| Character swap preserving the shot | **Recast** |
| Keyframe / storyboard / tone lock | **Popcorn** |
| Identity lock across clips/voices | **Soul ID** |
| High volume, lower polish | **Hailuo** |

Rule of thumb: **Seedance for hero identity/mood; Kling for precise camera/blocking; Veo for dialogue.**

## Step 1 — Stills (lock identity & locations)

Build clean references BEFORE any video. **GPT Image 2** (best identity from a clear face; edit a real
photo to keep signage faithful), **Nano Banana Pro** (4K, best text), **Seedream** (4K editing). Feed the
clearest front-face photo; a small/side/phone-covered face yields a wrong face downstream — crop tight.
Generate 2 variants of any hero frame, pick the best face first.

## Step 2 — Video (animate the stills)

- **Seedance 2.0** — default for a person; best identity hold + atmosphere. Roles: `start_image`,
  `end_image`, `image`. Use `start_image` to lock the look; `end_image` only for a small real move, never a morph.
- **Kling 3.0** — best prompt adherence + precise camera moves; use for complex blocking.
- **One camera move per clip.** A single slow dolly-in reads as intentional; stacked moves read as "AI soup."

## Reference syntax & identity lock

- **@ tag roles:** `@Image1 as character reference / first frame. @Video1 for camera movement & pacing.
  @Audio1 for rhythm.` Assign each reference an explicit job.
- **Soul ID:** build one from a character reference to lock face (and voice) across every clip — the most
  reliable multi-clip consistency tool.
- **Grid trick:** if a face reference gets rejected, make a 2×2 grid of the face (e.g. Nano Banana) — grids
  pass moderation more reliably.
- **Constraint line:** end consistency-critical prompts with `keep the same person, same facial features,
  same hairstyle — no identity drift`.
- **Re-plot, don't re-generate:** upload the first clip and use Re-plot to extend/alter the story while
  keeping character, environment, and camera style.
- **Start/End frame locking:** lock both frames to guarantee the clip ends exactly on a chosen (e.g. brand)
  frame.

## Segmented generation workflow (save credits, never iterate blind)

- **先短后长 (short→long):** test at 3–5s; expand to 10–15s only after the shot is confirmed.
- **先低后高 (low→high):** generate low-res first; upscale the keeper.
- **Batch of 4, sound off:** generate ~4 variants per prompt to maximize a usable hit; pick the best.
- **建立提示词库:** keep a personal prompt library of winners (this skill is that library — add new wins).

## Mandarin reinforcement (Seedance is a ByteDance model)

Write in English, then append key Mandarin cinematic terms at the high-value spots — the lighting/camera
tail ("逆光剪影，镜头缓慢右移") and grade ("蓝橙对比，低饱和，胶片颗粒感"). Don't translate the whole prompt.

## Step 3 — Assemble

Stitch with a real editor (ffmpeg for cuts; an NLE for finesse), add sound design, apply one unifying
grade + grain so every shot feels like one film. Length comes from the edit. Add "seamless loop-ready
motion" for Reels/TikTok loops.

## Don't ask one clip to be the whole video

A transformation/glow-up/past-vs-future is a **sequence of shots**, each animated from its own locked
keyframe, then cut together. Never feed a past keyframe as `start_image` and a future keyframe as
`end_image` expecting a clean morph — it cross-dissolves and drifts. Animate each small action, then join
with a real editing transition (see transitions-and-editing.md).
