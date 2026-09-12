# Community recipes — proven structures, prompts, and reverse-engineering

Battle-tested patterns from Western (Seedance/Higgsfield) and Chinese (Xiaohongshu/Douyin) creator
communities. Use these as scaffolding, then fill with the directed blueprint.

## The 3×3 Nine-Shot Rule (long-form structure)

Structure a longer piece as **9 shot segments in 3 acts**, each shot 3–5s, generated separately and
stitched in the edit. It guarantees an emotional arc instead of a wandering clip:

| Act | Shots | Purpose |
|-----|-------|---------|
| 第一幕 Act 1 | 1–3 | 建立场景 — establish scene, character, mood |
| 第二幕 Act 2 | 4–6 | 推进故事 — push tension / develop |
| 第三幕 Act 3 | 7–9 | 高潮 + 释然 — climax + resolution |

Each segment is ~50–80 characters of directed prompt. Keep STYLE identical across all nine so the cut
feels like one film. For a short reel, collapse to 3 shots (one per act).

## Viral reverse-engineering (爆款逆向工程)

Inherit a proven formula without copying content:
1. Find a high-engagement video in the niche.
2. Upload it as a reference video.
3. Prompt: "reference this video's camera work, pacing, and transitions, but change the content to
   [your new content] / 参考该视频的运镜、节奏、转场，内容改为[…]".
You keep the winning rhythm and motion while making something original. (Only reverse-engineer *technique*
— framing, pace, transitions — not someone's actual footage or likeness.)

## Multi-angle character consistency

Generate → screenshot the best frame → reuse it as the reference for every subsequent shot, stating
"keep face and clothing consistent." Provide 3–5 angles of the character for the strongest lock. This is
the cheapest fix for the #1 slop problem (faces changing between shots).

## Ready-to-use prompt templates (adapt, don't paste blind)

**Cinematic realism — human subject** (16:9, 8–10s, 1080p)
```
Extreme close-up of a young woman's face, eyes slowly opening to reveal reflected city lights, a single
tear rolling down her cheek catching the light, shallow depth of field with bokeh background, intimate
and emotional, Blade Runner cinematography, warm amber vs cool blue contrast, fine grain, low saturation,
slow dolly-in — avoid static camera
```

**Atmospheric scene — anti-slop** (21:9, 10–15s, 1080p)
```
A detective in a trench coat walking down a rain-soaked alley at night, neon signs reflecting in puddles
in streaks of red and blue, steam rising from a manhole, slow dolly following from behind, film noir, high
contrast deep shadows, 1940s-meets-cyberpunk, shot on ARRI Alexa 35mm grain — avoid flat lighting,
avoid static camera
```

**Product / commercial** (high reliability)
```
A premium wristwatch slowly rotating in mid-air, water droplets suspended around it catching light like
diamonds, pure black background, single dramatic top spotlight, extreme macro detail of the watch face,
high-end jewelry-commercial aesthetic, ultra-smooth rotation — avoid motion jitter, avoid oversaturation
```

**Epic landscape** (cinematic)
```
Sweeping drone shot ascending from a misty valley floor, slowly revealing a mountain range at sunrise,
golden light breaking through clouds casting long shadows across pine forests, National Geographic
documentary quality, ultra-smooth camera, ARRI Alexa texture — avoid oversaturated colors
```

Note how each ends on **camera + light + a negative** — that tail is doing most of the work.

## Settings cheat sheet

- Aspect: 9:16 vertical reels; 16:9 standard; 21:9 for widescreen drama.
- Duration: test 3–5s, expand to 10–15s once confirmed; multi-shot mode for 10s+ sequences.
- Resolution: low first, upscale the keeper.
- Variants: 2–4 per prompt, always.

## The slop-killer cheat code

Add to almost any prompt: **film grain (胶片颗粒感) + low saturation (低饱和度) + 4K**. Chinese creators
credit these three with removing ~80% of the "AI look." Pair with "avoid static camera" and a motivated-
light pass.

## Resource

Community prompt library (curated from X/Twitter creators, organized by genre): the GitHub repo
**EvoLinkAI/awesome-seedance-2.0-prompts** — a deep free reference for Action, Cinematic Realism, POV/FPV,
Commercial, Surreal VFX, and Templates. Browse it for structures, then run everything through this skill's
blueprint so the output stays directed, not pasted.

## Multi-identity viral UGC selfie (two-reference structure)

A top-performing format: a candid, chaotic phone selfie of two people (e.g. a fan + another subject),
or one person as the "main character." The key technique is **assigning each reference image to exactly
one person** so identities don't blend.

```
Reference 1 = [person A] identity reference.   Reference 2 = [person B] identity reference.
Use Reference 1 ONLY for person A's face, hair, skin tone, facial structure, age, build, clothing.
Use Reference 2 ONLY for person B's face, hair, skin tone, facial structure, build.
Person A must clearly resemble Reference 1; person B must clearly resemble Reference 2.

[CANDID FRAME] genuine spontaneous smartphone selfie — NOT posed, NOT planned, caught mid-chaos in one second.
[CAMERA] front-facing wide-angle phone lens, vertical 9:16, handheld shake, motion blur, slight tilt, imperfect framing, real phone image quality.
[SUBJECTS] A in foreground holding the phone (emotion); B beside, caught-in-the-moment (emotion). Pin true skin tone + exact age for each.
[ACTION] the specific chaos (someone grabbing/pulling, security rushing in, body off-balance).
[BACKGROUND] busy, alive setting (crowd, lights, staff) with depth and motion.
[LOOK] UGC realism — phone HDR, faint sensor noise, candid photo-journalism feel.
[NEGATIVES] no AI-art look, no CGI, no face-swap/pasted-face, no studio/cinematic lighting, no posing, no watermark/logo/text, natural skin texture.
```
Pair with the smartphone/UGC realism block in `ready-blocks-and-templates.md` and the skin-tone/age rules.

### Ethics guardrail — read before adding a second real person

Image models **drift to real, identifiable celebrities and real team kits/sponsors/logos** in sports and
celebrity contexts *even when the prompt says "fictional"* — wording alone does not reliably stop it
(tested: a "fictional footballer" prompt rendered recognizable real players in branded club kits). So:

- Only use a real-person reference for **yourself, a person who consented, or a clearly fictional/generic
  figure.** Do **not** fabricate photorealistic images of real, named public figures meant to pass as
  genuine — that misuses their likeness and is deceptive.
- To keep it clean: make the user the **sole subject** (the "main character" version), or supply a real
  consenting person's photo as Reference 2; dress players in **blank kits** with **no crest, sponsor,
  number, or readable text**, and keep background people **generic and blurred**.
- After generating, **check the output** for accidental real-person likeness or real logos; discard and
  re-run with a blank-kit / generic-crowd / sole-subject variant if any appear.
