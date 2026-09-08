---
name: prompt-master-seedance2-5
description: >-
  Use when the user wants a Seedance 2.5 or Cadence 2.5 video prompt, asks to
  prompt Seedance/Cadence, turn a brainstorm, script, still, or reference pack
  into copy-paste generation text, repair a prompt that feels too AI or
  unrealistic, or recreate a locked-realism shot (one continuous take, fixed
  camera, hard object physics, timed everyday performance). Prefer this when
  they say one prompt, one part, or copy-paste. Do not use for paid generation,
  generic filmmaking advice, other video models, or HTML shotlists.
---

# Prompt Master Seedance / Cadence 2.5

Write one English prompt the user can paste into Seedance 2.5 or Cadence 2.5.
The prompt is a **physical contract**, not a cinematic mood paragraph.

A good prompt reads like a shooting order for a real room: what exists, which
face of the object is showing, where the camera is bolted, which lamp is on,
what happens on the clock, and the four facts that will break first.

## Read first

- Always apply `taste` before writing CAMERA. Each video needs a unique
  compositional thesis. House laws are the filter, not a stamped frame.
  "Make it realistic" is not a sentence — name the capture device and
  leftover skin (`taste` / material).
- If the job has 3+ named people, a shared object that changes owner, a
  legal procedure, a chase camera, diagrams, a vlog, or MiniDV, also
  apply `taste` / control. Spectacle last. Still one prompt, one block.
- Always read [references/prompt-contract.md](references/prompt-contract.md).
- Read [references/realism-and-continuity.md](references/realism-and-continuity.md)
  when people, props, rooms, doors, scale, or recurring locations appear.
- Read [references/examples.md](references/examples.md) before writing the first
  prompt in a session. Clone that voice. Do not invent a new template.
- If the subject is **Richie** (the user / him / `<<<richie_*>>>`), also read
  [references/identity-richie.md](references/identity-richie.md). Paste the
  FACE LOCK into REFERENCES verbatim. Attach the **real** crops first:
  `<<<richie_hero>>>` (front selfie) then `<<<richie_3q>>>` then
  `<<<richie_smile>>>` before any generated sheet or scene still. Never
  attach the studio beauty plate as the face. Scene stills donate camera,
  wardrobe, and light — never a face.
- If the subject is **Renita** (her / `<<<renita_*>>>`), also read
  [references/identity-renita.md](references/identity-renita.md). Same law:
  paste her FACE LOCK verbatim. Attach the **real** crops first:
  `<<<renita_hero>>>` (cable-knit selfie) then `<<<renita_3q>>>` then
  `<<<renita_raw>>>` (gym skull) before any generated sheet or scene still.
  Never attach the beautified studio plates. She is 153 cm. When both
  appear, paste **both** FACE LOCKs and state the height gap (174 vs 153).

## Non-negotiable one-part lock

- Return exactly **one master prompt in one fenced `text` block**.
- Put every beat, occlusion, and sound inside that block.
- Never label output `Part 1`, `Part 2`, `Prompt A`, or equivalent.
- Never generate a shotlist, HTML file, or essay unless asked.
- If duration exceeds a known provider cap, say so in one sentence, then still
  return one prompt. Do not auto-split.
- Multiple prompts only when the user asks for variants. Each variant is still
  one part.

## What "too AI" means — ban these defaults

The old skill over-directed. Do **not** reach for these unless the user asks:

- "Keep the camera alive", orbits, push-ins, pull-outs, motivated moves per beat
- Slow motion, speed ramps, impact grammar, fracture poetry
- "Ultra cinematic", "stunning", "dynamic", "epic", "atmospheric"
- "Make it more realistic", "photorealistic", "authentic smartphone quality"
  (name the capture device and leftover skin instead — `taste` / material)
- The slogan `Face stable throughout, no deformation.`
- Multi-beat 15–30s narratives with internal hard cuts
- A `NEGATIVE:` dump that restates vibes instead of physical failure modes
- Inventing a second door, a second person, a light cue, or a camera move
  "to make it more cinematic"

Default film is **real time, one continuous take, camera nailed down,
everyday automatic action, one accent**. Movement, ramps, and cuts are opt-in.

## Workflow — brainstorm to locked prompt

The user will often dump a loose idea. Do not interview them to death. Infer
like a DP who already knows the apartment. Ask only if a **hard physics fact**
is missing and would break the shot (hinge side, who is in frame, which face
of a two-sided object, duration).

1. Name the **one job** of the shot in one sentence. The whole take performs
   that one thing. Everything else is off-screen or already happened.
2. Inventory the **real room**: objects, which side faces camera, materials,
   period, who is visible, who is absent.
3. Map only assets the model will receive. Keep the user's exact handles
   (`<<<uuid>>>`, `<<<image_1>>>`, `@image1`). One role per file.
   Named people need a geometric FACE LOCK, not "same person as the still."
   For Richie: hero, then 6-angle sheet, then body if the frame needs it.
   For Renita: hero, then 6-angle sheet, then body if the frame needs it.
   Both in frame: both FACE LOCKs + 174 cm vs 153 cm.
4. Lock invariants **before** action: identity (skull / hair / ears),
   wardrobe, object geometry, room layout, single light source, weather,
   period.
5. Place the camera as a machine: height, angle, room corner, distance, lens,
   what is sharp, what is melted. Default: **fixed**. **REQUIRED:** `taste` —
   name a this-shot-only thesis, then write it as the first concrete sentence
   of CAMERA. Do not clone the last prompt's machine onto a new job.
6. Write the clock in seconds. Each beat is visible action + caused change
   (occlusion, contact, breath). Not emotion labels. Leave a settle. Do not
   fill the clock.
7. Write performance as automatic daily motion + one micro-accent. Ban
   look-at-lens, extra business, slow-mo, and amplitude the shot does not need.
8. End with numbered **LOCKS** — the 4–6 facts that must survive generation.
9. Run the final checks, including the `taste` gate. If CAMERA is generic,
   rewrite CAMERA before delivering. Return one settings line + one `text`
   block.

If the user pasted a high-detail prompt (any language), preserve its exact
constraints first, then map them into the English sections. Never drop a
named object, hex, height, hinge, or "never" rule.

## Canonical sections — this order

```text
SCENE
REFERENCES
PHYSICS          ← omit only if no two-sided object, hinge, scale, or hard geometry
LIGHT
CAMERA
TIMELINE
PERFORMANCE
SOUND
LOCKS
```

Do not use `SHOT / CAMERA / SEQUENCE / STYLE / NEGATIVE`.
Do not add `TECHNICAL BLOCK` unless the user is iterating on a prompt that
already used that wrapper.

## Defaults

| Decision | Default | Only change when |
|---|---|---|
| Language of the prompt | English | User explicitly asks another language |
| Duration | 5–8s for one action | User gives a duration |
| Takes | One continuous shot, no cut | User asks for cuts |
| Speed | Real time. No slow motion | User gives a ramp |
| Camera | Fixed. Handheld breath only | User asks track / POV / follow |
| People in frame | Only the named subject | User puts more in frame |
| Light | One practical, constant. Change = occlusion | User asks a lighting cue |
| Music | None. Diegetic only if the scene has a source | User asks score or a song |
| Text | No subtitles, logos, readable signs | User asks on-screen text |
| Period | Whatever the references imply; no anachronisms | — |
| Aspect | 21:9 if anamorphic / film-still; else 16:9 cinema or 9:16 phone | User names a ratio |

Do not call a paid generation tool just because they asked for a prompt.

## Direction rules

- Timed beats are physical: who moves, what contacts, what the door/light/fabric
  does because of that move.
- Camera is a position in the room, not a vibe. Give height, angle, which wall,
  what stays in frame, what is cropped.
- Light does not flicker, swell, or cut unless a real object covers it. A closing
  door eats a green wedge. A slam to black is the door slab, not a fade.
- Two-sided objects need both faces named (outside tiger / inside plain walnut).
  State which face is visible at open, during swing, and after close.
- Scale needs a ruler: railing height vs a 185 cm man, a 158 cm woman vs a door.
- Off-screen action is written as already finished when the take starts, if
  that is the design. Do not restage it in frame.
- Sound is caused and diegetic. Put it in SOUND, not as score language.
- LOCKS restate the failure modes as positives + never-rules. This is the
  real negative list. Keep it numbered and short.

## Output protocol

One short settings line, then one fenced `text` block:

`Seedance 2.5 · 6s · 21:9 · 720p · count 1`

No second prompt, no setup guide, no postscript unless asked.

## Final checks

- One prompt, one clock, one job.
- Every cited handle exists and matches attachment order.
- Duration, ratio, real-time (or the requested ramp) are explicit.
- Identity, wardrobe, room, light source, and period do not drift.
- Camera is a machine position; default fixed; no unasked push/zoom/orbit.
- Taste thesis is unique to this shot and written into CAMERA. Slop defaults
  refused. First valid draft is not enough.
- Light changes are occlusion or subject travel through a zone, not lamp cues.
- Two-sided objects never grow a second copy or swap faces.
- Timeline is second-accurate and physically possible in one take.
- Performance is automatic + one accent; no look-at-lens; no extra business.
- LOCKS cover the 4–6 facts that would break first.
- No music/subtitles/readable text unless requested.
- No cinematic filler adjectives.

## Conditional: geometry / side-profile lock

Only when the user asks for hard-geometry, orthogonal, or side-scroller action:

- Axis lock: `locked profile`, `locked lateral path`, `no axis crossing`,
  `no 180° flip`, `camera stays on the same side of the action`.
- Camera travels parallel, constant height, constant speed. No corrective
  tilt or pan. No push-in.
- Architecture stays true: same facade, same window rhythm, no invented
  roof pitch or bend.
- Do not split one protagonist into two bodies.

## Conditional: named identity (Richie / Renita)

When the subject is Richie or Renita, identity outranks every scene screenshot.

- Read `identity-richie.md` and/or `identity-renita.md`.
- Paste each FACE LOCK block into REFERENCES. Do not paraphrase it.
- Attachment order per person: **real selfie crops first**, then generated
  sheet (helper only), then body (if torso/full body), then scene still last.
  Richie: hero (front selfie) → 3q → smile → soul → sheet. Never attach
  `richie-id-hero-studio.png` as the face.
  Renita: hero (cable-knit) → 3q → raw gym → soul → sheet. Never attach
  the old beautified plates.
- Scene still line: `composition / wardrobe / light / camera only. Donates
  zero face.`
- Richie LOCKS: FACE LOCK + anti-beautify (no slim, no thin nose, no idol
  eyes, no cousin-face laugh) + empty ears + hero hair (beanie may hide
  only the crown; temples still show black volume).
- Renita LOCKS: FACE LOCK + anti-beautify (no slim, no thin nose, no
  idol eyes) + 153 cm + warm auburn hair + silver hoops + no AirPods.
- Both in frame: she is 153 cm, he is 174 cm; the height gap is obvious.
- If a generate copies the actor in the screenshot, drop that file and keep
  only hero + sheet + a text description of blocking.

## Conditional: speed ramps

Only when the user (or a pasted reference) names a ramp. Map it exactly
(`1.0x → 0.35x at 2.1s → 1.0x at 4.0s`) inside TIMELINE. Do not blend.
Do not add ramps "for impact."
