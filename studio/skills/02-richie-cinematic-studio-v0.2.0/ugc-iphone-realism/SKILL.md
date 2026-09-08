---
name: ugc-iphone-realism
description: >-
  Direct phone-real, "filmed on iPhone" UGC and short-form ads in Seedance 2.0 so
  the render reads as a real human with a phone in their kitchen, not polished AI
  slop. Use this skill WHENEVER the user wants UGC, a talking-head, a product review
  or unboxing, a creator/influencer ad, a TikTok/Reels/Shorts ad, a street interview,
  a facecam reaction, or a travel-vlog clip — or says "make this look like a real
  phone video," "iPhone UGC," "filmed on iPhone," "realistic TikTok/Reels ad,"
  "talking-head UGC," "product review video," or "why does my UGC look AI / waxy /
  plastic." Apply it BEFORE writing any Seedance UGC prompt: the iPhone look is a
  six-part prompt cluster, not a keyword, and skipping the skin-texture line makes
  the model render waxy, poreless skin that viewers ID as AI in one second.
  Triggers on phone-real, amateur, ungraded, handheld, casual-creator requests.
  Pairs with richie-persona (your locked face), ai-human-realism (skin depth),
  higgsfield-cinematic-video (the INVERTED cinematic counterpart), creative-ig-video-idea
  (concept/hook) and script-writer (the spoken lines). Do NOT use for cinematic /
  ARRI / anamorphic reels (use higgsfield-cinematic-video / reel-production-playbook),
  or anime / cartoon / stylized work.
---

# UGC iPhone Realism — the anti-cinematic counterpart

**The iPhone look is a six-part prompt cluster, not a keyword.** `Filmed with iPhone` alone leans toward the aesthetic, but the render only lands consistently when you stack 3-4 reinforcing cues — camera anchor + handheld + natural light + casual framing + skin texture + a negative. This skill is the deliberate inverse of `higgsfield-cinematic-video`: that one engineers ARRI polish, named camera moves and graded color; this one engineers the opposite — ungraded, handheld, casual, imperfect, phone-real. The two cannot be blended or they cancel out.

## Why phone beats studio

On paid ads, polished studio creative loses to a phone shot in someone's kitchen. Every imperfection — slight handheld bounce, natural window light, a messy background, no gimbal glide — signals a real human filmed it. Seedance 2.0 was trained on enough real phone footage to fire the *whole* visual cluster off these phrases, so you direct the imperfection in instead of fighting it out.

## The six-part iPhone authenticity cluster

The look is built from six reinforcing elements — **camera anchor, handheld cue, natural light source, optional sensor artifact, casual framing, and a negative cue.** Skip any one and the authentic feel breaks; write all six. Each element, the exact phrases to use, and the skin-mapping behind it live in **`references/iphone-look-and-realism.md`** (the canonical cluster reference) — read it when you need the full phrase menu. The single highest-impact element, skin texture, is locked in below.

## The Realism-Lock Stack (non-negotiable)

This block is the canonical copy. Paste it at the **end** of every UGC prompt. Without the skin-texture line, the model defaults to a waxy, poreless render that viewers ID as AI within the first second — this is the single highest-impact cluster for defeating AI detection.

```
Realistic skin texture, visible pores around nose and cheeks, natural slight unevenness,
no filter quality, handheld phone camera feel, slight angle, casual framing,
filmed in a real environment, soft window light from the left, natural indoor lighting,
no harsh highlights.
```

This is the UGC-prompt shorthand for what `ai-human-realism` engineers in depth (layers 3-4: skin/SSS, visible pores). When the subject is *you* ("me" / "my face"), pull `richie-persona` for the locked identity and `ai-human-realism` for the skin — but still paste this stack; it's what carries the texture through the video model.

## Order matters

Seedance weights early tokens more heavily, so the camera anchor must come first. Canonical order:

```
Filmed with iPhone → handheld cue → natural light source → optional artifact
    → casual framing → negative cue
```

Then the Realism-Lock Stack closes the prompt. A bare scene line plus this ordering is a complete, shippable UGC prompt.

## UGC Seedance settings (compact)

Measured on this account — treat as ground truth. Full table + platform notes in `references/settings-and-troubleshooting.md`.

- **Aspect 9:16** — TikTok/Reels/Shorts native. Non-negotiable for IG Reels.
- **Resolution 720p** — a free win here: 720p is **both the cheapest AND the community-preferred** resolution (sharper texture on lens flare / ambient detail than 1080p). Cost is linear per second — 720p is 4.5 cr/sec vs 1080p's 9 cr/sec.
- **Duration 8-12s, content-driven** — you fit hook + demo + proof + CTA. You canNOT shorten a talking UGC ad to the 4s cost floor the way a silent cinematic beat allows; manage cost by nailing the prompt first try and using Edit-and-Extend, not re-rolls.
- **Prompt length 50-150 words** — longer = conflicting instructions that break the natural feel.
- **count 1** — count multiplies cost (count 2 = 2x); don't fan out a UGC ad.
- **Camera keyword `Filmed with iPhone`** (NOT "Shot on phone") — stronger aesthetic trigger in Seedance training.
- **Blurry-reference trick** — a sharp real-face close-up usually gets rejected (Seedance blocks real-face uploads) and biases toward character uniformity; a partially blurry image yields a more unique, consistent character and bypasses face-detection filters.
- **`get_cost: true` preflight** — free, returns exact credits before you spend. Run it before every generation.
- Keyframe stills: **Nano Banana Pro at 2K, flat 2 credits** — always generate the still there first when doing image-to-video.

## Non-negotiables (learned the hard way)

- **Realism-lock every prompt.** The poreless/waxy default is the #1 AI tell; the skin-texture line is the cheapest fix that exists.
- **Order matters.** Early tokens dominate — camera anchor first, negative last, or the cluster under-fires.
- **Vague settings beat over-described ones.** `in a small kitchen` lets Seedance fill messy details that sell the look; describing every prop renders stiff and too-composed. Leave room for imperfection.
- **3-5 negatives, not more.** Use only the negatives that matter for the scene; stacking too many dulls the image.
- **No product before the 8-second mark.** Earlier and the viewer's ad-detection fires and the whole clip plays against that frame.
- **One believable action per take.** Hold product up, give one honest reaction, demo one use case — not three. Multiple actions per clip go chaotic.
- **Edit-and-Extend, not re-roll, for consistency.** Feed the first clip back ("extend this and make the actor continue saying…"); it holds character, environment AND voice (even Veo 3 couldn't hold voice) and avoids paying for a fresh roll.

## Composition — the tension to state out loud

This skill and `higgsfield-cinematic-video` pull in **opposite directions** and must never be mixed. ugc-iphone-realism wants handheld/amateur camera, ungraded natural color, and casual slight-angle framing for a phone-real ad; the cinematic skill wants named moves, graded color, and composed symmetry for a cinema reel. Use **ugc-iphone-realism** for phone-real UGC/ads; use **higgsfield-cinematic-video** (and **reel-production-playbook**) for cinematic reels. Blending them cancels both looks out.

Hand off the parts this skill does not own: **`creative-ig-video-idea`** for the concept, audience and hook packaging, and **`script-writer`** for the spoken lines / VO. This skill owns the visual authenticity and the Seedance prompt craft only. One rule shared with the rest of the studio: still/keyframe quality first when doing image-to-video — Seedance blocks real-face uploads, so animate from an AI keyframe (Nano Banana Pro) or use the blurry-reference trick.

## Reference map

- `references/iphone-look-and-realism.md` — the canonical six-part cluster expanded with the full phrase menu, the canonical token order, and the skin-mapping behind the realism-lock. Read when writing any prompt beyond the bare realism-lock.
- `references/prompt-templates.md` — the three master templates (iPhone-Look stacking, the 5-part phone-in-hand block, the full UGC ad brief) plus the seven verified copy-paste examples A-G (skatepark review, unboxing, facecam reaction, intimate review with identity reference, TikTok product review, street interview, travel vlog). Read when you need a scene-matched starting point.
- `references/settings-and-troubleshooting.md` — full Seedance settings, the linear-credit math, get_cost preflight, the negative-prompt checklist (pick 3-5), the prompt-engineering decision tree for when outputs miss, and platform notes (TikTok Shop, Reels). Read before generating or quoting cost, or when a render comes back wrong.
- `references/ugc-ad-structure.md` — the UGC ad arc (hook + demo + proof + CTA), the hooks, and the no-product-before-8s pacing. Read when structuring a full ad rather than a single take.
- `references/prompt-libraries.md` — the community prompt libraries (YouMind, Renoise, EvoLink, YouWare, BestSeedancePrompts, VIDEO AI ME) with sizes and URLs. Read when you want to pull or browse existing prompts.

**Pairs with:** `richie-persona` (locked face when the subject is you), `ai-human-realism` (skin depth behind the realism-lock), `higgsfield-cinematic-video` (the inverted cinematic counterpart), `creative-ig-video-idea` (concept/hook), `script-writer` (spoken lines).

**Do NOT use for:** cinematic / ARRI / anamorphic reels (use `higgsfield-cinematic-video` / `reel-production-playbook`), or anime / cartoon / stylized work.