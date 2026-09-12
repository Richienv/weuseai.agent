---
name: seedance-shotlist-director
description: >-
  Turn a script, treatment, scene breakdown, ad concept, or story idea into an editable
  director's shotlist and production-ready English prompts for Seedance 2.5, with
  Seedance 2.0 compatibility. Use whenever the user asks for a Seedance shotlist,
  shot-by-shot prompts, CUT-separated scenes, a narrative sequence, montage coverage,
  reference mapping, continuity repair, or revisions to an existing shotlist HTML.
  Route each request into narrative mode (precise 15-second continuity blocks) or
  coverage-montage mode (15-30 seconds of abundant editorial options), assign every
  @image a named role, lock character/environment/style continuity, time-code physical
  actions and inline diegetic sound, and output one self-contained editable HTML file.
---

# Seedance Shotlist Director

Direct the film; do not transcribe the script. Convert narrative intent into blocking, camera, light, physical performance, sound, continuity, and edit-ready coverage.

Target Seedance 2.5 by default when the user asks for 2.5 or does not name a version. Preserve Seedance 2.0 compatibility when requested or when the connected provider only exposes 2.0.

## Read the relevant references

- Read `references/seedance-2-5-prompting.md` before writing any Seedance 2.5 prompt, montage, UGC sequence, or prompt repair.
- Read `references/asset-and-production-workflow.md` before a multi-scene ad, recurring-character story, product film, or any job with recurring locations/props.
- Use the user's custom style block verbatim when supplied. Otherwise create one stable style paragraph and reuse it without paraphrasing across asset generation and every Seedance prompt.

## Deliverable

Create one self-contained `shotlist.html` containing:

1. Project title, target model, aspect ratio, and intended duration.
2. A collapsible global Style block.
3. A collapsible Reference Map listing each handle, role, and required asset.
4. Numbered scenes with one checkbox per scene.
5. One or more copy-ready prompts per scene, labeled `1a`, `1b`, `2a`, and so on.
6. A mode badge on every prompt: `NARRATIVE` or `COVERAGE MONTAGE`.
7. A concise post-production note for music, captions, overlays, and selected source ranges.

Persist checkbox state in `localStorage` using stable scene-number keys. Add a Copy button per prompt. When `/mnt/user-data/outputs/` exists, save there; otherwise save in a writable project/output directory and return the exact path.

## Choose the mode before writing

### Narrative mode

Use for dialogue, story continuity, product actions, identity-critical scenes, and any shot that must connect invisibly to the next.

- Target one 15-second block unless the provider imposes a different limit.
- Use at most 3-4 timed beats per 15 seconds.
- Keep each prompt under 3,500 characters.
- Use the full locked reference set required for that block.
- Split longer scenes into linked prompts rather than overstuffing one prompt.

### Coverage-montage mode

Use when the editor needs abundant B-roll, inserts, alternate angles, aggressive rhythm, or unexpected visual options.

- Convert roughly 2-5 seconds of intended final-screen time into 15-30 seconds of source coverage.
- Respect the provider's live duration limit. If 30 seconds is unavailable, write two linked 15-second montage prompts.
- Invite alternate angles and editorial options explicitly.
- Use fewer references than narrative mode so the model can invent coverage while preserving the primary subject and style.
- Break the 3-4 beat ceiling deliberately; montage beats may be dense and fast.
- Label the intended usable excerpt and remind the editor that most generated material is coverage, not final duration.

Never silently launch a batch. Recommend a coverage count based on budget, preflight cost when tools allow it, and get explicit approval before submitting multiple paid generations. Spend on planned coverage, never on unchanged rerolls.

## Canonical Seedance 2.5 prompt contract

Write every standalone 2.5 prompt in this order:

```
SHOT:
[Prompt ID, mode, duration, one-line dramatic or editorial purpose.]

REFERENCES:
[@image1 = exact role; @image2 = exact role; include only files the model receives.]

CHARACTER @image1:
[Repeat the same identity anatomy and wardrobe lock; then state visible action and emotional state.]

SETTING @image2:
[Exact location, subject positions, light direction, materials, weather, and continuity state.]

CAMERA:
[Lens/FOV, distance, height, framing, one motivated move or explicitly motivated hold, lighting behavior.]

SEQUENCE:
0:00-0:04 — [shot + physical action + camera + inline diegetic sound]
0:04-0:09 — [...]
0:09-0:15 — [...]

STYLE:
[The exact shared style paragraph, unchanged across tools and shots. Include aspect ratio, duration, and 24fps when desired.]

NEGATIVE:
[Only short, observed failure modes; never contradict the positive prompt.]
```

For 2.0 compatibility, retain the same information even if the provider prefers a Style-first layout. Do not omit the reference map, timed sequence, identity lock, or inline sound.

## Mandatory locks in every prompt

- Write `Face stable throughout, no deformation.` whenever a human face is visible.
- Assign every reference a named role and number it in the same order in which it is attached.
- Never cite an image, video, audio file, or Element that the model will not receive.
- Write `No music. Diegetic sound only.` unless the user explicitly requests native dialogue or a supplied audio reference.
- Keep in-frame text out of generation. Add captions, UI copy, logos, labels, and legal text in post.
- Keep negatives short and empirical. Add a negative only after that defect appears or when it is a known high-risk failure for the shot.
- Do not copy contradictory negatives from examples. A photoreal prompt cannot also say `no photoreal rendering`; a 180-degree shutter prompt cannot also ban motion blur.

## Direct the timed sequence

Treat `SEQUENCE` as the core of the prompt.

- Convert emotion into body mechanics: jaw pressure, breath rate, eye movement, hand tension, weight shift, hesitation.
- Specify physics: trajectory, distance, inertia, contact, impact, recoil, settling, and reaction.
- Put sound inside the beat that causes it. Do not append a detached sound-effects list.
- Build rhythm through contrast: wide versus macro, fast versus held, loud impact versus quiet reaction.
- Make objects enter frame through visible hand or body action. Never let a prop teleport into the scene.
- Name concrete choreography. Replace `he dances` with timed steps, shoulder isolations, foot placement, and recovery.
- Give each camera move a dramatic reason. A still frame is valid only when the held composition creates tension; otherwise give it subtle life.

## Reference discipline

For identity-critical narrative work, use the references needed to lock the cast, wardrobe/state, props, environment, and style. A practical range is 4-10 references, but always obey the live provider/tool cap.

For inventive montages, reduce the reference set to the primary subject, rough environment, and style anchor. Do not overload the model with every asset when invention is the goal.

Build references as follows:

- Character: one master identity plus useful angle coverage. Prefer separate single-face angle images or a clean three-angle sheet. If a multi-face composite causes drift, return to one clear identity face and a separate rear/body sheet with no competing face.
- Environment: 2-3 angles with consistent architecture, materials, and light.
- Product/prop: clean turnaround or product sheet showing the views needed by the action.
- Position-critical set: schematic/top-down map with named positions and scale relationships.
- State change: separate locked assets for dry/wet, clean/damaged, wardrobe changes, or aging.

## Continuity across prompts

Use one continuity block per narrative sequence:

- Reuse the exact same reference handles, character descriptors, environment descriptor, style paragraph, and lighting state. Copy; do not creatively rewrite.
- Carry forward body state, wardrobe, damage, wetness, prop ownership, emotional residue, and positions.
- Bridge prompt A to prompt B with the same diegetic sound cue.
- When B continues A's action, repeat the outgoing framing, eye placement, direction of travel, and hand/prop position in both prompts.
- Keep the primary referenced subject detailed; simplify secondary crowds, vehicles, or opponents and keep them distant when possible.

## Audio and dialogue

Default to native environmental and mechanical SFX; they are often the most useful generated audio. Add music in the edit.

Use native dialogue selectively:

- For cinematic narrative, prefer recording/adding final dialogue in post unless the user explicitly wants native speech.
- For UGC talking heads, native dialogue may be used. Write filler words, pauses, trailing phrases, and quiet action-only stretches rather than uninterrupted ad copy.
- If continuity matters across generated blocks, bridge them with the same breath, ring, impact tail, room tone, or mechanical sound.

## Workflow

1. Read the script as a director; identify turns, reveals, breaths, action peaks, and intended final duration.
2. Inventory assets and build the Reference Map. Flag missing identity/product/location anchors before writing paid-generation prompts.
3. Choose narrative mode, coverage-montage mode, or a deliberate hybrid.
4. Build one immutable style paragraph and one continuity ledger.
5. Block scenes and estimate how many source blocks each scene needs.
6. Write prompts using the canonical contract and the constraints above.
7. Generate the editable HTML and validate that every prompt is standalone.
8. Before paid generation, show model, duration, resolution, count, estimated cost, and whether each request is narrative or coverage.
9. Generate scene by scene; pull the best seconds; edit music, text, and captions in post.
10. On revision, update the same HTML file. Preserve scene IDs and unchanged prompts.

## Final checks

Before delivery, verify:

- Every cited reference exists and its handle matches the attached Element.
- Narrative prompts are under 3,500 characters and contain no more than 3-4 beats per 15 seconds.
- Montage prompts are explicitly labeled and are not mistaken for final-screen duration.
- Character, wardrobe, environment, light, props, and style are copied consistently across linked prompts.
- Every visible face has the stability line.
- Sound is inline per beat; music is excluded by default.
- No generated text is relied on for product/UI accuracy.
- Negatives are short, observed, and non-contradictory.
- The HTML is self-contained, copyable, editable, and saved to a real writable path.
