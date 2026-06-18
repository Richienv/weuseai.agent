# Overnight autonomous run — 2026-06-17 (founder away ~6h)

Orchestrated by Opus 4.8 in a self-paced `/loop`, using ultracode workflows for the big/fuzzy items and direct builds for specced phases. **Mission:** take the weuseai.id landing + its safe frontend surfaces from "good" to "exceptional, conversion-tuned, Instagram-ready," and ship as much verified value as possible — compressing weeks of design+dev iteration into one night.

## Hard limits (never crossed, unsupervised)
- **Branches only.** Never merge a PR. Never push to `main`. Never deploy to prod (Vercel main / `supabase functions deploy`).
- **No backend / payments.** Never touch `supabase/`, `services/`, edge functions, Xendit, `tier-personas.ts` price fields/slugs, `checkout.html`/`onboarding.html` logic, or any secret.
- **Gate-green or revert.** Every commit must pass freshness + honesty + pricing-drift, with zero exclamation marks / banned words in copy. If a phase can't pass, `git checkout -- .` it and move on.
- **No new npm packages.** Reuse existing primitives.
- Each iteration = one coherent, verified, committed improvement. No half-baked sprawl.

## Scope (allowed)
`index.html` + `assets/app.jsx` (+ generated `app.js`/`tw.css`) + landing assets; **new** static pages (`faq.html`); cosmetic-only `use-cases.html`; landing tests (additive); `docs/`; the `weuseai-shipping` skill description (#273). Funnel pages (checkout/onboarding/welcome) are OFF-LIMITS this run.

## Prioritized backlog
1. **Finish flashy-minimal landing** (PR #271) — ✅ hero circuit + minimal copy · ✅ centerpiece/origin slash · ✅ pricing ValueSlider + hero trim · ⏳ how-it-works motion · carousel→tags · FAQ 17→7 · pricing bullets · global gloss (hover/CTA-sheen/scroll-reveal).
2. **Apply optimizer `best_description`** → `.claude/skills/weuseai-shipping/SKILL.md` (PR #273).
3. **Ultracode QA + conversion audit** — parallel agents on copy-brevity, visual/animation consistency, responsive (14"/13"/mobile), a11y, perf, honesty/brand, IG-conversion → fix findings iteratively.
4. **Build `/faq` page** — relocate the cut FAQ rows + a full FAQ, in the new flashy-minimal style.
5. **`use-cases.html` cosmetic redesign** toward the new style (no logic).
6. **Performance pass** — landing asset sizes, lazy-load, CSS bloat.
7. **a11y pass** — alt text, aria, focus states, reduced-motion coverage, contrast.
8. **Final full-page Playwright QA** (desktop + mobile + reduced-motion) + screenshots + polish round.
9. **Additive landing tests** — content/structure guards (no behavior change).

## Shipped log (append per iteration)
- `75fd81e` [#271] Pricing ValueSlider (interactive, honest) + hero trim — verified, gates 10/10.
- `253ac16` [#271] Hero circuit-flow bg + minimal color-split copy.
- `0e39045` [#271] Centerpiece + origin copy slashed to one-liners.
- `f254482` [#271] How-it-works: 4 step bodies → one-liners + alternating slide-in motion.
- `d169cf1` [#271] Carousel: 12 descs → 2-4-word capability tags (cleaner cards).
- `330d019` [#271] FAQ: 17 → 7 tightened Q&As + leaner sub-line (the ~10 cut rows pending the /faq page, backlog #4).
- `f39a165` [#271] Pricing cards: outcomes trimmed to 3 short bullets each (prices/slugs untouched, drift gate green). LLM-credit detail now lives in the FAQ.
- _(next)_ [#271] Global gloss: hover-lift + red rim on cards, glossy sheen-sweep `.cta-pulse` on the featured pricing CTA (navbar Mulai intentionally left un-pulsed — a perpetual sticky-header glow would nag). **Backlog #1 (flashy-minimal landing) COMPLETE.**
- `ebfd21d` [#271] Global gloss: hover-lift + red rim on cards, sheen-sweep on the featured CTA. **Backlog #1 (flashy-minimal landing) COMPLETE.**
- **Item 2 (optimizer description) — RESOLVED, no change.** Read the optimizer result: its `best_description` (held-out 4/8) was the *original conditional* wording ("Read this BEFORE… non-trivial work"); later iterations overfit train. But #273 already carries the *aggressive* variant ("Use this skill for ANY work… including small routine UI edits… Fire it the instant a request mentions weuseai"), which serves the founder's explicit "always use it" directive better than the optimizer's pick on a noisy 4/8 eval. Kept the aggressive description; no downgrade committed.
- _(next)_ Launched ultracode QA + IG-conversion audit (item 3) — parallel agents auditing the flashy landing; findings → fixed in subsequent iterations.
- `3b230f7` [#271] Night-log: item 2 (optimizer desc) resolved.
- QA audit (`wsvv1mbhv`, 5 agents) → findings saved to `docs/plans/2026-06-17-landing-qa-findings.md`. Hard gates confirmed CLEAN (no exclamation/banned in rendered copy, demo-honesty intact, no pricing drift). One true honesty violation (School Expert shipping live).
- _(next)_ [#271] **QA P0 batch:** School Expert `live`→`segera` + future-tense msg (the honesty fix); `agen lo`→`agen kamu` ×15 (banned register); CommunitySection header de-overclaimed ("terus kami tambah"); hero `h2`→`h1` + BlurText default `h1`→`h2` (single top-level heading); deleted the 1.32 MB `new-hero.mp4` preload; generic `.live-dot` (IntegrationsSpine dots were zero-size); 4 dead mockup buttons → `tabIndex=-1`+`aria-hidden`. All gate-green, verified.

### ⚑ Flagged for founder (NOT auto-applied — conversion/structure/design calls):
- **QA P0 hero-circuit z-index**: audit wants `z-1` (behind dim) but founder explicitly wanted the circuit *noticeable* — KEPT at `z-2` (headline+frame at z-3 stay legible). Revert to z-1 if you prefer it subtler.
- **QA P0 two above-fold hero CTAs**: audit says collapse to one + demote consult to a text link. Left as-is (both buttons) — your call on conversion.
- **QA P0 render order / OriginSection**: audit recommends compressing OriginSection to a slim strip + moving Pricing earlier (hero→apps→price). NOT done — you explicitly wanted OriginSection restored as a full section; reordering is a real conversion experiment for you to approve.
- `12eea3e` [#271] QA P0 batch (honesty + a11y, see above).
- _(next)_ [#271] **QA P1 reduced-motion batch:** one hardened global RM reset (`prefers-reduced-motion: reduce` → animation 0.01ms / iteration 1 / **fill-mode forwards** / transition 0.01ms) that neutralizes all ~109 perpetual decorative loops (pulses, grain, marquees, radar, caret/typing, carousel scenes, how/pv/cap/uc) in one safe block — verified both modes render ALL content (fill-mode:forwards prevents hidden mount-ins). Gates 10/10.
- `23f5c4e` [#271] QA P1a: hardened global reduced-motion reset.
- _(next)_ [#271] **QA P1b contrast:** eyebrow red `#E5322D`→`#FF6B66` (.db-eyebrow-pill + .vslider-eyebrow), .db-sub-micro + .is-tile-micro rgba .4/.42→.62, strikethrough anchor price white/35→white/55, community meta white/40→white/55. Decorative separators left muted. Gates 10/10.
- `206a32f` [#271] QA P1b: contrast fixes (eyebrow red, micro text, strikethrough/meta).
- _(next)_ [#271] **QA P1c aria + landmarks:** real `<main>` wrapper + decorative mockup `<main>`→`div role=presentation` (now exactly 1 main); CtaFooter `<section>`→`<footer>`; FAQ `aria-controls`/`id`/`role=region`/`aria-labelledby` + `aria-hidden` toggling on panels; ValueSlider `aria-valuetext` + readout `aria-live=polite`; carousel dots → 24×24 touch targets (visual dot via ::before); logo `alt=""` (link already labeled). Verified 1512px: 1 main / 1 footer / 1 h1, dots 24px, gates 10/10, 0 JS errors.
- `e7fa9ad` [#271] QA P1c: aria + landmarks (see above).
- _(next)_ [#271] **QA P1d perf:** carousel isShotFade 12s→6s + overlapping crossfade (kills loop-seam black flash; quick IG viewer sees motion); carousel videos `preload="metadata"`→`"none"` (IntersectionObserver flips to auto on-screen — stops ~19 concurrent metadata fetches at first paint). **Skipped/reverted with reasons:** framer-motion `.min.js` is 404 at that version → left the standard UMD (don't crash the app on a bad URL); `content-visibility:auto` caused height-drift + anchor-scroll jank → reverted; Noto Serif SC trim deferred (cosmetic hanzi risk, low value, already display=swap). Gates 10/10.
- `252e31f` [#271] QA P1d: perf (slideshow 6s + lazy carousel videos).
- `3f6ceed` [#271] QA P2: trimmed StartSection + CtaFooter subs.
- Round-2 ultracode QA+conversion audit (`wkctxdbu4`) → findings saved to `docs/plans/2026-06-17-landing-qa-findings-r2.md`. **Verdict: ~95% ready** — round-1 fixes hold, gates clean, no pricing drift. New P0s found: VelvetSection honesty over-claims, 8-vs-5-menit clash, CDN white-screen risk.
- _(next)_ [#271] **Round-2 P0 honesty:** VelvetSection — stripped vendor name "via Firecrawl", genericized "Integrasi native Home Assistant"→"Kontrol rumah pintar lewat perintah biasa", "Beresin Google Docs"→"Beresin dokumen" (no live Google Docs claim). Gates 10/10.

### ⚑ NEW flag for founder (round-2):
- **8 vs 5 menit:** OriginSection shows "Aktif 8 menit" (headline) + "Setup 5 menit" (sub) in one viewport; meta/og + FeaturesGrid say 8. These are arguably DISTINCT metrics (setup 5 min, fully active 8 min — you've shipped both together before in the original hero), so I did NOT auto-change a number. If you want them unified, say which is canonical and I'll align all references; or I can reword to "Setup 5 menit, aktif penuh 8 menit" to disambiguate.
- `bfed144` [#271] round-2 P0: VelvetSection honesty over-claims fixed.
- `20bb301` [#271] round-2 P0: self-hosted React/ReactDOM/framer-motion under assets/vendor/ + ErrorBoundary + Mot passthrough fallback (China white-screen robustness). Verified app mounts + framer works from self-host.
- _(next)_ [#271] **round-2 P1a:** dropped dead render-blocking Noto Serif SC from the Google Fonts URL (no font-hanzi usage); IntegrationsSpine sub now specific ("Konten, keuangan, latihan — dikerjakan langsung di app-nya…"); BlurText reduced-motion gate (headlines render settled — the CSS RM reset can't reach framer JS). Both motion modes verified, gates 10/10.
- `f78e546` [#271] round-2 P1a: dead font + spine sub + BlurText reduced-motion.
- _(next)_ [#271] **round-2 P1b:** PriceBreakdownModal focus trap (Tab cycles within the dialog, focus restored to trigger on close) + verified modal opens with focus inside, 0 JS errors. **Hero-video defer NOT done — flagged:** DottedVideo is a shared component (used in ~6 sections); a global rAF-defer would regress them, and a hero-only prop is fiddly for a modest gain (it already has an IntersectionObserver + mobile throttling). Left as-is.
- `04f0b70` [#271] round-2 P1b: PriceBreakdownModal focus trap.
- _(next)_ [#271] **round-2 P2 cluster:** dropped the unverifiable "v0.12.0" version claim; ChatVsAgent "weuseai.agent Pro"→"weuseai.agent" (no Pro tier); FAQ gak→nggak (×2, unify); micro-label contrast .pc-setup-sub + .db-stat .lbl white/0.45→0.55; decorative db-cursor SVG aria-hidden. priceStrike dead branch left untouched (founder's anchor decision). Gates 10/10.
- _(next)_ [#271] **Backlog #4 — /faq page SHIPPED.** New standalone `faq.html`: zero-JS native `<details>`/`<summary>` accordion, self-contained inline `<style>` reusing brand tokens (#0a0a0a / #E5322D / Inter + Instrument Serif + JetBrains Mono) so it needs NO tw.css and sits outside all landing gates (lowest-risk path). Header (wordmark + "← Beranda"), FAQ pill, Instrument-Serif headline with red color-split ("Pertanyaan yang **sering muncul**."), all **16** Q&As (the 7 landing rows + the ~9 cut ones, pulled from `330d019~1`), CTA → the real `cal.com/weuseai.agent/15min`, footer (terms/privacy/refund-policy/contact — all verified to exist). Copy lightly cleaned porting in: `gak`→`nggak`; support answer **genericized** to drop the deprecated tier names ("Pro dan Studio / Starter") + the unverifiable "12 menit median" → "Support lewat Telegram langsung… channel khusus". 0 exclamation / 0 banned words. Vercel cleanUrls auto-serves it at `/faq`. Landing FAQ section got a "Lihat semua pertanyaan → /faq" pill link (`.faq-all-link`, hover-lift + arrow-nudge). Verified Playwright @1512 + @390: 16 details / 1 open / accordion interactive / headline red-split renders / bg #0a0a0a / **0 console errors** both viewports; landing link text+href correct. Gates 10/10, no pricing drift.
- `a5e68e6` [#271] /faq page (faq.html) + landing "lihat semua" link — verified, gates 10/10.
- _(next)_ [#271] **Backlog #5 — use-cases.html.** Assessed first: the page is ALREADY on the brand visual system (dark, Instrument-Serif clamp headlines, USE CASES pill, category-pill nav, stat tiles) — a heavy "flashy-minimal redesign" would be high-regression-risk for little visual gain. The REAL defect was brand-voice: it addressed the reader as **"lo" 146×** (99 lowercase + 47 capitalized) + **"gue" 1×** — the banned lo/gue register (CLAUDE.md locks voice to `kamu`, never lo/gue). Fixed: every standalone `lo`/`Lo`→`kamu`/`Kamu`, the one user-quote `gue`→`aku`, leaving `kalo` (×2) + all non-pronoun text untouched (147 word changes, copy-only, zero logic/markup/style change). Confirmed the 58 `!` are all `<!--`/`<!DOCTYPE` openers — ZERO real exclamation marks. Verified Playwright @1512 + @390: renders, 0 console errors, h1 now "40 cara AI bikin hidup **kamu** lebih enak."
- `e267ebc` [#271] use-cases: off-brand register fix (lo/gue → kamu/aku).

### ⚑ NEW flag for founder (use-cases.html):
- **use-cases.html loads `https://cdn.tailwindcss.com` (the runtime Tailwind compiler)** — the SAME render-block + China white-screen risk we just eliminated on index.html (round-2 P0: self-hosted vendor + precompiled tw.css). Fixing it properly = adding `./use-cases.html` to the build pipeline's content-scan + precompiling its own stylesheet (or self-hosting), which is a build-pipeline change (NOT cosmetic) with real breakage surface on a 1443-line page that uses arbitrary Tailwind classes. I did NOT auto-apply it. If you want it hardened the same way as the landing, say so and I'll do it carefully under the gate.
- _(loop continues: final QA → round-3 audit; wind down after a clean pass)_
