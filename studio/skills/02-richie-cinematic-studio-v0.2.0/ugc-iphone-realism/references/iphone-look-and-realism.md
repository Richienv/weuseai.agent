# iPhone Look & Realism — the authenticity engine

the iphone look is not a keyword. it's a **six-part prompt cluster** plus a **realism-lock skin stack**. skip any one element and the render slides back toward "AI ad" — viewers ID it in the first second. this file is the phrase-level deep dive: what to write, why each cue matters, what breaks if you omit it, and how the skin words map to ai-human-realism's skin layers for the owner's face.

read this when a render looks waxy, too-polished, or "obviously AI"; when you're assembling a UGC prompt from scratch; or when you need the exact vocabulary for camera, light, and skin.

this file owns two things — the **phrase-level cluster** and the **realism-lock / skin mapping**. everything else has a single owner elsewhere; pointers below:

- copy-paste master templates + verified example prompts → `prompt-templates.md`
- resolution / duration / cost, the Instagram tech strip, the decision tree, consistency tricks (Edit-and-Extend, blurry/shaky reference) → `settings-and-troubleshooting.md`
- ad arc, the 8-second rule, hook specificity → `ugc-ad-structure.md`
- community prompt libraries (URLs + sizes) → `prompt-libraries.md`

---

## why phone beats studio

polished studio creative loses to a phone shot in someone's kitchen on paid ads. this is not taste — it's signal. every imperfection tells the viewer's brain *a real human filmed this*:

- slight handheld bounce → a hand is holding the camera
- natural window light → no crew, no rented softbox
- messy background → a real room, not a set
- lack of perfect gimbal glide → no operator, no rig

seedance 2.0 was trained on enough real phone footage that these phrases pull the **whole** visual cluster, not just one attribute. so the grammar inverts normal prompting: you are not describing perfection, you are **prescribing imperfection**. "perfect", "symmetrical", "smooth", "cinematic", "graded" are the enemy words here. imperfection is the load-bearing signal.

this is the explicit tension with `higgsfield-cinematic-video`: that skill engineers ARRI/anamorphic polish, named camera moves, graded color, "avoid static camera". UGC wants the **opposite** — ungraded, handheld-amateur, casual/imperfect framing, no gimbal. **do not blend the two skills or they cancel out.** use this skill for phone-real UGC/ads; use higgsfield-cinematic-video (and reel-production-playbook) for cinematic reels.

---

## the six-part iPhone authenticity cluster

stack 3-4 of these reinforcing cues so the render lands consistently. "filmed with iPhone" alone leans toward the aesthetic but doesn't seal it.

| # | Element | What to write | Why it matters | Failure mode if omitted |
|---|---|---|---|---|
| 1 | **Camera Anchor** | "Filmed with iPhone" / "Shot on iPhone 15 Pro Max" | activates seedance's phone-footage training; the master trigger | render defaults to generic/cinematic camera language |
| 2 | **Handheld Cue** | "handheld slight bounce" / "handheld shaky energy" / "breathing shake" | seals the phone-in-hand feel; the anchor alone isn't enough | image is locked-off and steady → reads as a tripod/rig → studio |
| 3 | **Natural Light Source** | "window light" / "golden hour backlight" / "warm lamp light" | names a real, motivated source so the model doesn't invent one | studio key-light leaks in; flat even "showroom" lighting |
| 4 | **Optional Artifact** | "slight lens flare" / "colorful ambient reflections" / "autofocus breathing" | simulates real iPhone sensor behavior — the tells of a small phone lens | image is too clean/clinical; missing the sensor "personality" |
| 5 | **Casual Framing** | "casual framing" / "slight angle" / "natural indoor setting" | over-describing as perfect/symmetrical kills the vibe | stiff, too-composed, centered → looks art-directed → ad |
| 6 | **Negative Cue** | "No music, no logo, no text on screen" | blocks stock-footage / cinematic contamination | model adds title cards, watermarks, swelling music → "commercial" |

> this cluster table also appears in SKILL.md as the at-a-glance version. **this file is the canonical copy** — edit here first, then mirror up if the change is load-bearing.

### order matters

seedance weights early tokens more heavily. lead with the strongest trigger and decay outward:

> **Filmed with iPhone → handheld → light source → optional artifact → casual framing → negative.**

if a cue is fighting for attention with a weaker one, move it earlier.

### camera-anchor variants (pick one, place first)

- `Filmed with iPhone` — the default, strongest aesthetic trigger
- `Shot on iPhone 15 Pro Max` — when you want the look pinned to a specific recent sensor
- `Filmed with iPhone front camera` — selfie / facecam / talking-head; slightly softer, closer
- `Filmed with iPhone rear camera` — vlog / walk-and-talk / product held at arm's length

**use "Filmed with iPhone", NOT "Shot on phone".** "Filmed with iPhone" is a measurably stronger trigger in seedance's training; the generic phrasing dilutes it.

### light-source vocabulary (always name one — never leave light unspecified)

naming the source is what keeps the studio key-light out. by mood:

| Want | Phrase |
|---|---|
| warm, flattering, "magic hour" | "golden hour backlight" / "warm sunset backlight" |
| soft directional indoor | "soft window light from the left" / "soft natural window light" |
| cozy night interior | "warm lamp light" / "warm bedroom lamp light" |
| neutral daytime | "natural daylight" / "soft afternoon light" / "morning light" |
| facecam / low-light | "[screen / TV / ambient] light on their face" + "colorful ambient reflections" |

pair the source with a "no harsh highlights" / "no studio key light" qualifier when the model keeps over-lighting.

---

## the realism-lock stack (the single highest-impact block)

paste this at the **end** of any UGC prompt. it's the highest-leverage block in the whole skill — high-volume TikTok Shop operators run it on every generation:

```
Realistic skin texture, visible pores around nose and cheeks, natural slight unevenness,
no filter quality, handheld phone camera feel, slight angle, casual framing,
filmed in a real environment, soft window light from the left, natural indoor lighting,
no harsh highlights.
```

> this stack also appears verbatim at the top of SKILL.md because it's useful at first glance. **this file is the canonical copy** — make edits here so the two don't drift.

**critical warning:** without the skin-texture spec in *every* seedance prompt, the model defaults to a waxy, poreless render that viewers clock as AI within the first second. on TikTok Shop / paid ads this is **the single highest-impact cluster for defeating AI detection** — higher leverage than camera, light, or framing. when you only have budget for one anti-AI move, it's this.

### the skin-texture word cluster (why each word earns its place)

| Phrase | What it suppresses |
|---|---|
| **realistic skin texture** | the global "smooth plastic" default |
| **visible pores around nose and cheeks** | poreless airbrushed surface; the nose/cheek anchor forces the model to render the highest-pore-density zones |
| **natural slight unevenness** | uniform tone, symmetrical perfection, beauty-filter flattening |
| **no filter quality** | the TikTok/Instagram smoothing overlay that screams "filtered" |

these four are shorthand. they are the UGC-prompt compression of what `ai-human-realism` engineers in depth — say the words here; understand the mechanism there.

---

## mapping to ai-human-realism (when the subject is the owner)

when the subject is the plugin owner — "me" / "my face" / "my character" — this skill is general-purpose but you pull in two companions:

- **`richie-persona`** for identity (locked face DNA + anti-idealization). image models keep sharpening his jaw, enlarging his eyes, slimming his face; persona stops that. the realism-lock stack's "natural slight unevenness" reinforces anti-idealization — both are pushing away from the idealized-stranger render.
- **`ai-human-realism`** for the skin itself. the realism-lock cluster is the **prompt-level shorthand**; ai-human-realism is the engineering underneath it:

| Realism-lock phrase | ai-human-realism layer it triggers |
|---|---|
| "visible pores around nose and cheeks" | **Layer 4 / micro skin** — pore structure, microrelief, the literal surface detail |
| "no filter quality" / "natural slight unevenness" | **micro skin / SSS** — subsurface scattering, the soft light penetration that makes skin read as flesh not vinyl; tonal variation, blemishes, redness zones |
| "realistic skin texture" + "soft window light, no harsh highlights" | **Layer 9 / lighting** interacting with skin — soft motivated light reveals texture; harsh flat light flattens it back to plastic |

so the workflow when it's the owner's face: persona locks *who*, ai-human-realism specifies *how the skin behaves* on the keyframe, and this skill's word cluster carries that believability **through the seedance video prompt** so motion doesn't smooth it back out. diagnose deepest-failing-layer-first per ai-human-realism; the cluster is your fast field-fix, not a replacement for the layer work.

---

## the negative-prompt checklist

use **3-5 that matter for the scene**. stacking too many dulls the image — each negative spends a little model attention, so spend it where the scene actually risks the artifact.

- `no smooth gimbal` / `no steadicam` / `no dolly track` — these produce the exact polished look you're avoiding
- `no cinematic lighting` / `no studio softbox` / `no color grading` / `no heavy teal-orange`
- `no snap zooms` / `no whip pans` / `no Dutch angles` / `no jump cuts`
- `no extra fingers` / `no deformed hands` / `no melting edges`
- `no logos` / `no labels` / `no text overlays` / `no watermarks`
- `no neon lighting` / `no cartoon saturation`

if hands or labels keep breaking across 3 tries, that's a shot-plan problem, not a negatives problem — step back from close-up to medium (see the decision tree in `settings-and-troubleshooting.md`).

---

## where the rest lives (single-owner pointers)

this file deliberately does **not** re-paste the rest of the skill. go to the owner:

- **master templates (1-3) + verified example prompts (A-G)** → `prompt-templates.md`. fill the brackets, append the realism-lock stack above, run. keep "Filmed with iPhone" first and the negative last.
- **resolution, duration, credits/cost, the Instagram tech strip, the prompt-engineering decision tree, and consistency tricks (Edit-and-Extend, blurry-reference, shaky-reference-clip)** → `settings-and-troubleshooting.md`. short version: shoot **720p** (cheapest *and* community-preferred for UGC — sharper texture on lens flare / ambient detail), **9:16**, **count 1**, run `get_cost:true` preflight before spending, generate keyframe stills with Nano Banana Pro at 2K (flat 2 credits).
- **ad arc, the "never name the product before ~8s" rule, and hook specificity** → `ugc-ad-structure.md`.
- **community prompt libraries (URLs + sizes)** → `prompt-libraries.md`.

---

## hand-offs (this skill owns visual authenticity + Seedance prompt craft only)

- **`creative-ig-video-idea`** — concept, audience, hook packaging. run it *before* you prompt.
- **`script-writer`** — the spoken lines / VO that go inside the prompt's quotes.
- **`ai-human-realism`** + **`richie-persona`** — when the subject is the owner's face (skin depth + identity lock).
- **`higgsfield-cinematic-video`** / **`reel-production-playbook`** — cinematic reels. the inverse of this skill; never blend them.

one rule shared with the rest of the studio: **still/keyframe quality first** for image-to-video. seedance blocks real-face uploads — animate from an AI keyframe (Nano Banana Pro, 2K) or use the blurry-reference trick.
