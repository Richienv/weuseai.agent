# Cinematography grammar — the words that make it read as a real camera

Use real film vocabulary. Models trained on decades of described cinema; naming the lens, move,
light, and stock pulls output toward footage that was actually shot. Vague words pull it toward the
averaged, plastic "AI" center.

**Rules, not adjectives.** "Cinematic / high quality / epic" do nothing. Replace every adjective with a
camera rule or a piece of technical metadata:

| ❌ adjective | ✅ rule / metadata |
|---|---|
| "cinematic feel" | "one-take, slow dolly-in, 24mm wide lens" |
| "high quality" | "shot on ARRI Alexa 65, 35mm film grain" |
| "camera moves around subject" | "orbital 360° arc at constant radius" |
| "epic movement" | "FPV drone banking turn, wide-angle lens" |
| "realistic skin" | "subsurface scattering, visible pores, no 3D, no cartoon" |

The camera dimension should always cover: **shot size + angle + movement + camera rule + speed.**

## Camera language (name one move per shot — Camera is King)

Seedance/Kling are camera simulators; with no camera instruction you get random motion. Always name a move:
dolly-in/out, tracking/following, arc/orbit, crane up/down, rack focus, whip pan, handheld micro-shake,
OTS, and framing (CU/MS/WS). State where the move **ends**. Add "avoid static camera" to negatives.

## Camera Movement Dictionary (copy-paste, with effect)

Slow builds & reveals:
- `slow dolly-in at a steady creep, shallow depth of field with background softening` — tension, focus.
- `sweeping crane shot rising from close to reveal the wide landscape, camera ascends and tilts down` — scale.
- `2.5D parallax push into the scene, foreground and background separating` — depth from a still.

Action & energy:
- `explosive crash zoom snapping from wide to extreme close-up, debris blasting toward camera` — impact.
- `smooth orbital camera circling 360° at constant radius, subject centered, rim light wrapping the silhouette` — hero rotation.
- `high-speed FPV drone diving down [location], weaving around obstacles, hard banking turn at the end` — aggressive POV.

Handheld & realism:
- `handheld tracking shot following [subject] from behind, subtle shake for documentary realism, racking focus` — intimacy.
- `single continuous shot, unstabilized handheld, constant micro-jitters, abrupt jerks, wide-angle distortion` — raw first-person.

Transitions (shoot these into the clip ends):
- `fast whip pan, camera snaps sideways with heavy motion blur` — kinetic scene change.
- `bullet-time orbit around [subject] mid-air, camera arcs 180° while debris hangs motionless` — freeze moment.

## Lenses & motion energy

- **18–24mm** environment/scale · **35mm** natural documentary · **50mm** neutral portrait · **85mm** compression/bokeh.
  Add lens character: "shallow DoF", "anamorphic flares", "slight chromatic aberration", "focus breathing", "natural vignetting".
- **Motion energy must be explicit** — the model doesn't infer intensity. "car drives fast" → nothing;
  "car accelerates aggressively, tires screeching, motion blur, low tracking shot" → energy. Use specific
  speed words ("sprinting", "languid drift"), not vague ones ("moving dynamically").

## Lighting & Color-Grade Dictionary

| Style | Prompt | Best for |
|-------|--------|----------|
| Golden hour | `golden-orange sunset, heavy smoke, golden-hour mist` | outdoor drama, action |
| Teal-orange | `teal-and-orange blockbuster color grade` | action, adventure |
| Rembrandt | `Rembrandt lighting, texture light + natural light, visible god rays` | portrait drama |
| Documentary | `warm practical lighting, natural ambient energy, 50mm lens` | realism, UGC |
| Dark cinematic | `dark base tone, few bright highlights, desaturated` | horror, thriller |
| Golden interior | `warm sunlight through blinds, fine dust motes floating` | romance, JP drama |
| Night neon | `neon reflections on wet pavement, film-noir style` | city night, urban |
| Studio commercial | `soft studio key, crisp specular edge highlight, subtle dust particles` | product ads |

Style-block formula: `Visual style + Lighting + Color tone + Texture + Atmosphere (+ Music/SFX)`.
Bilingual cinematic lexicon (append Mandarin for Seedance coherence): Tyndall god rays 丁达尔效应光斑 ·
side-light sculpting 侧光勾勒人物轮廓 · backlit silhouette 逆光剪影 · hard top light 顶光投下锐利阴影 ·
blue-orange contrast 蓝橙对比色调 · desaturated vintage 低饱和复古暗调 · film grain 胶片颗粒感.
Banned unless a real source exists: glowing orbs, halos, rim-light from nowhere, unmotivated backlight.

## Reference stacking & stock

Stack 2–3 compatible style anchors for a unique look: "Studio Ghibli palette + Nolan cinematography +
Wes Anderson symmetry". Single anchors: "ARRI Alexa 65", "35mm film grain", "National Geographic
documentary", "Blade Runner", "film noir 1940s-meets-cyberpunk", "Apple keynote product". Don't stack
opposites that fight. Always add **fine grain + low saturation**; "24fps natural motion blur" (filmic) vs
"crisp 60fps" (sport).

## Composition

Rule of thirds, lead room, and a **foreground occluder** (leaves, a shoulder, smoke, a passing object)
for depth/parallax — foreground layers are hard to fake badly, so they make a shot feel photographed.

## One-line example

"35mm film emulation, shallow DoF, subtle handheld micro-shake, teal-and-amber grade, fine grain,
low saturation, 24fps; slow 10% dolly-in that settles static; single hard key high front-left, soft
falloff, warm practical glow behind; volumetric haze, embers drifting down with weight —
逆光剪影，镜头缓慢推进, avoid static camera."
