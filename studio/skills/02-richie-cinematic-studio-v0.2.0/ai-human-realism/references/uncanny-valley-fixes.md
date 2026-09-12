# Uncanny-Valley Diagnostic — failure → fix, by layer

The uncanny valley is the real perceptual effect where a near-realistic human becomes *more* unsettling
the closer it gets, until it crosses into true photorealism. Navigate it by **finding the deepest failing
layer and fixing it first** — surface patches never close the valley.

## Diagnostic table (walk it top-down; stop at the first layer that's wrong and fix there)

| Layer | Telltale failure | Fix |
|-------|------------------|-----|
| 1 Skeleton | wrong proportions, impossible joints, square dead-weight stance | "anatomically correct proportions, natural weight distribution, contrapposto" |
| 2 Muscle/fat | shrink-wrapped, fatless, plastic volume | "subcutaneous fat softening muscle, tissue thickness" |
| 3 Skin macro | perfectly smooth, no folds, bilateral symmetry | gravity response, skin folds, "subtle facial asymmetry" |
| 4 Skin micro | waxy/plastic, opaque, no pores | SKIN-BLOCK + "subsurface scattering, translucency"; remove "flawless" |
| 5 Eyes | dead stare, flat iris, no/!misplaced catchlight, misaligned gaze | "catchlights, iris texture, limbal ring, aligned gaze, eye moisture" |
| 5 Teeth/hands/hair | veneer-white teeth, fused fingers, helmet hair | off-white teeth; "anatomically correct hands"; flyaways/baby hairs |
| 6 Body language | stiff, symmetrical, no weight shift, motion-from-nowhere | "natural body language, weight shift"; describe intent behind gesture |
| 7 Expression | fake smile (no AU6), empty eyes, mouth-only emotion | "Duchenne smile, cheeks raised, eye crinkle"; drive emotion from brow/eyes |
| 8 Voice (video) | flat prosody, no breath, lip-sync lag | "natural pacing, breath pauses"; tighten sync or use voiceover |
| 9 Lighting | flat/shadowless, no AO, no catchlight, mismatched to scene | motivated source, "ambient occlusion," catchlights, raking sidelight |

## Three triggers that sink most "almost real" humans

1. **Plastic skin** — no subsurface scattering + "realistic/flawless" smoothing. Fix: SKIN-BLOCK + SSS,
   strip beauty-filter words, raking sidelight.
2. **Perfect symmetry** — both halves identical. Fix: "subtle asymmetry" (face, brows, mouth corners).
3. **Dead eyes** — missing catchlights, flat iris, off-target gaze. Fix: the eye block (Layer 5).

If you fix only these three on a structurally sound figure, most images jump from "AI" to "photo."

## Diagnostic phrasing for the user

When asked "why does this look fake?", answer by **naming the deepest failing layer and why**, then give
the specific block to add — e.g. "It's Layer 4: the skin has no subsurface scattering, so it reads waxy.
Add the SKIN-BLOCK and a raking 45° sidelight, and remove 'flawless skin.'" Avoid vague advice like "make
it more realistic" — that's the exact word that caused the problem.

## Tools by layer (general guidance, verify current versions)

| Need | Typical strong options | Note |
|------|------------------------|------|
| Skin texture stills | Midjourney `--style raw`, Flux + realistic-skin LoRA | LoRAs help SDXL/Pony skin |
| Full-body anatomy | Flux, Nano Banana / Seedream | avoid models weak on hands |
| Face/expression + identity | GPT Image (quality: high) | lock identity via a clear reference |
| Video body language/lip-sync | Veo, Kling, Seedance | lip-sync tools matter for trust |
| Expression analysis | Hume AI / FACS tooling | AU-level measurement |
| Interactive avatars | D-ID, Synthesia, HeyGen | sync quality > visual polish for trust |

Treat tool names as fast-moving; the layer principles are stable, the tools are not.
