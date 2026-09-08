---
name: higgsfield-cinematic-video
description: >-
  Direct realistic, cinema-grade AI videos with Higgsfield (Seedance 2.0, Kling 3.0)
  and image-to-video models so they look shot by a real film crew, not generated.
  Use this skill WHENEVER the user wants to create, prompt, storyboard, script, or
  improve an AI video — reel, short, clip, skit, B-roll, ad, music-video moment,
  "glow-up"/transformation, past-vs-future, or cinematic scene — with Higgsfield,
  Seedance, Kling, Runway, Veo, or any text/image-to-video model, even if they just
  paste a photo or a one-line idea and say "make a video." Always apply it BEFORE
  writing any video-generation prompt, because the difference between cinema and
  "AI slop" is whether the shot was directed (lens, light, blocking, one believable
  action, hard negatives) or just typed. Triggers on "make this into a video,"
  "animate this," "this looks too AI / too fake," "fix the transition," "viral
  reel," and any Higgsfield/Seedance/Kling request.
---

# Higgsfield Cinematic Video — direct it, don't generate it

AI video looks "AI" for one reason: it was **under-directed**. A real film has a director, a cinematographer, a gaffer, and an editor. Every frame carries decisions — a focal length, a key light, a blocking mark, one specific action, a color grade. When a prompt leaves those decisions blank, the model fills them with averages and hallucinations: melting faces, flickering backgrounds, jelly motion, morphing hands, that uncanny plastic sheen. Your job is to make every decision a real crew would make, so the model has nothing left to invent.

The second reason is **over-ambition per clip**. Asking one generation to morph day→night, child→adult, or school→gate is the single biggest tell. Real films change the world *between shots, in the edit* — never inside one continuous take. We do the same.

This skill is a director's discipline, not a template to paste blindly. Read the reference files when you reach the step that needs them.

## The Director's Framework (the core formula)

Brief the model like a cinematographer, not like you're describing a painting. Every shot follows this order — Western and Chinese creator communities independently converged on the same thing:

```
[Subject + specific detail] → [Action/motion] → [Camera] → [Environment/scene]
    → [Lighting/mood] → [Style] → [Constraints/negatives]
主体 → 动作 → 镜头 → 场景 → 风格 → 约束
```

These rules sit on top of the formula and matter more than any single word:

- **Camera is King.** The #1 amateur mistake is no camera instruction. Seedance/Kling behave like a *camera simulator* — if you don't say how the camera moves, you get random, boring motion. "girl walking in city" → slop. "tracking shot, slow dolly-in, 35mm, shallow DoF, girl walking in rain-soaked alley" → cinema. Never ship a shot without a named camera move.
- **Physical description over emotion words.** This is the highest-leverage habit. The model ignores "a sad atmosphere"; it executes "her shoulders droop, her eyes fall to the floor, rain soaks her hair." Translate every mood into bodies, light, and weather. Reserve the **last line of every prompt for lighting + camera** language (e.g. "— backlit silhouette, camera slowly pans right / 逆光剪影，镜头缓慢右移").
- **Shot structure first.** Put `Total: Xs / N shots / aspect ratio` at the very top of every prompt — without that anchor the model defaults to random camera moves and framing. Keep the whole prompt under ~200 words; use the timeline structure, not long paragraphs.
- **Rules, not adjectives.** "Cinematic / high quality / epic" do nothing — replace them with camera rules and technical metadata (lens, film stock, named move). See `references/cinematography.md`.

## The mindset (internalize this)

- You are the **director + DP**, not a prompt typer. Think in shots, lenses, lights, and cuts.
- **One shot = one clear action, present tense, single motion focus.** Stuff multiple actions into one clip and the output goes chaotic (乱). Nothing morphs, nobody turns 180°, the world doesn't transform.
- **Specificity kills hallucination.** Every vague word is a place the model guesses wrong. Define **motion energy** explicitly — the model doesn't infer intensity. "car drives fast" → nothing; "car accelerates aggressively, tires screeching, motion blur, low tracking shot" → energy.
- **The edit does the heavy lifting.** Big changes (time, place, age, mood) happen at a *cut* between two clean shots, joined by a real editing transition — not by asking the model to blend them.
- **Plausibility over spectacle.** A boring shot that obeys physics beats an epic shot that melts.

## Workflow — always in this order

1. **Concept + beat sheet.** Story in one line, then 2–5 shots with an emotional turn. Decide format up front (aspect, length, dialogue or not).
2. **Lock identity & locations as STILLS first** (text-to-image). Get composition, lighting, and the face exactly right *before* any motion. The video model should never invent a face — feed it a still. See `references/model-playbook.md`.
3. **Write a shot list.** Each shot gets the blueprint. This is where the craft lives.
4. **Shoot each shot as a short controlled clip** (test at 3–5s, image-to-video, from the locked still). Use a `start_image`; define start AND end-frame intent ("opens wide, lands on his face by the final frame"). 2–4 variants, pick the best.
5. **Edit.** Cut shots together with real transitions (match cut, cut-on-action, whip pan, object wipe). Add sound design. Unify grade + grain. See `references/transitions-and-editing.md`.
6. **Run the Anti-AI-Tell checklist** (`references/anti-ai-tells.md`). Reshoot the *one* offending shot — never ship a tell.

When the user is impatient, still do steps 1–3 in your head and state the shot list briefly — skipping the direction is exactly what makes slop. Be fast, not vague.

## The shot-prompt blueprint

Write **every** shot with these labeled blocks. Full annotated version + worked examples in `references/prompt-blueprint.md` — read it before writing prompts.

```
STYLE / FORMAT — medium + grade + grain + aspect + mood. Keep identical across all shots.
SUBJECT — who, with identity lock. (IMAGE-TO-VIDEO: do NOT re-describe what's already
  in the still — only the identity-lock note. Re-describing makes the model reinterpret
  and breaks consistency. See prompt-blueprint.md.)
ACTION — ONE believable beat, present tense, with weight, timing, and explicit energy.
CAMERA — lens + support + named move + framing + where it ends. NEVER omit this.
LIGHTING — sources named, direction, color temp, named effects. Motivated light only.
ENVIRONMENT / PHYSICS — atmosphere with weight words.
NEGATIVE — the artifact list (anti-ai-tells.md). Plus "avoid static camera."
```

## Anti-AI-slop core rules

The *why* matters more than the rule. Deep version in `references/anti-ai-tells.md`.

1. **Camera always.** No shot without a named camera move; add "avoid static camera" to negatives — it improves nearly any output.
2. **One action per shot, present tense.** The model holds identity and physics only when it isn't also inventing a transformation. Big changes belong in the cut.
3. **Don't re-describe your reference still.** In image-to-video, describe only motion + changes, never the outfit/hair/setting already in the frame — repeating them makes the model redraw and drift.
4. **Move the camera, not the subject's 180° turn.** Full turns force the model to invent the back of the head then re-invent the face → morph. Orbit or cut instead.
5. **Solid colors, simple textures.** Plaid, fine stripes, dense logos shimmer and crawl. Free the model's budget for the face.
6. **Short clips, then edit.** 3–6s. Length comes from cutting clips together, not one long drifty take.
7. **Lock identity with a still;** never conjure a face from text.
8. **Motivated light only.** Name every source; ban glowing orbs/halos/rim-light-from-nowhere in negatives.
9. **Physics with weight;** describe mass and fluidity so motion isn't floaty.
10. **Real transitions, never a morph-dissolve.** Match cut, cut-on-action, whip pan, object wipe.
11. **The slop-killer cheat code:** add **film grain (胶片颗粒感) + low saturation (低饱和度) + 4K** to almost any prompt. Chinese creators credit these three with removing ~80% of the "AI look." Perfectly clean + perfectly stable + oversaturated = synthetic.

## Pre-ship checklist

- [ ] Every shot has a named camera move; "avoid static camera" in negatives.
- [ ] Each shot does ONE present-tense action; no in-shot morph or time/place change.
- [ ] Image-to-video prompts describe motion/camera/light only — not the still's contents.
- [ ] Face/identity locked from a still, consistent across shots; no 180° turns.
- [ ] Wardrobe solid/simple; every light source motivated and named.
- [ ] Mood expressed physically (bodies/light/weather), not as emotion words.
- [ ] Motion energy stated; atmosphere has weight.
- [ ] Full negative block; grain + low-saturation grade applied (not plastic-clean).
- [ ] Transitions between shots are real edits, not AI dissolves/morphs.
- [ ] Watched at full size for flicker, melt, finger/limb errors, warping — reshoot the offending shot only.

## Reference map

- `references/prompt-blueprint.md` — the shot template, the image-to-video re-description rule, temporal storytelling, worked examples.
- `references/cinematography.md` — lens/camera/lighting grammar, reference stacking, style anchors, bilingual lighting lexicon, motion-energy.
- `references/anti-ai-tells.md` — artifact catalog + negative-prompt library.
- `references/model-playbook.md` — model pick (Seedance vs Kling), the 3-step pipeline, start/end-frame intent, multi-shot, segmented "short→long / low→high / 2–4 variants" workflow, Mandarin reinforcement.
- `references/transitions-and-editing.md` — real transitions vs the AI morph; assembling a skit; sound.
- `references/community-recipes.md` — proven ready-to-use prompts, the 3×3 nine-shot rule, viral reverse-engineering, multi-angle consistency, prompt-library habit, resource links.
- `references/ready-blocks-and-templates.md` — copy-paste arsenal: the shot-structure header, the ARRI Alexa ultra-realism block, physics/fluid and UGC blocks, timeline prompting and the 6-shot/15s arc, and the compiled master template.

## Model quick-pick (full table in `references/model-playbook.md`)

- **Identity-critical, atmospheric image-to-video** → **Seedance 2.0** (best face hold + mood).
- **Complex blocking, precise camera moves, multi-beat adherence** → **Kling 3.0**.
- **Stills (character refs, location plates, keyframes)** → GPT Image 2 / Nano Banana Pro (4K + reliable signage) / Seedream.
- Chain them: still (locked identity/location) → image-to-video shot → edit. Never skip the still.
