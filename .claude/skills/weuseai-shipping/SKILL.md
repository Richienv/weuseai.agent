---
name: weuseai-shipping
description: >-
  Use this skill for ANY work on the weuseai product — the weuseai.id marketing landing and
  its weuseai.agent / velorah repo — including small, routine UI edits, not just deploys. Fire
  it the instant a request mentions weuseai or weuseai.id, or names one of its parts: the
  landing, hero, pricing cards, persona carousel, testimonials, integrations tiles,
  checkout/welcome/onboarding pages, or the files app.jsx, app.js, tw.css, index.html,
  tier-personas.ts, persona-details.js. Also use it for: rebuilding the landing or a
  stale-app.js / freshness-gate test failure; pricing or persona drift between the landing
  and tier-personas.ts; adding a section or onboarding/Telegram-pairing step; editing
  supabase/functions or _shared/cors.ts; or Xendit checkout/payment work. Widening a card,
  adding a testimonials block, tweaking hero copy — all count. Only skip it for generic
  how-to questions about CORS, Tailwind, Playwright, Supabase, or auth in some other,
  unrelated codebase.
---

# weuseai-shipping

Operational playbook for shipping in **weuseai.agent** (root: `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah`; the parent `weuseai.agent/` is NOT a git repo). It exists because two whole classes of breakage already bit this repo — a Vercel build step that froze production (PR #236) and a **stale edge-function deploy with mismatched CORS that took payments down** — and both are avoidable with the procedures below. Read this alongside `CLAUDE.md`, never instead of it.

**Prime directive: ship one-shot.** Do the reversible technical work yourself, verify it with evidence before you claim it, and leave the solo founder (one person, Hangzhou/Jakarta) the smallest possible pile of unavoidable human-only actions. Every command you hand him to run is a stall and a context-switch tax. Think ten steps ahead so the change lands clean the first time.

## Operating principles (the always-loaded core)

1. **Do it yourself when the tooling is on this machine.** The `supabase` CLI is logged in here and the founder's secrets are present, so you DEPLOY edge functions yourself — never hand the founder `supabase functions deploy` to paste. The same goes for rebuilding landing artifacts, running tests, and Playwright verification. The only things that are genuinely founder-only are listed in `CLAUDE.md` ("When to STOP"): API keys, paid signups, rotating `XENDIT_API_KEY`, pricing/revenue logic, and substantive brand copy. Everything else is yours.

2. **Think ten steps ahead — run the pre-flight anticipation checklist** before you start, not after you break something:
   - *What committed artifacts does my source edit force me to regenerate?* (Edit `app.jsx` → you owe a rebuilt `app.js` + `tw.css`, committed together, or the freshness gate fails the suite.)
   - *What deploys automatically vs. what drifts?* The landing ships on push to `main` (Vercel, static). Edge functions do NOT — nothing in a Vercel push runs `supabase functions deploy`, so a live function silently drifts from the repo until you redeploy. That drift is exactly what killed payments.
   - *What invariants will a drift gate enforce?* Pricing is pinned in lockstep across four files; persona slugs are aliased expand-then-contract. Grep for the gate before you change a number.
   - *Which branch am I on?* Landing work lives on its own `landing/*` branch; backend changes go on their own branch/PR. Don't cross the streams.
   - *What's the smallest human-only residue?* Name it explicitly at the end.

3. **Minimize founder work.** Default to finishing end-to-end. When you must stop, stop for a reason on the `CLAUDE.md` STOP list, state exactly why a human is required, and hand over one verified, copy-pasteable action — not a debugging session.

4. **Verify before claiming.** Never report DONE without evidence. For the landing: rebuild, run `npm test` (the freshness + pricing-drift + honesty gates), and verify rendered behavior with Playwright against the actual page. For edge functions: redeploy, then confirm the live function answers correctly (CORS preflight echoes the right `Access-Control-Allow-Origin`, the happy path returns 2xx). "It should work" is not evidence; a green gate and an observed response are.

5. **Use the ultracode workflow for non-trivial features.** Before building anything beyond a one-liner, craft an explicit build-prompt: a phased plan with gates between phases (build-freshness, honesty, pricing-drift for the landing; redeploy + CORS + `verify_jwt` checks for functions), an architect-then-synthesis pass for anything multi-file, and a verification step named up front. The exemplars (round 4 / round 5 landing prompts, the `cors.ts` redeploy) are reconstructed in `references/operating-principles.md`. Plan the gates first; the build is downstream of the plan.

## Decision table — what to read before you act

| If the task touches… | Read first |
|---|---|
| the landing — `index.html`, `assets/app.jsx`/`app.js`/`tw.css`, `persona-details.js`, `checkout.html`, `welcome.html`, `onboarding.html`, `scripts/build-landing.mjs`, or the build/freshness gate | `references/landing-build.md` |
| edge functions, `supabase/functions/**`, `_shared/cors.ts`, CORS, `verify_jwt`, payment/checkout/Xendit debugging, a payment outage, or `scripts/deploy-all.sh` | `references/edge-functions.md` |
| any non-trivial feature (multi-file, new behavior, anything you'd plan before coding) | `references/operating-principles.md` — craft the ultracode build-prompt FIRST, then build |

When a task spans both (e.g. a checkout change that touches `checkout.html` AND `create-invoice`), read both reference files; the landing artifact and the edge function deploy on different rails and each has its own gate.

## The three reference files

- **`references/landing-build.md`** — the precompiled-React pipeline. How `scripts/build-landing.mjs` compiles `app.jsx` → `app.js` (esbuild, classic `React.createElement` against UMD globals — no ESM imports survive) and scans `index.html` + `app.jsx` + `persona-details.js` for the Tailwind classes that become `tw.css`. How the freshness gate byte-compares the committed artifacts, why Vercel must stay a pure static host (PR #236), and how to verify a visual change with Playwright. Read it the moment you open any landing file.

- **`references/edge-functions.md`** — the Supabase edge-function deploy runbook and the stale-deploy/CORS outage postmortem. Preconditions to verify (CLI logged in, project ref `gtjgsligllbjcisiyrah`), how to deploy a single function yourself, the `_shared/cors.ts` tight-origin regex, and the load-bearing rule: NEVER blanket `--no-verify-jwt` on deploy — `customer-progress-proxy` and friends inherit the default `verify_jwt=true` and rely on it. Read it BEFORE touching anything under `supabase/functions/`.

- **`references/operating-principles.md`** — the meta-lessons and the ultracode prompt-crafting pattern (phased build with gates, architect+synthesis, the deploy-all partial loop), branch hygiene, and the `CLAUDE.md` stop/proceed rules distilled. Read it when planning any non-trivial feature, or when you're unsure whether an action is yours to take or the founder's.
