# Seedance 2.5 Prompting and Coverage Guide

This reference distills a community-tested Seedance 2.5 workflow supplied by the user. Treat its qualitative guidance as production heuristics, not a provider contract. Verify current model IDs, duration limits, media-role limits, resolution options, and costs with the live Higgsfield tool before generation.

## Contents

1. Mental model
2. Narrative versus coverage montage
3. Prompt architecture
4. Timed-beat direction
5. Reference strategy
6. Continuity between blocks
7. Sound, dialogue, music, and text
8. UGC-specific direction
9. Cost and reroll discipline
10. Failure diagnosis
11. Reusable templates

## 1. Mental model

Do not ask one generation to be the finished film. Treat Seedance as a virtual production unit that produces source footage. The editor selects, trims, combines, grades, captions, and scores the strongest moments.

The useful shift is:

- Narrative blocks create continuity-critical footage.
- Coverage montages create abundant editorial options.
- The final film is assembled from selected ranges, not accepted wholesale.

The model can invent valuable inserts and alternate angles, especially in montage mode. Give it controlled freedom rather than dictating every frame and then complaining that the result feels mechanical.

## 2. Narrative versus coverage montage

### Narrative block

Choose narrative mode when action must continue precisely, identity must hold, dialogue matters, or a product interaction must be exact.

Constraints:

- 15 seconds per block unless the provider exposes another limit.
- 3-4 timed beats maximum.
- Under 3,500 characters.
- Heavy, explicit reference mapping.
- One continuity ledger copied across linked prompts.
- Precise outgoing and incoming frame matches.

### Coverage montage

Choose montage mode for B-roll, inserts, action coverage, editorial rhythm, or surprising visual options.

Translate roughly 2-5 seconds of final screenplay into 15-30 seconds of generated coverage. Ask for more angles and beats than the edit will use. If the provider caps duration at 15 seconds, split one coverage request into two related prompts.

Montage mode may use many beats. It deliberately breaks the narrative beat ceiling.

Use a lighter reference set:

- Primary subject or hero object.
- Rough environment anchor.
- Shared style anchor.
- Only the props whose exact design must survive.

Tell the model that the material will be cut manually and that it should provide distinct, clean editorial options rather than one continuous finished sequence.

## 3. Prompt architecture

Use macro-to-micro order:

1. `SHOT`: purpose, mode, duration.
2. `REFERENCES`: exact role of every attached file.
3. `CHARACTER`: invariant identity/wardrobe plus current visible state.
4. `SETTING`: geometry, positions, materials, light, weather.
5. `CAMERA`: lens/FOV, distance, height, framing, movement, light behavior.
6. `SEQUENCE`: time-coded physical beats with inline sound.
7. `STYLE`: unchanged style paragraph, ratio, duration, frame rate.
8. `NEGATIVE`: short list of real failure modes.

Repeat identity and wardrobe language exactly. Do not vary adjectives for prose quality; variation creates drift.

Put the style paragraph through the whole asset pipeline: use the same paragraph in the still-image prompt and Seedance prompt. Style consistency begins before animation.

## 4. Timed-beat direction

A usable beat contains four things:

```
time range + framing/camera + physical action/physics + sound caused by that action
```

Weak:

```
0:00-0:04 — He looks angry and jumps dramatically.
```

Strong:

```
0:00-0:04 — Tight 50mm chest-up push-in. His jaw locks, right fist closes against
his thigh, then he takes three accelerating strides and clears the barrier by half
a meter; shoes strike concrete with a hard double impact and his shoulders absorb
the landing.
```

Direction rules:

- Render emotion as anatomy and timing.
- Define trajectory, distance, mass, contact, and recovery.
- Write sound at the causal beat.
- Contrast shot scale and speed to create rhythm.
- Use held frames only when the composition and silence carry dramatic weight.
- Keep a primary subject readable while secondary action stays simpler.

For objects, require a visible acquisition action: a hand reaches, grips, lifts, rotates, places, or releases. This prevents props from materializing between frames.

## 5. Reference strategy

The supplied workflow reports that Seedance 2.5 can reason over a large reference set, potentially up to 50 slots. Do not treat that as guaranteed in every Higgsfield route. Use the connector's current schema as the actual cap.

Narrative reference plan:

- Identity master and angle coverage.
- Wardrobe/state reference.
- Product/prop turnarounds.
- Environment angles.
- Position schematic if spatial layout must not move.
- Style reference when visual treatment is nonstandard.

A practical narrative range is 4-10 files when the provider allows it.

Montage reference plan:

- Reduce to the few files that define the hero subject and look.
- Let the model invent secondary angles and simple background action.
- Avoid close, detailed secondary subjects unless they have their own lock.

Reference syntax rules:

- Match `@image1`, `@image2`, and so on to attachment order.
- State one explicit role per reference.
- A composite may carry several roles only when deliberately used as a montage exception.
- Never reference an asset that is not attached.
- Keep named Higgsfield Elements and prompt handles identical.

Character-sheet conflict rule:

- Seedance 2.5 may benefit from three face angles.
- If a composite creates competing faces or drift, split those angles into separate single-face files.
- Preserve the proven one-clear-face identity master, with rear/body views kept face-free when necessary.

## 6. Continuity between blocks

For linked narrative prompts:

1. Copy the same reference list, character anchor, environment anchor, lighting state, and style paragraph.
2. End block A and start block B on the same sound tail.
3. Repeat the cut frame: lens, height, eye position, travel direction, hand placement, prop orientation, and subject scale.
4. Carry state forward: sweat, wetness, dirt, damage, breath, emotional residue, and wardrobe.
5. Do not rewrite continuity text for elegance. Exact repetition is a feature.

When one scene needs more than four beats, split it. More detail inside a crowded prompt does not create more control; it creates rushed motion.

## 7. Sound, dialogue, music, and text

Default audio policy:

- Keep generated environmental and mechanical SFX.
- Put every sound in the beat that causes it.
- Exclude music from generation; add it in the edit.
- Avoid subtitles and readable text in generated frames.

Native dialogue is not the default for cinematic work. Add clean dialogue in post unless the user specifically wants model-generated speech.

UGC is the exception: native speech may be usable when the prompt includes natural pauses and small imperfections.

Text remains a post-production responsibility. Product labels, UI strings, captions, pricing, logos, and legal copy should be composited after generation.

## 8. UGC-specific direction

To preserve phone-camera honesty, use:

```
slight handheld shake, casual autofocus hunting, imperfect casual framing,
no gimbal smoothing, natural exposure adjustment
```

Write spoken performance like real speech:

- Filler words where natural.
- Micro-pauses before claims.
- Trailing phrases.
- Quiet action-only stretches.
- Natural breath and gaze shifts.

Avoid uninterrupted commercial copy. Let the creator do something while speaking.

Make every product or prop enter through visible hand action. Keep skin and identity locks from the UGC/human-realism skills.

## 9. Cost and reroll discipline

The guide's central economic rule is correct even when exact prices change: broken rerolls are more expensive than planned coverage.

Before generating:

- Validate the prompt contract.
- Confirm all referenced assets exist.
- Preflight live cost where supported.
- State model, duration, resolution, count, and total expected credits.
- Get approval before any multi-generation batch.

After a weak output:

- Diagnose the failure.
- Change the relevant prompt field or reference.
- Do not submit the identical request and hope.
- Rerun only the failed block, not the entire sequence.

Coverage count should match the budget. Ten variants are a high-budget tactic, not a default.

## 10. Failure diagnosis

| Failure | Fix first |
|---|---|
| Identity drifts | Simplify competing faces; repeat exact identity lock; improve identity reference |
| Product changes shape | Add turnaround; reduce complex interaction; state geometry invariants |
| Environment rearranges | Add 2-3 angle sheet or schematic; copy exact spatial language |
| Motion feels vague | Replace adjectives with trajectory, distance, contact, and recovery |
| Sequence feels rushed | Reduce narrative beats to 3-4 or split the block |
| Montage feels rigid | Remove nonessential references; invite alternate coverage explicitly |
| Sound feels detached | Move each sound into the beat that causes it |
| Native speech feels fake | Shorten line; add pauses/fillers; move final voice to post |
| Garbled UI/text | Remove text requirement; composite exact typography in post |
| Negatives flatten style | Remove generic bans; retain only observed, non-contradictory defects |

## 11. Reusable templates

### Narrative template

```
SHOT:
[ID] — NARRATIVE — 15s — [dramatic purpose]

REFERENCES:
@image1 = [identity role]
@image2 = [environment role]
@image3 = [prop role]

CHARACTER @image1:
[Exact repeated identity + wardrobe.] Face stable throughout, no deformation.
[Current state, physical goal, restrained behavior.]

SETTING @image2:
[Geometry, positions, materials, time, light, continuity.]

CAMERA:
[Lens/FOV, height, distance, framing, one motivated move/hold.]

SEQUENCE:
0:00-0:04 — [frame + physical beat + inline sound]
0:04-0:09 — [frame + physical beat + inline sound]
0:09-0:15 — [frame + physical beat + inline sound]

STYLE:
[Exact shared style paragraph.] [ratio], 15 seconds, 24fps.
No music. Diegetic sound only. No subtitles or readable text.

NEGATIVE:
[Observed failures only.]
```

### Coverage-montage template

```
SHOT:
[ID] — COVERAGE MONTAGE — [15-30s supported duration] — source coverage for
[2-5s intended final edit]. Provide distinct clean options for manual editing.

REFERENCES:
@image1 = [primary subject]
@image2 = [rough environment]
@image3 = [style anchor, if needed]

CHARACTER / SUBJECT @image1:
[One locked primary subject. Simplify all secondary elements.]

SETTING @image2:
[Loose but coherent environment.]

CAMERA:
A broad family of motivated angles and focal lengths appropriate to the action.
Preserve believable inertia and geometry. Keep the primary subject readable.

SEQUENCE:
[Dense time-coded alternate coverage: wides, close inserts, passes, impacts,
reactions, texture shots, and one held hero option. Inline diegetic sound per beat.]

STYLE:
[Exact shared style paragraph.] [ratio], [duration], 24fps.
No music. Diegetic sound only. No subtitles or readable text.

NEGATIVE:
[Observed failures only.]
```
