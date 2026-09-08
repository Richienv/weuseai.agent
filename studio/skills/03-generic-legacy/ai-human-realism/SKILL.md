---
name: ai-human-realism
description: >-
  Build, prompt for, and diagnose photorealistic AI humans across a 9-layer likeness
  stack: skeleton, muscle/fat, macro + micro skin (SSS), hair-eyes-teeth-hands, body
  language, FACS expression, voice, and lighting. Use WHENEVER the user wants a realistic
  person, portrait, avatar, or character for AI image or video; asks why an AI human looks
  fake, plastic, waxy, stiff, or uncanny; or wants a face, skin, body, hands, eyes, smile,
  or expression to look more believable. Apply it BEFORE writing or judging any human
  prompt, because "realistic" alone makes models render smooth plastic skin — believability
  is engineered layer by layer, deepest failing layer first. Triggers on "make this person
  look real," "why does this face look AI," "fix the skin/eyes/hands," "photorealistic
  portrait," and "realistic character." Pairs with higgsfield-cinematic-video for motion.
  Do NOT use for anime, cartoon, stylized, or non-human subjects.
---

# AI Human Realism — the 9-layer likeness stack

Human realism is not one trick; it's a **stack of dependent layers**, built the way a real body is: structure first (skeleton), then volume (muscle + fat), then surface (skin), then the high-attention details (eyes, hair, teeth, hands), then behavior (body language), emotion (facial expression), sound (voice), and finally the physical context that validates all of it (lighting).

**The iron rule: you cannot fix an outer layer to hide an inner-layer failure.** Perfect pores can't rescue broken proportions; a detailed iris can't rescue a shrink-wrapped, fatless body. When something "looks AI," find the **deepest** failing layer and fix it first, then work outward.

## The single most important insight

The word **"realistic" backfires.** Models learned that "realistic / beautiful / high quality" correlates with polished, filtered, retouched photography — so "realistic skin" renders *smoother and more plastic*. Believability comes from explicitly prompting **imperfection and physics**: visible pores, asymmetry, subsurface scattering, micro-movement, motivated light. If you remember one thing, remember: **describe the flaws.**

## The stack at a glance

| # | Layer | Most common AI failure | Deepest fix |
|---|-------|------------------------|-------------|
| 1 | Skeleton / proportion | wrong limb ratios, impossible joints, no weight | "anatomically correct proportions, natural weight distribution, contrapposto" |
| 2 | Muscle + fat | "shrink-wrapped," fatless, plastic volume | "subcutaneous fat softening muscle, tissue thickness" |
| 3 | Skin (macro) | perfectly smooth, no folds, bilateral symmetry | gravity response, skin folds, subtle asymmetry |
| 4 | Skin (micro) | waxy, opaque, no pores | SKIN-BLOCK + subsurface scattering / translucency |
| 5 | Eyes/hair/teeth/hands | dead eyes, no catchlight, fused fingers, too-white teeth | catchlights, iris texture, anatomically correct hands |
| 6 | Body language | stiff, symmetrical, no weight shift | natural body language, weight shift, open/closed posture |
| 7 | Expression (FACS) | fake smile (no AU6), empty stare | Duchenne smile, brow/eye-led emotion |
| 8 | Voice / prosody (video) | flat, robotic, no breath, lip-sync lag | natural pacing, breath pauses, tight lip-sync |
| 9 | Lighting / context | flat, shadowless, no AO, no catchlight | motivated source, ambient occlusion, raking sidelight |

Each layer has a reference file in `layers/` (or `references/`) with the science, the failure modes, and the exact prompt vocabulary. Read the layer you're working on.

## How to use this skill

**Diagnosing ("why does this look fake?")** — walk the stack from Layer 1 up and name the *deepest* layer that's wrong (the table above and `references/uncanny-valley-fixes.md` are your checklist). Fix that first; re-judge; then move outward. Resist the urge to add pores to a body with broken proportions.

**Generating from scratch** — assemble the master prompt from modular blocks (anatomy → macro skin → micro skin → face/expression → body language → hair → lighting → technical). Full template in `references/master-prompt-architecture.md`. Keep blocks the user doesn't need short, but never skip the inner ones.

**Improving an existing prompt/character** — identify which layers are unaddressed (usually 1, 2, 3, and SSS), add those blocks, and strip any "flawless/beauty-filter/perfect skin" language that's forcing the plastic look.

## The 20% that fixes 80% (universal moves)

Reach for these on almost any realistic human, regardless of layer in focus:

- **SKIN-BLOCK** (put near the front): `matte skin texture with microrelief, natural imperfections: visible pores, freckles, scars, moles, slight sweat and shine in the T-zone`.
- **Subsurface scattering** — `subsurface scattering, translucent skin` (warm light through ears/nostrils/fingertips). This is the core difference between living skin and plastic.
- **Kill the filter** — add `unretouched, no beauty filter, no skin smoothing`; remove `flawless/perfect/poreless`.
- **Asymmetry** — `subtle facial asymmetry` (perfect bilateral symmetry is a top uncanny trigger).
- **Eyes** — `catchlights in the eyes, iris texture with limbal ring, aligned gaze, slight moisture on the lower lid`. Eyes are the #1 believability signal.
- **Genuine smile** — `Duchenne smile, cheeks raised, crinkles at the outer eyes` (AU6 + AU12), never just lip corners.
- **Anti shrink-wrap** — `subcutaneous fat softening muscle definition`.
- **Texture lighting** — `raking 45° sidelight, ambient occlusion in facial crevices`. Sidelight reveals skin; AO grounds the form.
- **For video humans** — idle life: `subtle weight shifts, natural breathing, irregular blinks (~15–20/min), micro head motion`; plus `natural body language` over emotion words (show the body, don't name the feeling).

## Reference map

- `references/layers-1-2-structure.md` — skeleton (proportion, bony landmarks, contrapposto) + muscle/fat (volume, the shrink-wrap problem, fat placement).
- `references/layers-3-4-skin.md` — macro skin (gravity, folds, asymmetry, age) + micro skin (pores, SSS, the SKIN-BLOCK, texture-revealing light).
- `references/layer-5-extremities.md` — hair, eyes (the big one), teeth, hands.
- `references/layer-6-body-language.md` — kinesics, posture, gesture-from-intent, idle motion.
- `references/layer-7-facs-expression.md` — FACS action units, the Duchenne rule, micro-expressions, eye-over-mouth.
- `references/layer-8-voice-prosody.md` — prosody, breath, fillers, lip-sync (video/interactive only).
- `references/layer-9-lighting.md` — global illumination, ambient occlusion, catchlights, lighting recipes, environment coherence.
- `references/master-prompt-architecture.md` — the modular block template + reusable skin/expression/lighting blocks.
- `references/uncanny-valley-fixes.md` — the layer-by-layer failure→fix diagnostic table and tools-by-layer.

## Do NOT use for

Anime, cartoon, illustration, or deliberately stylized characters; non-human creatures; or any case where realism isn't the goal. This skill optimizes for human believability, not art direction.

## Pairs with

For realistic human **video**, combine with the `higgsfield-cinematic-video` skill: this skill makes the human believable (skin, eyes, expression, body), that one directs the shot (lens, light, camera move, one action per shot, real transitions). Use both together.
