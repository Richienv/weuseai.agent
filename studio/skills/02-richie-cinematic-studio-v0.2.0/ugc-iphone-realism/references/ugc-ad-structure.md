# UGC ad structure — the light layer over the iPhone look

This file is the thin ad scaffold that sits on top of the visual realism craft. It owns the
**shape of the ad** (arc, hook timing, what to withhold) and the **platform fit**. It does NOT
own the concept or the spoken words — those are handed off below.

- **Visual authenticity + Seedance prompt craft** → the six-part iPhone cluster and the
  realism-lock stack live in `iphone-look-and-realism.md`; technical settings live in
  `settings-and-troubleshooting.md`. Don't re-derive them here.
- **The idea / audience / hook packaging** → `creative-ig-video-idea`. Decide who it's for and why
  it travels *before* you prompt anything.
- **The spoken lines / VO** → `script-writer`. Don't draft talking-head copy here; point to it.

So the flow is: idea (`creative-ig-video-idea`) → script (`script-writer`) → this file picks the
ad arc + hook timing → the iPhone cluster renders it. Read this once you already know the concept
and have, or are about to write, the lines.

## The ad arc

Four beats, in order. Every UGC ad is some version of this:

```
hook  →  demo  →  believable proof moment  →  CTA
```

- **Hook** — the first 1–2 seconds. A person, talking, mid-thought. No product, no logo, no brand
  energy yet. Its only job is to stop the scroll and make the viewer think "wait, is this an ad?"
- **Demo** — show the thing being used, in a real hand, in a real room. One use case, clearly.
- **Believable proof moment** — the load-bearing beat (see below). Texture, size, a comparison, a
  result, a routine. Something a paid actor reading a script wouldn't bother to show.
- **CTA** — one line, casual, at the end. "Link's in my bio", "it's the [product]", "go get it."

Duration is **content-driven, 8–12s** — long enough to land all four beats. You can't trim a
talking UGC ad down to a 4s cost floor the way you can a silent cinematic beat; the words set the
floor. (Master Template 3 in `prompt-templates.md` is the full ad-brief wrapper for this arc.)

### The believable proof moment

This is the beat that separates UGC that converts from UGC that reads as an ad. It's a specific,
slightly-too-real detail that an actor wouldn't think to include:

- holds it up to the lens and turns it so you see the **texture**
- puts it next to a hand / a coin / a doorway so you read the **size**
- shows the **before/after** or the **comparison** to the thing they used before
- films the actual **routine** — applying it, eating it, wearing it through a normal moment
- shows a **result** without claiming a result ("I didn't expect this" beats "clinically proven")

Pick one. Emphasize the main benefit **without exaggerated claims** — the proof does the
convincing, not the adjective.

## Hook specificity — the single biggest lever

A vague hook gets 200 views; a specific hook gets 20k. The viewer has to feel personally named in
the first second.

| Weak (generic) | Strong (specific) |
|---|---|
| "trying to lose weight?" | "you've been trying to lose weight for 8 months and the scale hasn't moved" |

The strong version names the **duration of the struggle** and the **exact frustration**. It feels
like it was written about one real person, so the right person stops scrolling. This is hook
*delivery* — the packaging and the precise phrasing live in `creative-ig-video-idea`, and the
spoken line itself comes from `script-writer`. This file just flags the rule: **specific beats
broad, every time.**

## Never show the product before the 8-second mark

The most counterintuitive rule from high-volume operators, and the most important:

- **Introduce the product before ~8s and you lose.** The moment a viewer's ad-detector fires
  ("oh, this is selling me something"), it recategorizes everything that follows as an ad and
  watches the rest defensively. Engagement collapses against that frame.
- Spend the first 8 seconds as a **person, not a pitch** — the hook, a relatable moment, the
  setup. Earn the watch first. *Then* the product enters and it reads as a recommendation from
  someone you've already been listening to, not an interruption.

This is why the arc front-loads hook before demo, and why an 8–12s duration matters: you need the
runway to delay the reveal and still land the proof and CTA.

## Leave room for imperfection

Over-describing the scene kills the look. Vague settings let Seedance fill in the messy details
that actually sell "a real human filmed this."

- **Vague the environment on purpose** — "in a small kitchen", "on a sunny street". The model
  populates clutter, odd light, a stray object — the texture of a real room.
- **Over-specify every prop and you get a stiff, too-composed render** that reads as a set, not a
  life. Perfection is the tell.
- This pairs with the casual-framing and handheld cues in the iPhone cluster (see
  `iphone-look-and-realism.md`): imperfect *framing*, imperfect *room*, imperfect *light*. Stack
  imperfection deliberately; it's the whole point.

## Platform notes

| | TikTok Shop / paid ads | Instagram Reels |
|---|---|---|
| Highest-impact lever | skin-texture spec in **every** prompt (defeats AI detection) | the iPhone tech strip on every prompt |
| Hook | specificity is the 200-view vs 20k-view line | same, with cover-text packaging |
| Aspect | 9:16 | 9:16, non-negotiable |
| Distribution signal | **match trending audio every post** (the algo reads it) | trending audio still helps |

- **TikTok Shop:** the realism-lock stack ("realistic skin texture, visible pores, natural slight
  unevenness, no filter quality") in every prompt is the single highest-impact cluster for getting
  past AI detection. Then ride **trending audio every post** — matching the current sound is a
  direct distribution signal, independent of the creative.
- **Instagram Reels:** paste the iPhone tech strip at the bottom of the prompt —
  `iPhone 15 Pro, 26mm lens, 24fps, natural HDR, handheld imperfections, autofocus breathing, subtle compression artifacts`.
  9:16 is non-negotiable. (The full cluster and tech strip live in `iphone-look-and-realism.md`.)

Trending audio is added in the editor / on-platform, not in the Seedance prompt — your render
carries **"no music"** so you can drop the trending sound on cleanly afterward.

## Cost note for ads (don't fight the arc)

UGC duration is set by the *content*, not by what's cheap — you can't shorten a talking ad to save
credits. So manage cost the right way: render at **720p** (both the cheapest *and* the
community-preferred resolution for UGC — sharper lens-flare and ambient texture, ~4.5 cr/sec vs 9
at 1080p), keep **count 1**, **nail the prompt on the first try**, and use **Edit-and-Extend** to
continue a talking shot instead of re-rolling from scratch (it holds character, environment, and
voice). Run **`get_cost: true`** as a free preflight before spending. Full numbers live in
`settings-and-troubleshooting.md` — this is just the reminder that the ad arc, not the cost floor,
sets your duration.

## Hand-offs (don't duplicate these)

- **Concept, audience, hook packaging, cover text** → `creative-ig-video-idea`. Run it first.
- **Spoken lines / voiceover** → `script-writer`. Run it before you fill the hook line into a
  template.
- **Phone-real visual authenticity + the Seedance prompt** → `iphone-look-and-realism.md`
  (cluster + realism-lock) and `prompt-templates.md` (the copy-paste prompts).
- **Cinematic, graded, gimbal-smooth reels** → `higgsfield-cinematic-video` /
  `reel-production-playbook`. That's the **opposite** look — do not blend it with UGC or the two
  cancel out. Pick one mode per piece.