# Agent Persona Creatures — Design (2026-05-07)

> **Status:** APPROVED 2026-05-07 (founder).
> **Scope:** Replace the CSS halftone placeholder in each agent card with an animated dot-pattern creature/symbol per agent. SVG with CSS `@keyframes` cross-fade between 3-5 frames per creature.
> **Branch:** `feat/agent-persona-creatures`

---

## Why this exists

The current carousel cards display a static red halftone radial-gradient
texture (shipped 2026-05-07 via `feat/agent-persona-carousel`). It renders
correctly, but adds no agent-specific character — every card looks the
same. This pass replaces the placeholder with a unique animated symbol
per agent that channels the agent's domain.

Founder constraint: **"I'd put this on my keynote slide" quality bar.**
Better to ship the existing CSS halftone than to ship an ugly creature
attempt. Each creature must be drawn convincingly in dot-pattern silhouette
form or fall back to its abstract symbol equivalent.

---

## 10 creatures × frames (founder-locked storyboard)

| # | Agent · Form | Frame sequence (each ~700ms) |
|---|---|---|
| 1 | **The Pro** · Phoenix | (a) ember tongue at base · (b) flames lifting taller · (c) 2 wing-tips emerging from flame top · (d) wings spread + sparks ascending — *the sparks ARE the wing tips* |
| 2 | **Deep Researcher** · Owl face | (a) closed eye line in oval head · (b) eye opens (round owl eye) · (c) head turns 30° (wing/feather detail visible) · (d) iris focuses to pinpoint |
| 3 | **Web Master** · Spider weaving | (a) spider body (small triangle) at center · (b) spider + 2 radial threads · (c) spider + 4 threads + first spiral arc · (d) full web (4 threads + 2 spiral rings) |
| 4 | **Doc Expert** · Pen + lines | (a) pen nib alone · (b) nib + 1 horizontal dash line · (c) nib + 2 dash lines · (d) nib + 3 dash lines (full document) |
| 5 | **Slide Master** · Slide stack | (a) 1 rectangle · (b) 2 rectangles fanned · (c) 3 rectangles fanned · (d) 3 rectangles fanned + bullet dots inside front slide |
| 6 | **Trade Pro** · Bar chart up | (a) 1 small bar · (b) 2 bars (ascending) · (c) 3 bars · (d) 4 bars + arrow tip extending past top |
| 7 | **Macro Strategist** · Globe + meridians | (a) circle outline · (b) circle + horizontal equator · (c) circle + equator + vertical meridian (cross) · (d) circle + 4 meridians (8-way) |
| 8 | **Business Director** · Lion mane crown | (a) flat bar (jaw) · (b) bar + 2 ear tufts on top · (c) bar + ear tufts + mane radiating outward · (d) full lion head silhouette with mane |
| 9 | **Video Producer** · Spiral fire | (a) tight inner spiral · (b) spiral expanding, 1.5 turns · (c) full 2-turn spiral · (d) spiral + 3 fire wisps trailing off the outer end |
| 10 | **Social Conductor** · Hydra heads + ripples | (a) 1 head profile · (b) 2 heads (split) · (c) 3 heads with ripples behind · (d) 5 heads pointing different directions, ripples expanding |

**5 creature-character (Phoenix, Owl, Spider, Lion, Hydra)** — must read as
recognizable silhouettes despite the dot constraint. If a specific
creature can't be drawn convincingly during prototyping, fall back to its
abstract symbol equivalent (per-creature, not all-at-once).

**5 abstract symbols (Pen+lines, Slides, Bars, Globe, Spiral fire)** —
infographic-style icons with pure geometry, low quality risk.

**Rejected during brainstorm:** Daedalus (too obscure for Indonesian
audience), Unicorn (too cute, breaks premium tone), Gryphon (too
anatomically complex).

---

## Technical approach — SVG inline + CSS keyframes

### Component shape

```jsx
function CreatureSprite({ slug }) {
  return (
    <svg className="creature" viewBox="0 0 80 60" preserveAspectRatio="xMidYMid meet">
      <g className="frame f0">{/* dots for frame 0 */}</g>
      <g className="frame f1">{/* dots for frame 1 */}</g>
      <g className="frame f2">{/* dots for frame 2 */}</g>
      <g className="frame f3">{/* dots for frame 3 */}</g>
    </svg>
  );
}
```

`<g>` groups stack at the same SVG coordinates; CSS `@keyframes` cycles
opacity 0→1→0 across them with staggered animation-delay so only one frame
is fully visible at a time. Per-card cycle ~3 seconds (4 frames × 700ms).

Each dot is `<circle cx="..." cy="..." r="1.1" fill="#E5322D"/>` — ~50
bytes per dot. Estimated ~80-150 dots per frame, ~10 frames per creature
(some have 4, some 5), ~40-60 dots average → roughly 30-40 KB inline SVG
total across all 10 creatures.

### CSS

```css
.agent-card .creature {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.agent-card .creature .frame {
  opacity: 0;
  animation: creatureCycle 2800ms steps(1, end) infinite;
}
.agent-card .creature .frame.f0 { animation-delay: 0ms;    }
.agent-card .creature .frame.f1 { animation-delay: 700ms;  }
.agent-card .creature .frame.f2 { animation-delay: 1400ms; }
.agent-card .creature .frame.f3 { animation-delay: 2100ms; }
@keyframes creatureCycle {
  0%, 24% { opacity: 1; }
  25%, 100% { opacity: 0; }
}

/* Stagger card cycles so 10 cards aren't all on the same frame */
.agent-card:nth-child(2) .creature .frame { animation-delay: calc(var(--d, 0ms) + 280ms); }
.agent-card:nth-child(3) .creature .frame { animation-delay: calc(var(--d, 0ms) + 560ms); }
/* etc — actually simpler: stagger via animation-delay on the .creature container */

@media (prefers-reduced-motion: reduce) {
  .agent-card .creature .frame { animation: none; opacity: 1; }
  /* All frames overlap — last frame on top wins, the most "complete" pose */
  .agent-card .creature .frame:last-child { opacity: 1; }
  .agent-card .creature .frame:not(:last-child) { opacity: 0; }
}
```

Cleaner staggering: compute per-card animation-delay via inline
`style={{ animationDelay: `${i * 280}ms` }}` on each `.creature` element.

### Sizing constraint

ViewBox `80 × 60` matches the card's 4:3 aspect. SVG scales to fill `100%
× 100%` of the `.agent-viz` element. At desktop (380px wide × 285px tall
card), each SVG unit ≈ 4.75px on screen, dot radius 1.1 ≈ 5.2px on screen.
Visually similar to the existing 6px halftone tile pattern so the new
animations sit on the same "halftone canvas" as the rest of the page.

### Existing CSS placeholder kept as fallback

The current `.agent-viz` background-image radial-gradient stays in place
as a fallback layer behind the SVG. If the SVG fails to load (or any
specific creature is a no-op group), the user still sees the dotted
texture — never a flat black square.

---

## Quality gate (built in)

After implementing the FIRST TWO creatures (Owl + Spider — simpler shapes
that should validate the technique), I take screenshots of each frame
and self-review against:

- Reads as the intended creature at 380×285 size
- Reads at 280×210 (mobile/tablet)
- Animation transitions feel intentional, not glitchy
- Dot density matches the rest of the page

If Owl + Spider don't clear the bar → STOP, report findings, get
founder direction on whether to:
- (a) Ship pure abstract symbols for all 10
- (b) Wait for designer-supplied SVG paths
- (c) Iterate on dot-art technique with founder feedback

If they DO clear the bar → proceed with the remaining 8.

---

## Implementation outline

1. Create `feat/agent-persona-creatures` branch off `main` ✓ (done)
2. Add `CreatureSprite` component above `AgentCarousel` in `index.html`
3. Add `creature*` CSS rules to the existing `<style>` block
4. Define each creature's frames as inline SVG dot data (objects in code,
   one per slug) — start with Owl + Spider as prototypes
5. Render `<CreatureSprite slug={a.slug} />` inside each `.agent-viz`
   instead of leaving it empty
6. Self-review prototypes, iterate, gate
7. Implement remaining 8 creatures
8. Push, capture per-card mid-cycle screenshots, send preview URL
9. Founder review → merge to main → production deploy

---

## Out of scope (logged for follow-up)

- Touch swipe gestures on mobile (carousel uses translate3d, no native
  scroll; deferred to Phase 2C if drop-off rate justifies)
- Per-creature SOUL.md prompt biasing (visual only here)
- Real video files at `/assets/agent-<slug>.mp4` (the Sesi A original
  intent) — these creatures REPLACE that plan, not supplement it
