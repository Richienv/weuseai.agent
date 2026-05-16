# Persona System Audit — 2026-05-16

**Scope:** Read-only audit of the 10-persona library. No code changed. Upstream Hermes untouched.
**Worktree:** `.worktrees/waitpage-fix` @ branch `chore/pre-bug12-retest-snapshot`.
**Auditor question:** Marketing promises a 10-persona library (Starter 3 / Pro 8 / Studio 10). Founder's fear: a customer pays expecting persona X but the system can only deliver "The Pro." Is that fear real?

**Verdict up front:** Yes, the fear is real. **The customer never picks a persona, and the persona artifacts on disk are never published to Storage. Every customer — regardless of tier — gets "The Pro" as their actual running agent.** The other 9 personas exist as source files and slash-command shells but are unreachable as a *primary* agent. Detail below.

---

## 1. The 10-persona inventory

Single source of truth for tier→persona mapping: `supabase/functions/_shared/tier-personas.ts`.
Slug list pinned in `supabase/functions/_shared/manifest-validator.ts:103` (`KNOWN_PERSONA_SLUGS`) and `supabase/functions/_shared/soul-md-template.ts:825` (`PERSONA_SLUGS`).

All 10 `agent-packs/<slug>/` directories carry `SKILL.md` + `SOUL.md` + `manifest.json` on disk. Persona v2 renames (`macro-strategist` → `project-conductor`, "Web Master" → "Web Creator") are applied at the slug level; note "Web Creator" still uses **folder/slug `web-app-builder`** (slug retained, only the display name changed — see `manifest-validator.ts:109`).

| # | Slug | Display name | Tiers | Artifacts on disk | SOUL scaffold in `soul-md-template.ts` |
|---|------|--------------|-------|-------------------|----------------------------------------|
| 1 | `the-pro` | The Pro | starter, pro, studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `THE_PRO_SCAFFOLD` ✓ |
| 2 | `doc-expert` | Doc Expert | starter, pro, studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `DOC_EXPERT_SCAFFOLD` ✓ |
| 3 | `slide-master` | Slide Master | starter, pro, studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `SLIDE_MASTER_SCAFFOLD` ✓ |
| 4 | `deep-researcher` | Deep Researcher | pro, studio | SKILL.md, SOUL.md, manifest.json (no skills/, no templates/) | `DEEP_RESEARCHER_SCAFFOLD` ✓ |
| 5 | `trade-pro` | Trade Pro | pro, studio | SKILL.md, SOUL.md, manifest.json, skills/ (no templates/) | `TRADE_PRO_SCAFFOLD` ✓ |
| 6 | `project-conductor` | Project Conductor (was Macro Strategist) | pro, studio | SKILL.md, SOUL.md, manifest.json, skills/ (no templates/) | `PROJECT_CONDUCTOR_SCAFFOLD` ✓ |
| 7 | `video-producer` | Video Producer | pro, studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `VIDEO_PRODUCER_SCAFFOLD` ✓ |
| 8 | `social-conductor` | Social Conductor | pro, studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `SOCIAL_CONDUCTOR_SCAFFOLD` ✓ |
| 9 | `web-app-builder` | Web Creator (was Web Master) | studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `WEB_MASTER_SCAFFOLD` ✓ |
| 10 | `business-agent` | Business Director | studio | SKILL.md, SOUL.md, manifest.json, skills/, templates/ | `BUSINESS_DIRECTOR_SCAFFOLD` ✓ |

Tier counts: Starter = 3, Pro = 8, Studio = 10 — matches `TIER_PERSONAS` and the marketing promise. Each tier is a strict superset of the lower one; `the-pro` is at index 0 in every list (first-of-list / `DEFAULT_PERSONA` invariant).

**Artifact completeness:** All 10 have the three core files. `deep-researcher`, `trade-pro`, `project-conductor` lack a `templates/` directory and the first two lack populated `skills/` content directories beyond the manifest — those manifests advertise skills whose `skills/<id>/SKILL.md` may not exist on disk (worth a follow-up file-by-file check, but not the headline gap).

---

## 2. Selection mechanism — THE CRITICAL FINDING

**The customer never selects a persona. There is no selection UI and no selection field anywhere in the paid flow. Every customer gets "The Pro" as their running agent.**

Traced end-to-end:

- **`checkout.html`** — no persona picker. Sells a tier, nothing else.
- **`onboarding.html`** — no persona picker. The form collects WhatsApp number + free-text "expectations" + Telegram bot token. `grep -i persona onboarding.html` → 0 hits.
- **`xendit-webhook-handler.ts` / provisioning routes** — never set `agentSlug`. `grep agentSlug` across the webhook handler and `services/provisioning/src/routes/` → 0 hits.
- **`customer-flow.ts:486`** — `const defaultSlug = opts.agentSlug ?? DEFAULT_PERSONA`. `opts.agentSlug` is *optional* (`SpinUpOpts.agentSlug?`, line 79) and **no production caller ever supplies it**. So `defaultSlug` is always `'the-pro'`.
- **`customers` DB table** — has `tier` but **no `agent_slug` / `chosen_persona` column** (`supabase/migrations/20260430000000_initial_schema.sql`). There is nowhere to even store a customer's choice. (`customer_persona_audit` records what was *generated*, not what was *chosen*.)
- **`setup-script.ts:166-236, 702-703`** — the running agent's `SOUL.md` is the **hard-coded `SOUL_MD` constant = The Pro**, written verbatim at first boot. `agentSlug` does NOT change this file. The `agentSlug` value only affects `WEUSEAI_AGENT_SLUG` env + a log line.
- **`complete-onboarding-handler.ts:160`** — the post-onboarding `SOUL.md` overwrite calls `renderSoulMd({ customerName, expectationsClean })` **with no `personaSlug` argument**. `renderSoulMd` (`soul-md-template.ts:982`) defaults `personaSlug` to `'the-pro'`. So the post-onboarding rewrite is also The Pro.

`renderSoulMd` *does* support a `personaSlug` parameter and has all 10 scaffolds wired in `PERSONAS` — the renderer is capable. **It is simply never called with anything but the default.** The capability exists; the plumbing to feed it a customer choice does not exist (no UI → no DB column → no handler argument).

**Consequence:** The 9 non-default personas are reachable ONLY as Telegram slash commands (`/doc-expert`, `/slide-master`, etc.) IF their bundle ever lands in Hermes' skills dir — and that bundle is also broken (see §3). A customer who paid for "Studio, 10 personas" gets a bot whose baseline voice, greeting, daily-news cron, and bare-message behavior are 100% The Pro.

---

## 3. bundle-pull persona count

**The "8/8 personas" Phase F assertion is about slash-command shells, not real personas — and the underlying bundle pull cannot succeed today because no bundles are published to Storage.**

- **The "8" is real, not hardcoded.** `customer-flow.ts:485-491` derives `agentSlugs` from `personasForTier(opts.tier)`, so a Pro customer's `WEUSEAI_AGENT_SLUGS` env is genuinely the 8-slug CSV. `bundle-pull-script.ts:116-117` splits that CSV and loops — it iterates the true tier count. Stage 6 of the harness asserting "8/8" is measuring a real number.
- **But what bundle-pull installs is per-persona `SKILL.md` shells, NOT personas.** `bundle-pull-script.ts:222-229` copies `<slug>/SKILL.md` into `~/.hermes/skills/<slug>/SKILL.md` so Hermes auto-exposes `/<slug>` as a slash command. It **never touches `SOUL.md`**. Installing 8 SKILL.md shells does not give the customer 8 personas — it gives them 1 persona (The Pro, from the hard-coded SOUL.md) plus 8 slash commands that *re-voice* the agent on demand.
- **The bundle pull cannot actually succeed in production.** `bundle-fetch-handler.ts` signs a Storage URL at `bundles/<slug>/<version>.tar.gz`. **Nothing publishes those tarballs.** `bundle-publish-handler.ts` exists but there is no CI step, no script, and no provisioning step that calls it (`grep bundle-publish .github/workflows/` → 0 hits; `build-bootstrap-bundle.ts` only builds the *bootstrap* bundle, not the per-persona ones). So at every Hermes boot, `bundle-fetch` 404s on every slug, `pull_bundle` returns 1, and the script exits 0 — graceful degradation to the bootstrap bundle. The bootstrap bundle (`build-bootstrap-bundle.ts:45`) hard-codes `agent-packs/the-pro/SOUL.md` and ships only `extend-capabilities`.
- **Net:** Even the slash-command fallback path is non-functional in production. A Pro customer who types `/doc-expert` gets "Unknown command" unless the doc-expert bundle was pulled — and it never is, because it was never published. **The only persona content that reaches a customer VPS today is The Pro, via the inline bootstrap bundle + the hard-coded `SOUL_MD` in setup-script.**

---

## 4. Greeting + skill differentiation

**Greeting content — the 10 SOUL.md scaffolds ARE differentiated, but the differentiation never reaches the customer.**

- Each of the 10 `*_SCAFFOLD` constants in `soul-md-template.ts` is distinct prose with its own "When my customer first messages me" section (Trade Pro opens with a not-financial-advice disclaimer, Business Director describes 5 department dispatch, etc.). The source content is genuinely per-persona.
- BUT the proactive auto-greet (`proactive-greeting.ts`) uses **the customer's stored `soul_md_text` as the system prompt** (`complete-onboarding-handler.ts` passes `customer.soul_md_text`). Since `soul_md_text` is always rendered from `the-pro` (§2), the LLM greeting is always in The Pro's voice. The template fallback `renderGreetingTemplate` (`proactive-greeting.ts:158`) is a single generic Indonesian string with no persona awareness at all.
- So: differentiated greetings exist *in source* for all 10, but every real customer — Starter, Pro, or Studio — receives The Pro's greeting (or the one generic template).

**Per-persona skills — partially real, partially stubbed.**

- The 10 `SKILL.md` *shells* (`agent-packs/<slug>/SKILL.md`) ARE genuinely differentiated — spot-checked the-pro / doc-expert / slide-master / deep-researcher / trade-pro and each has distinct "Kapan dipakai" + "Yang dilakukan" content. These are not duplicates.
- The per-persona `manifest.json` files differ in size (the-pro 1.9KB → web-app-builder 9.2KB) and advertise different skill sets, so the manifests are real.
- However `deep-researcher` and `trade-pro` lack populated `skills/` content dirs and `templates/` dirs that their manifests imply. Those manifests may reference `skills/<id>/SKILL.md` paths that do not exist on disk — `bundle-pull-script.ts:204` already logs `⚠ manifest entry exists but src missing` for exactly this case. This is a secondary integrity gap; the primary gap (§2/§3) makes it moot for now since no bundle is pulled anyway.

---

## 5. BROKEN / WORKING / UNVERIFIED

### BROKEN (fraud-tier — customer pays for X, cannot get X)
1. **No persona selection anywhere.** No UI in checkout/onboarding, no `agent_slug` column on `customers`, no handler argument. Customer choice is structurally impossible. (`checkout.html`, `onboarding.html`, `initial_schema.sql`)
2. **Running `SOUL.md` is hard-coded to The Pro.** `setup-script.ts:702` writes the `SOUL_MD` constant; `complete-onboarding-handler.ts:160` calls `renderSoulMd` without `personaSlug`. Every customer's actual agent is The Pro regardless of tier.
3. **Per-persona bundles are never published to Storage.** `bundle-publish-handler.ts` has no caller; no CI, no script, no provisioning step uploads `bundles/<slug>/<version>.tar.gz`. `bundle-fetch` 404s on every non-bootstrap pull. The 8/9 non-default slash commands therefore never install.

### WORKING
- Tier→persona mapping math (`tier-personas.ts`): correct counts, superset invariant, default-at-index-0 invariant.
- The Pro persona end-to-end: bootstrap bundle hard-codes it, setup-script hard-codes it, `renderSoulMd` defaults to it — it is genuinely validated (Phase F).
- Tier-persona security enforcement (`bundle-fetch-handler.ts:152`): a Starter customer is correctly 403'd from fetching a Studio bundle. (Ironically the only persona logic that fully works guards a path nothing uses.)
- The 10 source artifacts (`SKILL.md` shells, `SOUL.md` scaffolds, manifests) are authored and differentiated.
- `bundle-pull-script.ts` CSV loop logic and `renderSoulMd` persona routing are both *capable* — they just have no live input.

### UNVERIFIED
- Whether `deep-researcher` / `trade-pro` (and possibly others) have all the `skills/<id>/SKILL.md` files their manifests reference. Needs a per-manifest file-existence cross-check.
- Whether the slash-command path (`/doc-expert` etc.) actually re-voices the agent correctly even IF a bundle were installed — only The Pro was exercised in Phase F.
- The persona v2 rename: confirmed at slug/display level, but `WEB_MASTER_SCAFFOLD` constant name and any "Web Master"/"Macro Strategist" prose inside scaffolds were not audited for stale display strings.

---

## 6. Recommended fixes (our-side only — no Hermes patching)

Scoped to close the §5 BROKEN items. Ordered by what unblocks the marketing promise fastest.

**Fix A — Decide and implement the persona-delivery model.** Two viable shapes; founder picks one:
   - *A1 (single-persona-per-customer):* customer picks ONE persona at checkout/onboarding; that slug drives BOTH the `SOUL.md` baseline and the bundle. Requires: persona picker UI in `onboarding.html` (or `checkout.html`), an `agent_slug` column on `customers` (new migration), `complete-onboarding-handler.ts` passing `personaSlug` to `renderSoulMd`, and `customer-flow.ts` passing `opts.agentSlug` through. This matches the current `agentSlug` plumbing's stated intent (`setup-script.ts:46-53` already documents it).
   - *A2 (multi-persona, slash-command):* keep The Pro as baseline, deliver the other tier personas as working `/slug` commands. Requires Fix B below to be real, plus making `setup-script.ts` install all tier `SOUL.md`/`SKILL.md` shells (not just The Pro).
   - The marketing copy ("library of 10, Pro gets 8") implies A2. The code's `WEUSEAI_AGENT_SLUGS` CSV + bundle-pull loop are already built for A2.

**Fix B — Publish the per-persona bundles to Storage.** Add a script (`scripts/build-persona-bundles.ts`) + a CI step (or a one-time provisioning bootstrap) that tars each `agent-packs/<slug>/` to `bundles/<slug>/1.0.0.tar.gz` and uploads via `bundle-publish-handler.ts`. Without this, `bundle-fetch` 404s forever and `bundle-pull` is a no-op. This is the single highest-leverage fix — it makes the existing (working) pull loop actually do something.

**Fix C — Wire `SOUL.md` per persona in the bundle path.** `bundle-pull-script.ts` currently installs only `SKILL.md`. If A2 is chosen, decide whether `/slug` commands re-voice via SKILL.md alone (already the case — the shells say "Aktifkan voice: …") or whether per-persona `SOUL.md` files need to land too. If A1, route the chosen persona's `SOUL.md` through `renderSoulMd(personaSlug)` and the setup-script's hard-coded `SOUL_MD`.

**Fix D — Per-persona artifact integrity gate.** Add a test that, for each `agent-packs/<slug>/manifest.json`, asserts every advertised `skills[].id` has a real `skills/<id>/SKILL.md` on disk. Catches the `deep-researcher`/`trade-pro` stub gap before it ships.

**Fix E — Greeting differentiation.** Once Fix A lands, `proactive-greeting.ts` already uses `soul_md_text` as system prompt, so a correctly-rendered per-persona SOUL.md automatically fixes the greeting. No greeting-code change needed — it is downstream of Fix A. Optionally make `renderGreetingTemplate` persona-aware as a fallback nicety.

**Do NOT ship the 10-persona marketing claim as "live" until at minimum Fix A + Fix B are done.** Today the honest claim is "1 persona (The Pro), validated." The founder's exact fear — paid-for persona X, delivered persona "The Pro" — is the current production reality, not a hypothetical.
