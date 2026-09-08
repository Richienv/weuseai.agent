# Prompt Blueprint — the shot report that reads as cinema

Read this before writing any video prompt. The blueprint forces the same decisions a real
crew makes on set, leaving the model nothing to guess.

## The Director's Framework (order matters)

```
[Subject + specific detail] → [Action/motion] → [Camera] → [Environment]
    → [Lighting/mood] → [Style] → [Constraints]
主体 → 动作 → 镜头 → 场景 → 风格 → 约束
```

Reserve the **last line for lighting + camera** — it's the highest-signal real estate in the
prompt. Example endings: "— backlit silhouette, camera slowly pans right" /
"— hard top light casting sharp shadows, low-angle upshot / 顶光投下锐利阴影，低角度仰拍".

## Text-to-image vs image-to-video (critical distinction)

**Stills / text-to-image** — describe everything: subject, wardrobe, environment, light. You're
building the frame from nothing.

**Image-to-video (the default Higgsfield workflow)** — you already have a locked still, so **do
NOT re-describe what's in it** (the outfit, the hair, the face, the set). Repeating the image's
contents makes the model *reinterpret* and redraw them, which is exactly what breaks consistency
and drifts the face. Describe **only what changes**: motion, camera move, lighting shift, physics.

```
❌ image-to-video: "A 25-year-old man in a black t-shirt with short dark hair stands at the
   Zhejiang University gate at night, he is fit and confident..."  (re-describing the still)
✅ image-to-video: "He takes one slow breath and a faint smile forms; mist drifts past;
   slow 8% dolly-in on a 50mm lens; warm gate light, fine grain."  (motion + camera + light only)
```

Keep an identity-lock note only if the tool needs it ("preserve face and identity"), nothing more.

## The full annotated template (per shot)

```
STYLE / FORMAT
  Look: "ultra-photorealistic, 35mm film emulation, fine natural grain, low saturation,
    shallow depth of field, 24fps, 9:16". Keep identical across every shot so cuts feel like one film.
  Grade: name it — "teal-and-amber / 蓝橙对比", "desaturated vintage dark / 低饱和复古暗调".

SUBJECT
  Stills: full description + identity lock ("the exact person in @Image 1 — preserve face precisely").
  Image-to-video: identity-lock note ONLY; do not re-describe appearance (see above).
  Wardrobe (stills): solid colors, simple fabric — no plaid/stripes/dense logos (they shimmer).

ACTION  ← the make-or-break block
  Exactly ONE believable beat, PRESENT TENSE, with weight, timing, and explicit ENERGY.
    - "He takes two slow, heavy steps toward camera, weight settling on each foot."
    - "The car accelerates aggressively, tires screeching, dust kicking up behind."
  Forbidden inside a shot: transformations, aging, day↔night, 180° turns, set changes — those are CUTS.

CAMERA  ← never omit
  Lens: 24mm (wide), 35mm (natural), 50–85mm (portrait/compression).
  Support: static tripod / smooth gimbal / subtle handheld micro-shake (handheld reads as human).
  Move (named, ONE, slow, and ended): "slow 10% dolly-in settling static", "track back to hold size",
    "gentle arc left", "rack focus from foreground to face", "crane up to reveal".
  Start+end intent: say where it lands — "opens wide, lands on his face by the final frame".

LIGHTING
  Sources named + direction + quality + color temp + named effects (Tyndall/volumetric shafts,
    side-light sculpting, backlit silhouette, soft falloff). MOTIVATED light only.

ENVIRONMENT / PHYSICS  ← sells "real"
  Weight words: "gravity-affected smoke curling low", "embers drifting down on the breeze",
    "fabric and hair shifting subtly in wind", "rain soaking her hair".

NEGATIVE
  Artifact list (anti-ai-tells.md) + "avoid static camera". Always include grain + low saturation.
```

## Temporal storytelling (within a single shot)

For a shot with a small arc, state the beginning→end explicitly: "**starting with** a tight close-up
on his eyes, **transitioning to** a slow pull-back, **ending with** his full silhouette against the
gate." This gives the clip purpose and a controlled camera landing instead of aimless motion. Keep it
to one continuous move — it's a camera arc, not a content transformation.

## Why our "Young vs. Warrior Self" prompt worked (study it)

It read as cinema because it declared a consistent STYLE, locked identity on both characters, broke
the idea into **three discrete shots with timecodes** (CU → OTS → wide two-shot, no morphing between
them), gave **physics** ("fire, smoke, ember and ash physics, particles passing the faces"),
constrained the **camera** ("slow, deliberate, no shake, final frame static"), brutally constrained
the **light** ("no rim-light beam, no glowing orb, no light behind the subjects"), and carried a real
**NEGATIVE** block. That density is the standard.

## Why the "smooth transition" glow-up failed (learn from it)

One clip was asked to "morph from 18-year-old at an Indonesian school in daylight into a fit
25-year-old at a night gate" — four transformations at once (age, body, location, time). No model
holds identity or physics through that, so it cross-dissolved and the face drifted. It looked AI
because it *was* the most AI thing you can ask for.

## The same glow-up, directed correctly (worked example)

A 3-shot **skit**, each shot one clean action, joined by real cuts:

- **SHOT A (past, 3s, image-to-video from the 18yo still).** ACTION: he lifts his head and half-smiles,
  a light breeze moves his hair — nothing else. CAMERA: 35mm, slow 8% push-in, tripod. LIGHTING: soft
  overcast. (No re-describing his outfit — it's in the still.)
- **TRANSITION:** match cut on the head-turn, or a foreground object (a passing student, a flag edge)
  wipes frame.
- **SHOT B (present, 4s, image-to-video from the 25yo still).** Same STYLE family, night/teal-amber.
  ACTION: he finishes the head-turn toward camera and settles, one breath. CAMERA: 50mm matched push-in
  so the cut feels continuous. LIGHTING: warm gate floodlights, wet-ground bounce.
- **SHOT C (button, 2s, optional).** Wide hero, static, embers/mist drifting — held final frame for the payoff.

Assemble A→B→C with a **match cut on the head-turn**. The world changes at the cut, not inside a take —
which is how real films do a "transformation," and why it reads as directed, not generated.

## Length & pacing

- Single shot: 3–6s (test at 3–5s first). Past 6s, frames drift.
- A reel: 2–4 shots cut together = 8–15s. Length is an *editing* outcome.
- Hold the final frame ~1s for the payoff/thumbnail; add "seamless loop-ready motion" if it should loop.
