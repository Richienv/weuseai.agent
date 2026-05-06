# Community Use Case Section — Design (2026-05-05)

Outcome of the brainstorming session on 2026-05-05. Approved by founder.

## Context

- Phase 1 status: zero real paying customers, so honest social-proof
  copy is impossible. Current `Stats` and `Testimonials` sections are
  placeholder content.
- Founder shared two inspiration tweets (OpenClaw hotel-postcard bot,
  TinyFish free agent search) showing the tone of "wild things people
  build with agent runtimes" they want to convey.
- Existing landing voice: calm-premium, `kamu` form, no hyperbole.
  Brand voice doc in CLAUDE.md.
- The just-shipped `ChatVsAgent` section landed as the conversion pinch
  point. New community section should sit downstream of pricing as the
  proof-of-life-with-agents moment.

## Decisions (from brainstorming)

| # | Question | Answer |
|---|----------|--------|
| 1 | Whose workflows? | **Hybrid** — sample-skills we control + real Hermes / agent-runtime community quotes |
| 2 | Where in page? | After `Pricing`, before `FAQ`. `Testimonials` stays where it is, fills with real quotes once we have customers. |
| 3 | Format | Tweet-style quote cards (handle + body + footer source) |
| 4 | Sample-skills attribution | Our shared bot speaks: `@weuseaibot · agen lo`. Card body uses **action/status register only — NO personal pronouns** (no `lo / gue / aku / kamu / I / you`). |
| 5 | Card count | **4 sample-skills + 3 community = 7 total.** 2×2 grid for skills, 3-col row for community on desktop. |

## Section structure

- **Anchor:** `#community`
- **Pill:** `Dari komunitas` (uses existing liquid-glass pill pattern,
  same red-tinted border as other section pills)
- **Headline (display serif):** `Yang sudah jalan, di luar sana.`
- **Subheadline (`kamu` allowed — this is brand voice, not agent voice):**
  > "Skill bawaan yang sudah hidup di agent kamu hari pertama. Plus apa
  > yang lagi dikerjain agent lain di komunitas."
- **Two stacked panels:**
  1. `Skill bawaan` → 4 cards in 2×2 grid (md+), stacked on mobile
  2. `Dari komunitas agent` → 3 cards in 3-col row (md+), stacked on
     mobile

## Card visual contract

Base: existing `liquid-glass rounded-2xl p-5 md:p-6` pattern, no
featured-card glow (this is breadth, not a single hero).

Each card has three rows:

```
┌─────────────────────────────────┐
│ [@] handle · timestamp           │  ← header line (small, muted)
├─────────────────────────────────┤
│ body text                        │  ← 2–4 lines, font-body font-light
│ multi-line allowed                │
├─────────────────────────────────┤
│ skill: <id>  /  source: <link>   │  ← footer (very small, mono-ish)
└─────────────────────────────────┘
```

- Header avatar: solid square (16×16) with first letter of handle, NOT
  a real logo (avoids trademark issues for community cards too).
- Handle styling: `font-mono text-xs text-white/65`.
- Body: `text-sm text-white/85 leading-relaxed`.
- Footer: `text-[10px] font-mono uppercase tracking-[0.18em] text-white/40`.
- Footer link (community cards only): underline on hover, opens
  `target="_blank" rel="noopener noreferrer"`.

## Card copy (verbatim — these are the strings to ship)

### Panel A — Skill bawaan (agent voice, action register, no pronouns)

**A1 · daily-news-briefing-bahasa**
- Header: `@weuseaibot · agen lo · jam 7:00 WIB`
- Body:
  > Selamat pagi.
  > 5 berita teratas dari detik, kompas, cnbcindonesia
  > sudah diringkas. Top brief masuk chat ini sekarang.
- Footer: `skill: daily-news-briefing-bahasa`
- Honesty: ✅ already shipped in `services/provisioning/src/setup-script.ts`

**A2 · lowongan-scout-malam**
- Header: `@weuseaibot · agen lo · jam 23:14 WIB`
- Body:
  > Semalam: 50 lowongan dari Glints, LinkedIn, Kalibrr dipantau.
  > 8 fit kriteria gaji + remote + WFA.
  > Daftar sudah masuk Notion, siap sortir ulang besok pagi.
- Footer: `skill: lowongan-scout · roadmap`
- Honesty: 🚧 NOT YET SHIPPED — small `roadmap` tag in footer

**A3 · content-drafter-multi**
- Header: `@weuseaibot · agen lo · jam 4 sore`
- Body:
  > Topik "cara mulai bisnis F&B" diolah dari 12 sumber.
  > 3 draft caption Instagram + 1 thread X siap di-review.
  > Tone otomatis mengikuti persona di SOUL.md.
- Footer: `skill: content-drafter · roadmap`
- Honesty: 🚧 NOT YET SHIPPED — small `roadmap` tag in footer

**A4 · postcard-outreach** (BI riff on the OpenClaw use case)
- Header: `@weuseaibot · agen lo · semalam`
- Body:
  > 50 hotel di Bali dipantau. 12 dengan rating 4.5+ tapi foto listing buruk.
  > Foto interior diambil dari Maps, redraft jadi IG post matched ke brand
  > hotel masing-masing. Postcard dengan QR preview siap dikirim.
- Footer: `skill: outreach-postcard · roadmap`
- Honesty: 🚧 NOT YET SHIPPED — small `roadmap` tag in footer

### Panel B — Dari komunitas agent (real public quotes, real attribution)

**B1 · Hermes Agent v0.12.0 multi-agent Kanban**
- Header: `@hermes_agent · 3d ago`
- Body (verbatim from upstream release post, paraphrased to fit):
  > "Hermes Agent now has multi-agent via the Kanban, new in v0.12.0.
  > Agents claim tasks from a board, work in parallel, and hand off when
  > blocked. You watch progress and unblock from one easy view instead of
  > juggling terminals."
- Footer: `source: github.com/NousResearch/hermes-agent`
- Honesty: ✅ real upstream Hermes release; sourced from text founder
  pasted in earlier message (`Hermes Agent now has multi-agent via the
  Kanban, new in v0.12.0...`). To-do before publish: confirm exact
  upstream URL.

**B2 · TinyFish free agent search**
- Header: `@Tiny_Fish · 16h ago`
- Body (verbatim):
  > "Starting today, TinyFish Web Search and Fetch are free.
  > For every dev and agent. Across the galaxy.
  > No credit card. Generous rate limits."
- Footer: `source: x.com/Tiny_Fish`
- Honesty: ✅ real public tweet (founder shared screenshot)

**B3 · OpenClaw hotel postcard bot**
- Header: `@everestchris6 · 10h ago`
- Body (excerpted from real public tweet):
  > "This OpenClaw bot finds hotels with ugly listing photos, redrafts
  > them as IG posts, and mails the owner a postcard — on autopilot.
  > Scrapes every hotel in a city in real time."
- Footer: `source: x.com/everestchris6`
- Honesty: ✅ real public tweet (founder shared screenshot). Notes:
  this is OpenClaw, not Hermes — included as broader "agent runtime
  ecosystem" example. Panel header `Dari komunitas agent` is intentionally
  broader than just Hermes.

## Honesty + accessibility checklist

- ✅ No fake testimonials anywhere
- ✅ All "community" quotes traceable to real public posts
- ✅ Cards A2/A3/A4 visibly tagged `roadmap` in footer (not pretending
  to be live skills today)
- ✅ Panel A cards use action-register voice (no personal pronouns) per
  founder constraint
- ✅ Section headline / subheadline / panel headers use brand voice
  (`kamu` allowed) per CLAUDE.md
- ✅ All avatars are solid colored squares with first letter — no real
  logos lifted, no trademark issues
- ✅ Source links open in new tab with `noopener noreferrer`
- ✅ Each card has `role="article"` + `aria-label="<handle> — <skill or
  source>"` for screen readers
- ✅ Tab order follows visual order (mobile + desktop both)

## Voice rules audit (against CLAUDE.md ban list)

| Banned word | Used? |
|-------------|-------|
| `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level` | ✅ none |
| Exclamation marks in our copy | ✅ zero (real quotes may contain them — preserved verbatim is OK) |
| Emoji in our copy | ✅ zero |
| `Anda` | ✅ none |
| `lo / gue / aku / kamu / I / you` in Panel A bodies | ✅ none |

## Out of scope (deferred)

- Real customer testimonials → wait for first 5 paying customers, then
  populate the existing `Testimonials` section with real quotes
- Inline workflow visuals per card (the OpenClaw 3-stage strip style) →
  deferred per founder pick of format B (tweet-style cards). Reconsider
  in Phase 3 if conversion data shows low engagement on this section.
- Actual implementation of skills A2/A3/A4 → tracked separately in
  `services/provisioning/src/setup-script.ts` skill catalog. The
  `roadmap` tag in card footers makes this honest.

## Implementation notes for the writing-plans skill

- File to edit: `liren-v3.html`
- New function: `CommunitySection()` declared right before `function FAQ()`
  (insert order: after `Pricing`, before `FAQ`)
- Mount: insert `<CommunitySection />` between `<Pricing />` and `<FAQ />`
  in `App()`
- Reuse: `liquid-glass`, `BlurText`, `Mot.div`, font tokens, brand red
  `#E5322D`
- Estimated diff: +180 lines, single file
- Same branch as comparison section: `feat/landing-vs-comparison` (will
  rename to `feat/landing-overhaul` if pricing redesign also lands here)

## Sign-off

Founder approved 2026-05-05 in the brainstorming chat. Implementation
plan to be drafted next via the `writing-plans` skill.
