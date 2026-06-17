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
- _(loop appends below as it ships)_
