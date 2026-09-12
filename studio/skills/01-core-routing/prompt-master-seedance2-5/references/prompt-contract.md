# Locked-Realism Prompt Contract

Read this before composing every prompt. The user's pasted constraints outrank
this file. This file outranks cinematic habit.

Write English. Use these headings in this order, inside one code block.

## Canonical structure

```text
SCENE
[Time, city, hour, premise in 2–4 sentences.]
[What the take actually is: who is in frame, who is absent, one continuous
shot / no cut, the one job of the shot.]

REFERENCES
<<<handle>>> — role. 100% lock. What it is, which side, what must not change.
[One handle per asset. User's exact token: <<<uuid>>>, <<<image_1>>>, @image1.]
[If a file is appearance-only or light-only, say so in one line.]
[If none: "No external references."]

PHYSICS
[Hard object truth the model will otherwise invent.]
[Two-sided objects, hinge side, swing direction, what is visible mid-swing.]
[Scale ruler: named height vs a real object.]
[Omit this section only when nothing in the shot has two faces, a hinge,
a measured scale, or a geometry the model likes to "improve."]

LIGHT
[Night/day. The single practical source. It is constant from frame 1 to last.]
[What changes is occlusion or a body walking through a zone — never a lamp cue.]
[Brightness layers if inside/outside meet (darkest / mid / brightest).]
[Hex palette when the world already has one. Shadows have a color, not "dark."]

CAMERA
[Duration. One continuous shot. Real time unless a ramp was requested.]
[Machine position: which room, which corner, height in meters or eye-height
in cm, angle in degrees, what stays in frame, what is cropped.]
[Fixed vs the exact allowed motion. Default: camera does not travel.
Handheld breath only; no shake, no sway, no push, no pull, no zoom, no rack.]
[Lens, aperture, focus lock, what melts. Stock/grain only as concrete
material (35mm expired, Kodak 500T, oval anamorphic bokeh, halation on the
practical). No "cinematic" filler.]

TIMELINE
0.0–1.0s: [visible action + what the object/light does because of it]
1.0–3.0s: [...]
[Cover the full duration. One dominant action per beat. No emotion nouns
without a face/body change you can photograph.]

PERFORMANCE
[The job: automatic daily motion, or one micro-expression, or one reaction.]
[Where the accent lands on the clock, and how small it is.]
[Absolute bans for this take.]

SOUND
[Caused, diegetic, in the order they happen. No dialogue unless requested.]
[If a diegetic song exists in the room, name it as in-scene, off to the side.]

LOCKS
1 [The fact that will break first — usually the two-sided object or identity]
2 [Room 100% as the master still — listed objects, none added/moved]
3 [Light constancy + what the change actually is]
4 [Camera machine + duration + real time + no zoom]
5 [Subject lock + period + no mirror flip]
[4–6 items. Restate; do not invent new rules here.]
```

## Duration and one-job density

| Duration | Beats | Rule |
|---|---:|---|
| 5s | 2–4 | One action or one recognition. Nothing else. |
| 6–8s | 3–5 | Setup, the action, the settle. |
| 10–15s | 4–6 | Still one job. Extra time is for a reaction to finish, not a new plot. |
| 20s+ | only if asked | Still one prompt. Prefer another take over stuffing plot. |

Do not default to 15–30s. These models hold realism better on a short locked take.

A beat may contain coordinated motion (hands + tools, body + door) but one
action stays visually dominant. If you need a second job, that is another shot.

## Reference mapping

- Number or token references in the exact order the user attached them.
- One role per file: identity, wardrobe/hands, hero prop, room master,
  reverse face of a known object, start-frame composition, light-only backdrop.
- A file gets two roles only when unavoidable and stated.
- Identity references never donate architecture. Architecture references
  never donate a face. **Composition / film screenshots never donate a face.**
- Named identity is a geometric contract, not a vibe:
  - Paste the person's FACE LOCK (skull, hair, eyes, nose, mouth, jaw, ears).
  - `Face, skull, hair 100% as <<<richie_hero>>> + <<<richie_3q>>> + <<<richie_smile>>> (phone selfies). Do not beautify.`
  - `Face, skull, hair 100% as <<<renita_hero>>> + <<<renita_3q>>> + <<<renita_raw>>> (phone selfies). Do not beautify.`
  - `<<<scene>>> — composition / wardrobe / light / camera only. Donates zero face.`
- Write the lock as a contract, not inspiration:
  - `100% as <<<hall>>> . Do not add, delete, or move a single object.`
  - `Character appearance only. Same skull as the named hero + 6-angle sheet.`
  - `Location light only, fully defocused.`
  - `This is not another door — it is the other face of <<<hall>>>'s door.`
- Do not cite a missing asset or invent a handle.
- If no files are attached, keep REFERENCES and say so.
- If the subject is Richie, read `identity-richie.md` and paste that FACE
  LOCK before any other reference line.
- If the subject is Renita, read `identity-renita.md` and paste that FACE
  LOCK before any other reference line. Both in frame: paste both.

## Writing SCENE

SCENE is the premise a human would pitch on set, then the hard frame rule:

- Time and place that justify the wardrobe and fixtures.
- The action in causal order, before the clock exists.
- `One continuous shot, no cut.`
- `Only X is in frame` or `X does not appear — the camera is her.`

Weak: `A cinematic homecoming in a moody 90s hallway.`
Strong: `Mid-1990s Hong Kong, late night. She comes home: the door is opened
from outside with a key, corridor green spills into the warm-red hall, she
steps in and shuts it. As the slab closes, the tiger painted on the outside
face turns back to the corridor. High-angle, one continuous shot. Only she
is in frame.`

## Writing PHYSICS

If an object has two faces, a hinge, or a scale relationship, write it as law:

- One object, two faces. Never two copies.
- Which way it opens (into the room / out to the corridor).
- Hinge side, relative to **this** camera.
- What the camera sees mid-swing (outside face flashing, then gone).
- After close: which face remains, and whether the frame goes black because
  the slab covers the lens.
- A ruler: `iron rail ~110 cm; man 185 cm; rail sits just above his belt.`

Absolute bans belong here, not in a vibe-negative list:
`Never two doors. Never paint the tiger on the inside face. Never move the handle.`

## Writing LIGHT

- Name the one source and its color. It does not flicker.
- If a second color exists, it is another real source (corridor tube, night
  window, neon) entering through an opening.
- Describe the **shape on the floor or face** (green wedge on tiles; red raking
  the crown and cheek).
- When the opening closes, the invading color narrows and dies. Say
  `this is occlusion, not a lamp change.`
- When a body walks from a dark room into a lit corridor, say
  `the light on him changes because he moved through a zone, not because a light changed.`
- Ending black = slab covers lens, not a fade, unless the user asked a fade.

Hexes are optional but sticky once a world has them
(`warm amber #E99D25`, `red #BA0101`, `cold green #ADD794`, `near-black #040011`).

## Writing CAMERA

Answer all of these. Missing one is how shots go generic:

1. How long, how many takes, what speed.
2. Where the body of the camera is (corner, doorway, lock-distance, her eye).
3. Height and angle in numbers.
4. What the frame contains and what it refuses (ceiling? the cabinet? her
   whole body? only two hands and a lock?).
5. Does the camera travel? Default no.
6. Lens and depth: what is razor sharp, what is heavy blur, what is a
   foreground smear.
7. Stock as material, not mood.

Wong Kar-wai / 90s Hong Kong is allowed as a **placement and color** reference
when the user is in that world (high corner, 40°, red lamp, green corridor).
It is not a license to add drift, neon rain, or extra smoke.

## Writing TIMELINE

Each line is a clock range plus something a camera can record:

- Contact: latch, hinge, boot on tile, paper hitting a chest, waist hitting a rail.
- Travel: she crosses the threshold onto the mat; he stumbles backward out the door.
- Occlusion: the green wedge narrows to a line and dies; the tiger sweeps and leaves.
- Micro-body: one breath, one blink, eyes widen a millimeter, jaw sets.

State off-screen facts as already done when that is the design
(`the man has already gone through the beads — all of it happened before frame 1`).

Never: `she becomes emotional`, `the camera dynamically follows`, `slow-mo emphasis`.

## Writing PERFORMANCE

One paragraph. Three parts:

1. The task (`everyday automatic coming-home`; `practiced burglar hands, hurried
   but not sloppy`; `only the recognition`; `dazed then offended, not sad`).
2. The accent and its size (`the half-beat of easing after the door shuts`;
   `eyes widen a fraction at 0:02 — never a stare`).
3. Absolute bans (`never look at lens, never remove shoes, never touch a light,
   never extra glance-back, never slow motion, never speak, never bite a lip`).

If the subject is the camera, say the performer does not appear.

## Writing SOUND

List caused sounds in time order. Room tone is allowed. Score is not.
No dialogue unless requested. No subtitles.

## Writing LOCKS

LOCKS are the generation-survival list. Copy the facts that physics, light,
camera, and identity already stated. A lock that introduces a new idea is a
mistake — put that idea in the proper section first.

Typical five:

1. The two-sided object / hero prop.
2. The room master still, object-complete.
3. Light constancy + the real cause of any brightness change.
4. Camera machine + duration + real time + no travel/zoom.
5. Subject + period + no mirror.

## Output wrapper

One optional settings line, then one `text` fence. No second block, no HTML,
no shotlist, no asset-building detour unless asked.

If a live duration cap conflicts with the request, say so in one sentence
before the block. Still return one prompt.
