---
name: cadence-identity-lock
description: >-
  Writes Higgsfield / Cadence / Seedance 2.5 identity-locked video prompts for
  Richie and Renita, generates look-lock stills first, and maps Image N to
  files in /Users/richiekidnovell/japan-montage. Use when prompting Cadence,
  Seedance, Higgsfield, Face Lock, @ identity, Japanese-film montage, or
  restaging a film as Richie and Renita.
---

# Cadence identity lock (Richie + Renita)

Physical contract for video, not a mood paragraph. Identity outranks every
scene screenshot. Real phone selfies outrank every generated plate.

**Home of files:** `/Users/richiekidnovell/japan-montage/`
Never write deliverables to `~/.cursor/projects/empty-window/assets`.

If the job is a generic one-take (no named couple), use
`prompt-master-seedance2-5` instead. If the subjects are Richie / Renita,
this skill wins — including the CORE THEME template.

## Read first

- **REQUIRED:** `taste` before SHOTS / OPTICS. Each cut is its own locked
  camera. House laws are the filter, not a reused MCU. A run of identical
  eye-level 50mm shots is slop even if faces lock.
- [identity-richie.md](identity-richie.md) — paste FACE LOCK verbatim
- [identity-renita.md](identity-renita.md) — paste FACE LOCK verbatim
- [attach-order.md](attach-order.md) — current identity files
- [character-sheet.md](character-sheet.md) — ECU face bar (`13-A-gaze-hi`)
- `richie-ecu` — composition of that plate (crop, eyes, collar)
- `taste` / look-lock.md — paused movie, not a pose (`~/.cursor/skills/taste/look-lock.md`)
- [prompt-template.md](prompt-template.md) — gold 22s montage prompt

## Higgsfield character IDs

```
Richie  @[Richie-final](ae9f347c-b941-40c5-9dec-6ccb931c4c3b)
Renita  @[Renita](f2f539cb-6c40-4056-a017-e0d352f8feb3)
```

Keep these `@` tokens in every prompt. Do not invent new UUIDs.

## Workflow

0. **Restage lock.** If a source clip exists, keep its cuts, scale
   order, and thesis. Identity and cloth may swap. Do not collapse a
   multi-cut into a one-take or invent a new spoken line. See
   `~/.cursor/skills/taste/restage.md`.
1. **Stills before Higgsfield.** If look-lock frames do not exist yet, generate
   them in this chat (16:9, identity refs attached) and save to
   `japan-montage/shots/`. Do not hand over a video prompt first.
2. **Identity first.** Attach only real photos from `japan-montage/identity/`.
   Never attach `02-richie-sheet.png` or any studio beauty plate as a face.
3. **Map Image N to the files they will actually attach.** Recount handles if
   they drop files. Do not cite a missing image or video.
4. **Character sheets.** ECU first. It must match `13-A-gaze-hi` (pores,
   oil sheen, moles, stubble, hotel-selfie skull). A cousin head on a
   good body is a fail. Sparkler is banned — it is AI, never attach it.
5. **Write one prompt** in the CORE THEME template. Apply `taste`: each
   SHOT is its own locked camera; vary scale; last shot earns the hold.
   Save it to `japan-montage/cadence-prompt.txt` and give attach order +
   one `text` block.

## Attachment law

Real crops first. Soul packs corroborate. Generated 6-angle / body /
studio hero: **skip**. Duplicates (`richie-id-*.png`): **skip**.
Sparkler stills: **skip**. `shots/` and `source/`: only when the user asks.

Few slots: `01-richie-hero` + `01c-richie-smile` +
`05-renita-hero-real` + `07-renita-raw-gym`.
Richie sheet: those three selfies + `13-A-gaze-hi`.

Optional original film: **last**, style only, **zero face**.

Identity files donate **faces**. They do not donate ski slopes, izakayas, or
roads.

## Image generation (look-locks)

Every still is frame 0. Mid-action. One lamp on face and world.
Seedance starts exactly there. Not a posed picture. See
`~/.cursor/skills/taste/look-lock.md`.

- Attach Richie: hero + 3q + smile + `13-A-gaze-hi`. Never sparkler.
  Attach Renita: hero + 3q + gym.
- Anti-beautify in the image prompt. Beanie pulled back so black hair shows
  at forehead and temples.
- Happy Richie = small closed-mouth smile from `01c`, not a K-idol grin.
- Height: he 174 cm, she 153 cm. Gap must read in every two-shot.
- Kiss prompts get blocked — use forehead rest / almost-kiss.
- Keep user-approved frames (`13-A-gaze-hi`). Regen only the misses.
- After generate, copy into `japan-montage/shots/`.

## Output protocol

One short attach list, one settings line, one fenced `text` block.

`Seedance 2.5 · 22s · 16:9 · 720p · count 1`

If a UI caps at 15s, say so in one sentence, then still return one prompt.

Canonical sections, this order:

```text
1. CORE THEME
2. SCENE CONTEXT
3. CHARACTER APPEARANCE LOCK   ← paste both FACE LOCKs
4. ACTIVE REFERENCES           ← one role per file, Image N = attach order
5. FORMAT MODE
6. SHOTS
7. OPTICS
8. LIGHTING
9. PHYSICS
10. AUDIO
11. POSITIVE CONSTRAINTS
```

Do not switch to SCENE / REFERENCES / TIMELINE unless the user asked for a
single continuous take with no cuts.

Clone density from [prompt-template.md](prompt-template.md). Remap Image N
to the current attach list. Do not leave stale filenames.

## Hard rules

- Exactly two named people. Extras stay extras.
- Faces 100% as phone selfies whenever visible.
- Indonesian dialogue only if requested. Default one line, Shot 1:
  `Maukah kamu menikah sama aku?` — his Higgsfield voice, mouth sync.
  She never speaks unless asked.
- No look-at-lens. No morph. No dissolve. No slow-mo. No score in generate.
- No subtitles, logos, watermarks, readable shop names, `as9film`.
- Hard cuts change place. Skulls do not. Wardrobe may change with the year.
- Soul-pack grids never appear as a poster or on-screen text.
- Never cite `@[Video 1]` unless they attach a video.

## Common mistakes

| Failure | Fix |
|---|---|
| Prompt before stills | Generate `shots/` first |
| Generated sheet as Image 1 | Drop it. Real selfie wins |
| Sparkler attached | Drop it. Use `13-A-gaze-hi` after selfies |
| Sheet face is a cousin | Regen ECU to the `13-A-gaze-hi` bar |
| Image N ≠ attach order | Recount from the files they will drop |
| Files in `.cursor/projects/.../assets` | Write to `~/japan-montage/` |
| Slim / idol / thin nose | Anti-beautify + gym/hotel selfies |
| Same height in two-shots | 174 vs 153, her crown near his collarbone |
| Kiss blocked | Forehead rest |
| Video donates faces | Style / cut / wardrobe silhouette only |
