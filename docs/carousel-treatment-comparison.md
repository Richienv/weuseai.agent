# Agent Carousel — Treatment Comparison

**Status:** Side-by-side exploration sprint, founder review pending.
**Date:** 2026-05-09
**Scope:** Compare 4 candidate visual treatments for the agent persona carousel inside the "Era baru / Fine-tuned agent yang ngerjain. Bukan chatbot yang cuma jawab." section. Pick a winner, that branch becomes the merge candidate.

---

## TL;DR — recommended winner

**Treatment 3 (scanline + glitch on raw video).**

Reasoning, in one sentence: every other treatment (control, ASCII, LED) abstracts the source mp4 into a dot/char pattern that the viewer has to *decode*, while scanline keeps the actual product UI legible — viewers recognize "that's an email inbox, that's a calendar grid" in <1s, which is exactly the "average Joe in Jakarta" target the brand is built for.

Trade-off accepted: less editorial-poster-art identity, more product-demo-with-tasteful-grading. The brand-tinted scanline overlay buys back enough atmosphere to keep it from feeling like raw screenshots.

If the founder rejects this on visual-identity grounds, **fall back to Treatment 1 (ASCII)** — it preserves the strongest unique-visual-identity of the four, and reads more "premium-editorial" than the LED matrix.

---

## Side-by-side at the same viewport (1280×900, Email/Calendar/Trade trio active)

| | |
|---|---|
| **Control (halftone)** | **Treatment 1 (ASCII)** |
| ![control](screenshots/carousel-treatments/01-control-halftone.png) | ![ascii](screenshots/carousel-treatments/02-ascii.png) |
| **Treatment 2 (LED matrix)** | **Treatment 3 (scanline + glitch)** |
| ![led](screenshots/carousel-treatments/03-led-matrix.png) | ![scanline](screenshots/carousel-treatments/04-scanline.png) |

Each viewport shows the same 3-card window of the carousel (Email Manager, Calendar Agent, Trade Pro centered) so the visual treatments can be compared with the *same source content*.

---

## Treatment summaries

### Control — halftone dots (`feat/agent-carousel-dotted-video`)

- **Preview:** https://weuseai-agent-bpufih23m-richies-projects-6f212435.vercel.app/
- **Visual:** Dense red BG (`#ED3530`) overlaid with pure-black dots whose radius scales with source-frame luminance. Cells 3px desktop / 5px mobile floor. Calendar+Trade get cellSize 5 + darker BG `#B82420` + contrast 1.85.
- **Character:** Halftone newspaper print — abstract silhouette of UI activity, no individual UI elements legible.
- **History:** Founder spent ~6 iteration rounds tuning threshold/contrast/polarity/cellSize trying to get the dotted silhouette readable. Ended at "punchy but founders still says hard to see specific UI detail."

### Treatment 1 — ASCII halftone (`explore/agent-carousel-ascii`)

- **Preview:** https://weuseai-agent-5dt7arazy-richies-projects-6f212435.vercel.app/
- **Visual:** Same canvas pipeline as control, but each cell renders a monospace character from `' .\'-:+*#%@'` density-mapped to source luminance instead of a dot. cellSize 6 desktop / 8 mobile. Brand red `#E5322D` chars on near-black `#050505`. Calendar+Trade get cellSize 8.
- **Character:** Vintage CRT terminal printout / dialup-era ANSI art. Recognizable letterform shapes form where UI density is highest.
- **LOC:** +202 / −46.

### Treatment 2 — LED dot-matrix (`explore/agent-carousel-led-matrix`)

- **Preview:** https://weuseai-agent-i7g1gq3ku-richies-projects-6f212435.vercel.app/
- **Visual:** Same canvas pipeline as control but with much bigger cells (10px desktop / 14px mobile), smaller dots within each cell (`dotScale: 0.55` exposes the gutter), and a higher contrast (2.5) that biases dots toward on/off rather than smooth halftone fade. Polarity-swap kept. Calendar+Trade get cellSize 14.
- **Character:** Stadium scoreboard / Lite-Brite. Each card reads as a sparse low-fi LED bulletin board. The most graphic-poster of the four.
- **LOC:** +40 / −25 (smallest delta — variation of existing pipeline).

### Treatment 3 — scanline + glitch overlay (`explore/agent-carousel-scanline`)

- **Preview:** https://weuseai-agent-cvztr9g7u-richies-projects-6f212435.vercel.app/
- **Visual:** Native `<video>` element (not abstracted). CSS `filter: hue-rotate(330deg) saturate(1.2) contrast(1.05)` color-grades toward oxblood. Static `repeating-linear-gradient` of 1px scanlines at 0.30 opacity (multiply blend) overlays the video. Subtle inset vignette grounds the card. ~5%/sec glitch effect (100ms RGB-split flicker, suppressed under `prefers-reduced-motion`).
- **Character:** Hacker-movie CRT terminal energy. Actual product UI stays legible through tasteful red scanlines, with occasional flicker for unpredictability without pulling focus.
- **LOC:** +166 / −43.

### Treatment 4 — SVG path silhouettes (deferred)

Skipping for this sprint. Per spec, requires 9 hand-traced bespoke illustrations (~1-2 days art per agent = 9-18 days total work) which exceeds the 5-day exploration budget. Recommend revisiting only if Treatments 1-3 are all rejected on identity grounds.

---

## Comparison matrix

| | **Control halftone** | **T1 ASCII** | **T2 LED matrix** | **T3 Scanline** |
|---|---|---|---|---|
| **Visual recognition** (can a viewer tell what the agent does?) | ❌ Low — abstract dot field | ⚠️ Medium — UI letterforms emerge in dense areas | ❌ Low — over-abstracted, sparse silhouette | ✅ **High — actual UI visible** |
| **Brand identity** (unique visual signature, not generic) | ✅ Strong — owns the halftone aesthetic | ✅ Strong — terminal/ASCII is distinctive | ✅ Strong — poster-LED is distinctive | ⚠️ Medium — scanlines are common but tasteful |
| **Editorial / calm-premium fit** | ✅ Good — restrained, printed-poster | ⚠️ OK — leans tech/hacker, not Jakarta-sophisticated | ✅ Good — sparse, poster-like, calm | ✅ Good — color-graded video, restrained glitch |
| **Performance (desktop)** | Heavy: ~8000+ cells × `arc+fill` × 30fps × visible cards | Heavy-ish: ~960 cells × `fillText` × 30fps. `fillText` ~3-5× slower than `arc` | **Lightest of canvas treatments**: ~80 cells × `arc+fill` (8-11× fewer cells than control) | **Lightest overall**: native video decode is HW-accelerated; CSS overlays are GPU-composited |
| **Performance (mobile / 4G iPhone)** | Borderline at cellSize 5 floor | OK at cellSize 8 floor; bump to 10 if jank | Easy headroom — fewer cells | Easy — no canvas pipeline at all |
| **Implementation complexity** | High (existing) — 8+ knobs (cellSize, threshold, contrast, gamma, invert, polarity, playbackRate, dotScale) | Medium — same pipeline + char-mapping layer | Low — variation of existing pipeline (1 new prop, value tweaks) | Medium — new component, CSS overlays, glitch state machine, `prefers-reduced-motion` branching |
| **First-paint cost** | 916KB total (after compression) — instant | 916KB total + canvas warmup | 916KB total + canvas warmup | 916KB total + native `<video>` paints first frame faster than canvas |
| **Per-agent tunability** | High via `AGENT_VISUAL_OVERRIDES` map | High (same map pattern) | High (same map pattern) | Medium — overlay opacity per-slug |
| **Scaling to 100 agents** | Same code, pure asset addition | Same code, pure asset addition | Same code, pure asset addition | Same code, pure asset addition |
| **Mobile Safari quirks** | Canvas autoplay needs IO + `playsInline` (handled) | Same | Same | Native video autoplay needs `muted+playsInline+autoplay+loop` (handled). iOS Low Power Mode disables autoplay → first-frame fallback (acceptable). |
| **Founder's spent-frustration on tuning** | **6+ rounds, still "hard to see"** — this is the signal | New — fresh eyes | New — fresh eyes | New — fresh eyes |

Legend: ✅ strong / ⚠️ acceptable / ❌ weak.

---

## Why Scanline (Treatment 3) wins

**Founder's central feedback through 6 rounds of control halftone tuning was some flavor of "I cannot see anything / not much information can be shown."**

Every dot/char treatment requires the viewer to *decode* a luminance map back into UI semantics. That decoding tax is fine for a moodboard or brand atmosphere shot — it's not fine for a section whose entire copy promises "fine-tuned agent yang ngerjain" (an agent that *gets work done*) and is meant to convince a Jakarta SMB owner that this is concrete, real, useful product.

Showing actual UI through Treatment 3:
- Email Manager card → viewer sees inbox tiles, instantly grasps "oh, it sorts emails"
- Calendar Agent card → viewer sees calendar grid, instantly grasps "oh, it manages schedule"
- Trade Pro card → viewer sees market data, instantly grasps "oh, it watches my portfolio"

The brand-tinted scanline overlay (oxblood multiply blend) keeps the visual cohesive with the rest of the section's red-on-black halftone landscape, so it doesn't feel like inserted product screenshots — it feels like the same world.

The occasional glitch effect (~5%/sec, 100ms) adds enough unpredictability to feel alive without becoming distracting. It also signals "this is a live product, not a static mockup."

**Performance bonus:** Treatment 3 is by far the cheapest. Native `<video>` decode is hardware-accelerated. CSS overlays are GPU-composited. No `getImageData` per frame, no rAF canvas loop. Drops total carousel CPU by an order of magnitude vs control on mobile.

---

## When to pick each alternative instead

- **Pick Control if:** the founder genuinely loves the halftone-poster identity and accepts that viewers don't need to read individual UI elements (the section sells *"fine-tuned"* abstractly). Lock in current values, ship, move on.
- **Pick T1 ASCII if:** brand identity matters more than UI legibility AND you want a more distinctive, ownable visual than control. Best fallback option.
- **Pick T2 LED if:** you want maximum graphic-poster impact and minimum CPU. Trades the most UI legibility of the four.
- **Pick T3 Scanline if:** UI recognition is the primary success metric. ← **recommended**
- **Pick T4 SVG paths if:** Treatments 1-3 all fail and you have 1-2 weeks to commission bespoke illustrations.

---

## Implementation cleanup if Scanline wins

If founder picks Treatment 3:

1. Close PR #7 without merging (control halftone branch becomes archive).
2. `gh pr create` against main from `explore/agent-carousel-scanline`.
3. Drop the now-unused `DottedVideo` component from `index.html` (still referenced by `StartSection` for the section background — keep it, just stop calling it from `AgentVisual`).
4. Per-agent `AGENT_VISUAL_OVERRIDES` map keeps its shape — useful for tuning scanline opacity per agent if some videos read too-bright.
5. Add `prefers-reduced-motion` test: glitch effect must NOT trigger when `(prefers-reduced-motion: reduce)` matches. Already handled in T3 implementation per agent report; verify on Safari/iOS with the OS-level setting on.
6. Mobile Safari Low Power Mode degrades to first-frame display (no autoplay). Verify acceptable visual; consider a static "Tap to play" affordance if not.

---

## Source artifacts

- Branches: `explore/agent-carousel-ascii`, `explore/agent-carousel-led-matrix`, `explore/agent-carousel-scanline`, `feat/agent-carousel-dotted-video` (control)
- Worktrees (local only, gitignored): `.worktrees/explore-ascii`, `.worktrees/explore-led-matrix`, `.worktrees/explore-scanline`
- Screenshots: `docs/screenshots/carousel-treatments/01-control-halftone.png` through `04-scanline.png` (1280×900, Email/Calendar/Trade trio centered)
- This doc: `docs/carousel-treatment-comparison.md`
