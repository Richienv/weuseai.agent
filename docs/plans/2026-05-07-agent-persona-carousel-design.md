# Agent Persona Carousel — Design (2026-05-07)

> **Status:** APPROVED 2026-05-07 (founder).
> **Scope:** Add a 10-agent persona carousel inside `#proses` ("The wave") on the landing page, sitting below the existing "Mulai hari ini" CTA on the same red-halftone canvas.
> **Goal:** Convert visitors who already understand "AI is more than chat" (vs-chat) by showing concrete specialists they can hire, before they hit pricing. Mirror the 10 agents listed in the Studio tier.

---

## Why this exists

Narrative funnel today:

```
Hero → Empat-langkah → Filosofi → vs-chat → Pricing → Community → FAQ
                                  ↑ "ChatGPT only chats"
                                              ↑ "Pick a tier"
```

The gap: between "agents are different from chat" and "here's the price," the visitor has no concrete mental picture of *what* they're buying. The carousel fills that gap with 10 named specialists, each with a one-line job description, in the same dark/red aesthetic as the rest of the section.

Sub-text under the carousel ties directly to pricing tiers ("Starter: 1 agent · Pro: 5 · Studio: 10 — pilih yang cocok di harga →"), making the next click obvious.

---

## Placement

Inside `<section id="proses">` (the existing "The wave" StartSection at index.html:2422), as a sibling block immediately below the "Mulai hari ini" button. The section's existing DottedVideo background (`/assets/ascii-wave.mp4`, cellSize=6, Signal Red) continues to render behind the carousel.

```jsx
<section id="proses">
  <DottedVideo .../>           // existing
  <div className="...">          // existing
    <Pill>The wave</Pill>
    <Headline>...</Headline>
    <p>...</p>
    <button>Mulai hari ini</button>
    <AgentCarousel />            // ← NEW, below button
  </div>
</section>
```

No structural changes to other sections.

---

## Section header

- **Pill:** `Agen kamu`
- **Headline (Instrument Serif):** `10 spesialis. Satu komando.`
- **Sub-headline (Inter):** `Setiap agent fokus di satu domain — dari riset, konten, sampai trading. Aktif 24/7.`

---

## 10 cards — content

| # | Slug | Name | Description (kamu form, 2-line) |
|---|------|------|---------------------------------|
| 1 | `pro` | The Pro | Briefing pagi, ingat percakapan lintas sesi, jadi pendamping yang ngerti gaya kamu. |
| 2 | `researcher` | Deep Researcher | Riset topik kompleks dari ratusan sumber, sintesis jadi laporan siap pakai. |
| 3 | `web` | Web Master | Otomasi browser — scrape data, isi form, monitor halaman, klik apa pun. |
| 4 | `doc` | Doc Expert | Bikin laporan, proposal, dan email — sesuai gaya kamu, siap kirim dalam menit. |
| 5 | `slide` | Slide Master | Dari outline ke deck 12 slide profesional, lengkap dengan grafik dan speaker notes. |
| 6 | `trade` | Trade Pro | Briefing pasar pagi, alert saham + crypto, ringkas laporan keuangan emiten. |
| 7 | `macro` | Macro Strategist | Pantau berita ekonomi global, hubungkan dampak ke portofolio kamu. |
| 8 | `business` | Business Director | Tracking metrik, anomaly alert, auto-bikin laporan KPI buat tim kamu. |
| 9 | `video` | Video Producer | Script TikTok/Reels, saran edit, hashtag research — output 10x per hari. |
| 10 | `social` | Social Conductor | Trending topic detection, schedule best-time, auto-balas DM dengan brand voice. |

Brand-voice audit:
- Uses `kamu` form throughout ✓
- No `lo/gue` ✓
- No exclamation marks ✓
- No banned words (`basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`) ✓
- Note: card #9 "output 10x per hari" — this is "10 times per day" (literal multiplier), not the banned tech-bro "10x" hyperbole. Acceptable per brand voice.

---

## Card layout

```
┌───────────────────────┐
│                       │
│  [DottedVideo]        │  ← /assets/agent-<slug>.mp4
│   60% of card height  │     cellSize=4, color=#E5322D
│                       │
├───────────────────────┤
│  Deep Researcher      │  ← Instrument Serif, 1-line, ~22px
│                       │
│  Riset topik kompleks │  ← Inter font-light,
│  dari ratusan sumber. │     ~13-14px, 2-line clamp,
│                       │     opacity 0.65
│                       │
└───────────────────────┘
   ↑ liquid-glass border, rounded-2xl, padding 16px
```

**v1 omission:** "Lihat use case →" hover link is dropped from v1 because `use-cases.html` has no per-agent anchors yet (would be dead links). Re-add when use-cases page lands per-agent sections.

---

## Carousel mechanics

**Approach:** CSS scroll-snap track + JS `setInterval` calling `scrollBy({ left: cardWidth, behavior: 'smooth' })`.

**Why this approach over alternatives:**
- Pure CSS marquee (already used at index.html:1062 for use-case cards) → continuous motion conflicts with the spec's "4s per card" discrete pacing
- Transform `translateX` → works but requires manual responsive math; scroll-snap is cleaner with mobile touch parity

### Cards per viewport

| Viewport | Visible | Card width target |
|---|---|---|
| Mobile (≤640px) | 1 + peek | `min(82vw, 320px)` |
| Tablet (641-1024px) | 2 | `min(42vw, 360px)` |
| Desktop (>1024px) | 3 | `min(28vw, 380px)` |

Edge fades (`mask-image: linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)`) hide the cut-off card at left/right.

### Auto-rotation

- Default cadence: `setInterval(advance, 4000)`
- Pauses on:
  - Hover anywhere within the carousel root (`onMouseEnter`)
  - Section offscreen (IntersectionObserver, `rootMargin: 0px`)
  - `prefers-reduced-motion: reduce` set
- Resumes on inverse signals
- When at last card, `scrollLeft = 0` (loops back to start)
- Index wraps `0..9`

### Reduced-motion fallback

If `matchMedia('(prefers-reduced-motion: reduce)').matches`, the auto-rotate is disabled entirely. Carousel renders as a static horizontal scroll the user can swipe / scroll manually. Dot indicators still update on scroll.

---

## DottedVideo per card

- Component reused as-is from `index.html:1952`
- Props: `src="/assets/agent-<slug>.mp4"`, `color="#E5322D"`, `cellSize={4}`
- Existing IntersectionObserver inside DottedVideo pauses video + skips draw when offscreen
- Mobile perf tier (`isMobile || saveData`) auto-bumps cellSize to ≥9 inside the component, so phones don't render dense dots

### Asset placeholder strategy (Phase 1)

Files `/assets/agent-{pro,researcher,web,doc,slide,trade,macro,business,video,social}.mp4` do not exist yet. Founder will produce custom ASCII renders per agent.

**Phase 1 placeholder cycling:**
- Cards 1, 3, 5, 7, 9 → `/assets/new-hero.mp4`
- Cards 2, 4, 6, 8, 10 → `/assets/ascii-wave.mp4`

Inline TODO comment in code:

```js
// TODO: Replace placeholder videos at /assets/agent-{pro,researcher,web,
// doc,slide,trade,macro,business,video,social}.mp4 with custom ASCII
// renders per agent (Richie to provide). Phase 1 cycles new-hero.mp4 +
// ascii-wave.mp4 as placeholders.
```

### Lazy-load policy

- Currently-active + next-2 cards: `<source src="...">` rendered in DOM
- Other 7 cards: `<video preload="none" data-deferred-src="...">` — source assigned when card enters the active window
- Prevents 10 simultaneous videos from blowing the budget

---

## Sub-text + tier tie-in

Below the carousel, small italic muted text:

> *Starter: 1 agent · Pro: 5 agent · Studio: 10 agent — pilih yang cocok di [harga →](#pricing)*

Inline `<a href="#pricing">harga →</a>` smooth-scrolls to the pricing section. Underline on hover only.

---

## Accessibility

- `<section role="region" aria-roledescription="carousel" aria-label="Agen yang tersedia">`
- Each card: `<article aria-label="Agent: Deep Researcher">`
- Auto-rotate respects `prefers-reduced-motion`
- Pause on focus-within (keyboard navigation)
- Dot indicators: `<button aria-label="Slide ke kartu 3" aria-current={i === active}>`

---

## Performance budget

- Each agent video target: <500KB (Phase 1 placeholders exceed this; ship as-is, replace post-launch)
- Card render budget: 10 cards × ~20 nodes each = ~200 nodes added to section
- Total page DOM impact: ~+10% (1905 → ~2100). Will push us further over the Lighthouse 1500 warn line; acceptable per Phase 2C deferred-optimization decision
- No new external scripts; React-via-CDN, framer-motion, hls.js already loaded
- DottedVideo's existing IntersectionObserver + frame-modulo throttling handles offscreen pause

---

## Implementation outline

In `index.html`:

1. **Add `AgentCarousel` component** (~150 LOC) above `StartSection` definition — uses `useState`, `useEffect`, `useRef`, IntersectionObserver
2. **Add CSS rules** to the existing `<style>` block:
   - `.agent-track { scroll-snap-type: x mandatory; overflow-x: auto; ... }`
   - `.agent-card { scroll-snap-align: start; flex: 0 0 auto; ... }`
   - `.agent-track::-webkit-scrollbar { display: none; }`
   - `.agent-fade { mask-image: linear-gradient(...); }`
3. **Insert `<AgentCarousel />`** inside `StartSection` after the "Mulai hari ini" button
4. **Add inline TODO comment** for placeholder asset paths

No external file changes. No new assets needed for v1 (placeholder cycling).

---

## Verification before merge

- `npm run typecheck:all` clean
- `npm test` 178/178 (no test changes; this is HTML/JSX)
- Brand voice grep: no `Anda`, no `lo/gue`, no `!` in customer copy, no banned words
- Manual smoke on Vercel preview:
  - 1 card visible on 375×812 mobile viewport
  - 2 cards on 768×1024
  - 3 cards on 1440×900
  - Auto-rotation visibly advances at ~4s cadence
  - Hover pauses (test by hovering for 10s)
  - Smooth-scroll to `#pricing` works from sub-text link
  - DottedVideo halftone renders red on black for each visible card
- Lighthouse mobile ≥ 80 (acceptable to be lower per Phase 2C decision; flag if drops below 70)

---

## Out-of-scope (logged for follow-up)

- Per-agent ASCII video assets at `/assets/agent-<slug>.mp4` (Richie to render)
- Per-agent anchor sections in `use-cases.html` (`#pro`, `#researcher`, etc.)
- Re-add "Lihat use case →" hover link once anchors land
- `#community` section's `lo/gue` → `kamu` brand-voice cleanup (separate sweep)
