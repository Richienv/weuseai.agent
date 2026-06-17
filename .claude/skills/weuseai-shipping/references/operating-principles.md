# Operating principles — ship one-shot, bother the founder least

> Meta-lessons + the ultracode prompt-crafting pattern for shipping in
> **weuseai.agent** (`/Volumes/Extreme SSD/Projects/weuseai.agent/velorah`).
> Read this alongside `CLAUDE.md`. The reader is a capable model — these are
> the *why*s, not a checklist. The throughline: **think 10 steps ahead, do the
> reversible technical work yourself, hand the founder only what genuinely needs
> a human, and never report DONE without evidence.**

---

## 0. The prime directive

The founder is one person in Hangzhou/Jakarta running this whole stack. Every
manual step you delegate is a context-switch tax on him and a place the ship
stalls. So the goal of every session is: **leave him with the smallest possible
pile of human-only actions, each one unavoidable, each one verified to be
necessary — and do everything else, end to end, yourself.**

That is not recklessness. It is the opposite: it requires you to think further
ahead than a human would, because you're the one closing the loop.

---

## 1. Do it yourself when the tooling is on the machine

This is the founder's Mac. The whole toolchain is installed and authenticated.
Verified present this session:

| Tool | Version | State |
|---|---|---|
| `git` | 2.50.1 | repo at `…/velorah` (parent `weuseai.agent/` is NOT a git repo) |
| `gh` | 2.92.0 | logged in |
| `supabase` | 2.84.2 | **logged in**, `weuseai.agent` ref `gtjgsligllbjcisiyrah` LINKED (`supabase projects list` shows the ● on it) |
| `node` | 24.7.0 | runs `scripts/build-landing.mjs`, the test suite |
| `npx playwright` | 1.58.2 | drives the landing gates + real browser verification |
| `vercel` | 54.13.0 | linked project (`.vercel/project.json`) |
| `docker` | 29.4.0 | for `npm run local:up` / `local:fn-serve` |

**Default to RUNNING the deploy/verify/test yourself.** The supabase CLI being
logged in is the single biggest unlock — the round5 prompt told the founder to
run `supabase functions deploy create-invoice --project-ref gtjgsligllbjcisiyrah`
*as a manual step* because that prompt assumed a secret-less sandbox. **On this
machine that assumption is false.** You can run the deploy yourself. The redeploy
*was* the actual payment unblock (the repo `cors.ts` was already mostly correct —
the stale global deploy was the bug), so the highest-leverage move is to run it,
not to write instructions for it.

**Re-read `CLAUDE.md` "When to STOP and ask founder" — but read it precisely.**
It stops you for: API keys/credentials/paid signup, architecture beyond the
locked stack, **brand-facing copy / marketing claims**, **pricing/revenue logic**,
spending money, substantive `index.html`/`checkout.html` edits, stuck >30 min.
Note what is NOT on that list: **running a deploy of code the founder already
authorized.** A Supabase function redeploy from already-reviewed source is a
reversible technical step — exactly the "JUST PROCEED" category. Bias toward
action for it.

**The dividing line — only hand the founder a manual step when it genuinely is
one of:**
- **A secret/credential that isn't on the machine.** Rotating `XENDIT_API_KEY`
  from `xnd_development_*` → `xnd_production_*` is founder-only (CLAUDE.md marks
  it so). Setting a *new* Supabase function secret the dashboard doesn't have yet
  is founder-only. But a redeploy that reuses already-set secrets is not.
- **An irreversible business decision.** Going to Xendit prod mode (first
  real-money charge), changing a price, shipping brand copy, an architecture
  change. These are judgment the founder owns.
- **A physical/account action you can't take.** Confirming a Vercel scope slug
  against an account dashboard, dropping real screenshot assets into `assets/`.

Everything else — build, test, lint, typecheck, browser-verify, curl a preflight,
deploy reversible backend, open a PR — **you do.**

---

## 2. Think 10 steps ahead (ultra-think) before you run anything

Before executing, enumerate two lists: **what could go wrong**, and **what comes
next**. Then pre-empt both *in the same pass*. A one-line instruction almost
always hides a chain of latent failure modes; handling them one-at-a-time turns a
5-minute fix into a 5-round back-and-forth with the founder.

### Worked example — "redeploy create-invoice" had ~10 latent failure modes

The round5 payment fix looked like one line:
`supabase functions deploy create-invoice --project-ref gtjgsligllbjcisiyrah`.
Thinking 10 steps ahead surfaces what that line silently assumes:

1. **Wrong working directory.** `supabase functions deploy` resolves
   `supabase/functions/<fn>` relative to CWD, and agent bash calls reset CWD
   between invocations. → Always `cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah"`
   in the *same* compound command, or pass absolute paths.
2. **Docker not running.** The CLI's bundler historically needs the Docker
   daemon; `docker` is installed but may not be *up*. → Prefer the API-based
   bundler (`--use-api`) so the deploy doesn't depend on a running daemon, or
   start Docker first and verify.
3. **The `verify_jwt` trap.** `create-invoice` has `verify_jwt=false` in
   `supabase/config.toml` (the round5 prompt cites `:24-25`). A deploy that
   doesn't honor the config can flip it to `true` and 401 every checkout. →
   Deploy config-driven; after deploy, confirm the function still answers OPTIONS
   without auth.
4. **Wrong scope slug.** The CORS allowlist pins
   `PREVIEW_SUFFIX = '-richies-projects-6f212435.vercel.app'`. If that slug is
   wrong, previews stay broken *after* a green deploy. → Confirm it against the
   failing origin string and `.vercel/project.json` before deploying (this one is
   a founder-confirmable, but you can read `.vercel/project.json` yourself first).
5. **The NEXT function in the funnel is also stale.** `cors.ts` is imported by
   ~38 functions; `supabase functions deploy` bundles the shared file
   *per-function* — there is no shared runtime module. Fixing `create-invoice`
   alone leaves `complete-onboarding`, `customer-progress-proxy`,
   `customer-readiness`, `rotate-pairing-code`, `validate-bot-token`,
   `save-onboarding-profile`, `reset-bot-pairing`, `genesis-distill`,
   `agent-chat-relay` serving stale CORS. The customer hits those *right after*
   payment. → Redeploy the whole browser-callable set in one pass.
6. **`scripts/deploy-all.sh` doesn't cover them.** Its loop is a *subset*
   (`fleet-sentinel … bundle-fetch create-invoice complete-onboarding
   xendit-webhook …`) — it omits `customer-progress-proxy`, `customer-readiness`,
   `rotate-pairing-code`, `validate-bot-token`, `save-onboarding-profile`,
   `genesis-distill`, `agent-chat-relay`. → Either deploy those explicitly or
   extend the loop (and extending it is the durable fix so this can't recur).
7. **The browser preflight cache.** Even after a correct deploy, the founder's
   browser may have cached the failed OPTIONS. → Tell him to hard-refresh, and
   verify yourself with `curl` (no cache) so a cache miss doesn't read as failure.
8. **Symmetric OPTIONS + POST.** Both the preflight and the response must echo
   the origin; verifying only the POST hides a broken preflight. → curl the
   `OPTIONS` explicitly.
9. **Fail-closed not fail-open.** The fallback must return the canonical prod
   origin for unknown origins (browser-rejected), never `*`. → Verify a junk
   origin gets the fallback, not an echo.
10. **`velorah-nu` is a second canonical apex.** Both `weuseai-agent.vercel.app`
    and `velorah-nu.vercel.app` auto-track main (CLAUDE.md "Production deploy").
    A fix that only handles preview origins still leaves `velorah-nu` broken. →
    Allowlist it explicitly and verify it too.

**The right move was to handle all ten in one pass:** deploy from repo root with
the API bundler, config-driven JWT, the *whole funnel* not just `create-invoice`,
then verify with `curl -i -X OPTIONS` against (a) a preview origin, (b)
`velorah-nu`, (c) a junk origin — and only then tell the founder "done, hard-refresh
and retry checkout." One round trip, zero bounce-backs.

### Reusable pre-flight anticipation checklist

Before any deploy/migration/irreversible-ish action, ask:

- **CWD & paths** — am I in `…/velorah`? Are paths absolute? (Bash CWD resets
  between calls.)
- **Daemons & auth** — Docker up if needed? `supabase`/`gh`/`vercel` logged in?
- **Config side-effects** — does this command read a config (`config.toml`,
  `verify_jwt`) that could flip a security/auth flag?
- **Blast radius** — what else imports/depends on what I'm touching? (`cors.ts` →
  ~38 functions; a shared `lib/` change → many callers — see CLAUDE.md and the
  `erp-ripple-check` mindset.) Does my deploy script actually cover all of them?
- **The next step in the user's journey** — after *this* succeeds, what does the
  customer/founder hit immediately after? Is *that* also stale/broken? Fix the
  whole funnel.
- **Caches & propagation** — browser preflight cache, Vercel cold start, CDN. Will
  a stale cache make a correct fix look broken?
- **Verification command** — what exact command (curl/test/typecheck) proves this
  worked, independent of any cache?
- **Rollback** — if it's wrong, how do I revert? (Re-deploy prior; `git revert`.)

---

## 3. Minimize founder manual work + one-shot (verify before claiming)

**Bundle the full fix, verify it, report DONE with evidence.** A half-fix that
bounces back costs the founder a second context-switch and erodes trust in your
"done." The payment fix wasn't done when `cors.ts` was edited — it was done when
the right functions were redeployed *and* a `curl` preflight from the real preview
origin returned `200` with the origin echoed, the junk origin got the fail-closed
fallback, and a real TEST-mode checkout returned an Xendit invoice URL.

**Verify-before-claiming is non-negotiable.** Run the command, read the output,
*then* assert. CLAUDE.md's own "Verification checklist before claiming task done"
encodes this; the landing gates encode it byte-for-byte. Concretely:

- **Landing:** after *every* `app.jsx`/`index.html` edit, run the mandatory loop —
  ```bash
  cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah" \
    && node scripts/build-landing.mjs \
    && npx playwright test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts
  ```
  The freshness gate (`tests/landing-build.spec.ts`) re-runs a fresh build and
  **diffs `assets/app.js`/`assets/tw.css` byte-for-byte** — forget the rebuild and
  it fails. It also asserts `index.html` has no `babel` / `cdn.tailwindcss.com` /
  `type="text/babel"`, and enforces the **14-substring honesty banlist**
  (`landing-build.spec.ts:64-78`: `Sorted`, `emails`, `GST`, `PR #142`,
  `Auto-publish`, `Calendar update`, `confirmed dalam`, `Live di 6 platform`,
  `overnight`, `trending apa`, `Auto-monitor`, `otomatis ke OLX`, `kalender
  di-sync`, `Otomatis dibaca`, `10×` — use `email` singular, never `emails`).
  The pricing-drift gate pins the `Rp 99rb/bulan` line and every price string.
- **Backend:** `npm run typecheck:all` (or per-package `npx tsc --noEmit`),
  `npm test`, `npm run smoke:service:local`. Iterate locally first (CLAUDE.md
  "Local-first iteration" is LOCKED) — Vercel/Supabase/Fly redeploy is
  *verification*, not iteration.
- **Real-world:** after a deploy, prove it with a no-cache command (`curl`) and,
  for UI, a Playwright browser check — the round5 landing redesign was verified
  with Playwright across 14"/13"/~375px, and the payment fix with an explicit
  `curl -i -X OPTIONS` preflight.

When you do hand off a human-only step, hand off **exactly one bundle**: state
what you already did + verified, the one thing only the founder can do, and the
one command/click to do it. Don't trickle.

---

## 4. The ultracode workflow for any non-trivial feature

For anything beyond a small bug fix, **do not start editing.** First produce a
self-contained, line-cited build prompt; then build against it phase-by-phase with
a gate+verify after each phase. The exemplars are real and on disk — read them
before doing your own:

- `docs/plans/2026-06-17-landing-round5-prompt.md` (round 5)
- `docs/plans/2026-06-16-landing-redesign-round4-prompt.md` (round 4 — its header
  literally reads *"Generated 2026-06-16 via ultracode multi-agent workflow
  (3 architects + synthesis), grounded against branch … HEAD"*)
- `docs/plans/2026-06-16-dashboard-build-prompt.md`, `…-landing-redesign-prompt.md`

### The pattern

1. **Fan out parallel architect agents.** Spawn several subagents in parallel,
   each owning one slice of the change (e.g. one per section: hero, origin,
   integrations; plus one for the backend/CORS slice). **Each architect must read
   the REAL code** and cite `file:line` for every claim. Independent slices →
   parallel; only serialize where there's a true dependency.
2. **Synthesize.** A final synthesis agent merges the architect outputs into ONE
   self-contained prompt saved under `docs/plans/<date>-<name>-prompt.md`. The
   round5 file is the shape to match: state + goal, build mechanics + guardrails,
   component-by-component spec with **verified current line numbers and quoted
   anchor strings** ("if they've drifted, match on the quoted strings"), phased
   build order, test/verification commands, open founder decisions, constraints/
   non-goals, and an absolute-path "files touched" list.
3. **Build phase-by-phase against it.** Each phase ends with rebuild → gates →
   browser/real verification before the next starts. Round5 ordered phases by
   business priority: **Phase D (payment, revenue-blocking) FIRST**, then A+B
   (backgrounds, same region together), then C (tiles) — independent phases so
   one can land while others are in progress.

### Why this works (not ritual)

- **Grounding kills hallucinated line numbers.** Forcing each architect to read
  real code and cite `file:line` + quoted anchors is what let round5 assert exact
  edits like "`index.html:305` replace `opacity: 0.55` with `0.72`" and survive
  drift (match on the quoted string if the number moved). A prompt full of invented
  line numbers produces broken edits and a bounce-back.
- **The saved prompt is a durable reference.** It outlives the session, documents
  *why* each value was chosen (the round5 tuning ladders, the CORS fail-closed
  rationale), and becomes the next round's "what's already shipped" baseline —
  which is exactly how round5's §1 was written from round4's output.
- **Phased build keeps gates green.** A gate after each phase localizes any
  failure to the phase that caused it, instead of debugging a 4-change diff against
  a red freshness/honesty/pricing gate all at once.
- **Parallel fan-out is faster and broader** than one agent serially reasoning
  about every slice — and the slices genuinely are independent here (the four
  round5 requests touched disjoint regions).

For the mechanics of spawning, see the `superpowers:dispatching-parallel-agents`,
`superpowers:writing-plans`, and `superpowers:executing-plans` skills — but the
*grounding + synthesis + phased-gate* discipline above is the load-bearing part.

---

## 5. Memory + branch hygiene

**Keep the project memory note current.** This session's memory index
(`MEMORY.md`) already tracks the landing redesign and the payment CORS fix
("Landing redesign pending" → landing built on PR #271; payment CORS fix on
PR #272 needs a founder edge-function redeploy). When you finish a unit of work,
update the relevant note so the *next* session starts from truth, not a stale
"pending." A memory note that says "needs founder redeploy" after you've already
run the redeploy yourself is a lie to your future self — fix it.

**One concern per branch/PR so each is independently deployable.** This is the
hard lesson from the payment outage: landing and backend ship through *different*
pipelines. Landing/admin/videos deploy **automatically on push to main** (Vercel,
static). Supabase Edge Functions deploy **globally and manually**, once per
project ref — **never** on a Vercel preview push (`scripts/deploy-all.sh` exists
precisely because the backend is the part "an autonomous session CANNOT reach"
without secrets; here it can, because the CLI is logged in). Because the pipelines
differ:

- **Landing changes** go on the landing branch (this session: `landing/phase-1-domain-china`,
  PR #271). They're inert until merged-and-Vercel-builds.
- **Backend fixes** (e.g. `supabase/functions/_shared/cors.ts`) go on their **own**
  branch/PR (PR #272). They're inert until *someone runs `supabase functions
  deploy`* — editing the file changes nothing live. **Mixing them in one PR is how
  you ship a landing change while the CORS fix sits un-deployed**, which is the
  exact stale-deploy class that caused the outage. Separate PRs let the backend
  fix deploy the moment it's ready, independent of the landing review.

Branch discipline (from CLAUDE.md "Working conventions" + the prompts): work on a
feature branch, **never commit/push unless the founder asks**, tag commit subjects
(`[landing]`, `[supabase]`, `[payment]`, …), English imperative ≤72 chars, and end
commit messages with the required `Co-Authored-By` trailer.

---

## TL;DR

1. The tooling is on this Mac and logged in — **run the deploy/verify yourself.**
   Hand the founder only secrets-not-on-machine + irreversible business calls.
2. **Ultra-think:** before acting, list what breaks AND what comes next; fix the
   whole funnel in one pass (the "one-line redeploy" had ~10 hidden failure modes).
3. **One-shot with evidence:** bundle the full fix, verify with a no-cache command,
   report DONE with proof — never a half-fix that bounces.
4. **Ultracode for features:** parallel grounded architects → synthesized
   line-cited prompt under `docs/plans/` → phased build, gate after each phase.
5. **Hygiene:** keep `MEMORY.md` honest; landing on the landing PR, backend
   (`cors.ts`, functions) on its own PR — different deploy pipelines, independently
   deployable.
