# Mission 2 build spec — Persona Genesis + Pagi Briefing

**Date:** 2026-06-10
**Author:** Mission 2 session (Fable 5)
**Status:** Built + locally verified (mock-LLM chain harness). Real-VPS
verification and deploys need founder hands — this container has no
Supabase/Fly/Vultr secrets (see §Deploy + honesty notes).

---

## Why this composition

The Mission 2 delta audit (appendix in the round-1 audit doc) found that the
**product's #1 sold promise — "briefing pagi tiap hari jam 7 WIB" — never
fires as sold**: the only scheduled job on a customer VPS is a generic
5-headline news cron, the morning-briefing playbook is dead code, and the
on-demand briefing skill serves *mock calendar fixtures as if real*. So the
recommended composition is exactly right, and one half of it is not a
feature but a repair:

- **Pagi Briefing** repairs the broken core promise with the mechanism that
  already works in production (`hermes cron add … --deliver telegram` — the
  daily-news cron proves the rail), pointed at a prompt that produces a
  *personalized, honest* briefing.
- **Persona Genesis** is the differentiator: the customer describes their
  work in Bahasa over Telegram, and the system generates a complete bespoke
  persona — SOUL.md + 8 skills + 6 templates + 1 playbook — validated, and
  deployed through the *same* bundle pipeline and gates as the 10 curated
  personas. The morning briefing then speaks in that persona, about that
  customer's actual work.

Together they make the demo moment: *the agent texts the founder's phone
first, in a persona that didn't exist an hour earlier, about the work the
customer described.*

## Architecture

```
Customer (Telegram, Bahasa)
   │  /bikin-persona → interview (5 questions, SKILL.md-driven)
   ▼
VPS agent POSTs profile JSON ──► supabase/functions/persona-genesis
   { customer_id, profile }        (X-CID bind + tier gate + rate gate)
                                      │
                       ┌──────────────┼────────────────────┐
                       ▼              ▼                    ▼
                generator (3      validator           packager
                DeepSeek calls:   structure ∘         minimal USTAR
                plan+SOUL →       manifest-validator  + gzip (pure TS)
                skills →          ∘ Bahasa quality
                templates+        ∘ banned words
                playbook)         ∘ template refs
                       │   fail → founder DM + honest customer msg
                       ▼
            Storage bundles/custom-<cid>/1.0.0.tar.gz
            custom_personas row (status=active)
            customers.soul_md_text = rendered custom SOUL
                       │
                       ▼
            admin-customer-vps-refresh (existing rescue rail):
            pushes SOUL.md + restarts hermes-gateway
                       │ ExecStartPre = weuseai-bundle-pull
                       ▼
            bundle-pull v2: after tier slugs, best-effort pull of
            `custom-<cid>` (silent skip when none exists)
            bundle-fetch: custom branch — slug MUST equal
            `custom-<customer_id>` (tenant isolation) + tier feature gate
```

**Pagi Briefing:** `setup-script.ts` replaces the daily-news cron with a
07:00 WIB briefing prompt + adds an 18:00 WIB end-of-day prompt. The prompts
are static but *personalized by construction at runtime*: they instruct the
agent to compose from its SOUL.md (which carries the customer's name,
expectations, and — post-Genesis — their bespoke persona) and from
conversation memory. They explicitly forbid claiming calendar/email data we
don't have (the audit's U4 honesty fix).

## The gates a generated persona must pass (same as curated)

1. `validateManifest` — schema + cross-field invariants. Custom slugs are
   allowed ONLY via an explicit `allowAgentSlugs` option; the global
   `KNOWN_PERSONA_SLUGS` gate for curated personas is untouched.
2. Bahasa-quality gate: "kamu" register present, no `Anda` as address, all
   CLAUDE.md banned words rejected, zero exclamation marks in body copy,
   minimum-substance lengths per artifact.
3. Template-reference integrity: every `templates_used` resolves; every
   manifest template has a real file in the tarball.
4. bundle-fetch tenant isolation: `custom-<cid>` is fetchable ONLY by that
   exact customer (and only when their tier grants the feature).
5. Failed generations: `custom_personas.status='failed'` + founder Telegram
   DM + an honest Bahasa message to the customer. Nothing ships silently.

## Tier placement (recommendation — founder decides; nothing priced here)

Gate as shipped: `done-for-you` + `enterprise`. Rationale: done-for-you is
the "Siap Pakai / fine-tuned for you" promise — Genesis IS that promise
delivered; enterprise already sells custom builds. Recommended upsell copy
for `library-full` later ("persona khusus dibuat AI untuk kamu — upgrade ke
Siap Pakai"). The gate is one set in `persona-genesis-handler.ts`
(`GENESIS_TIERS`) — moving it is a one-line founder call.

## Generation LLM + COGS

DeepSeek (`deepseek-chat`), 3 calls per generation, JSON-mode outputs.
Estimated tokens per generation: ~3k in / ~12k out ≈ **$0.015 per
generation** at DeepSeek list prices — negligible against a Rp 1.299jt
setup fee. No stronger model is needed for v1: the validator enforces the
floor, regeneration is cheap, and failures alert the founder. If quality in
production disappoints, the comparison to escalate is Claude Haiku ≈ 10×
COGS (~$0.15/gen) — still fine, but that switch is a founder ping per the
brief.

## Honesty + limits (say-it-plainly section)

- **Verified end-to-end with a mock LLM + in-memory storage + the real
  validator/packager/fetch-gate chain** (Phase F harness extension,
  `tests/e2e/persona-genesis-chain.spec.ts`). The bash of bundle-pull v2 is
  syntax-checked and content-asserted in tests.
- **NOT yet verified on a real VPS** — this session has no Vultr/Fly/
  Supabase credentials. The runbook's verification section is the exact
  founder procedure (provision a throwaway done-for-you VPS, run the
  interview, watch the pull). No simulated results are claimed as real.
- Existing fleet VPSes have the v1 pull script; they get custom-pull
  support on next re-provision or via the documented SSH rollout note. New
  provisions have it immediately.
- A post-Genesis re-onboard (customer edits expectations in the web form)
  re-renders a CURATED scaffold and would overwrite the custom SOUL —
  customers regenerate via `/bikin-persona`. v2 should branch re-onboarding
  on `custom_personas.status='active'`.
- The interview happens on the VPS agent (LLM-driven); the profile it POSTs
  is whatever the agent assembled — the handler validates shape, never
  trusts content for anything but generation input.

## Success criteria

1. Full local chain green: interview payload → handler → valid tarball in
   storage → bundle-fetch signs it for the owner only → pull script
   installs → every generated SKILL.md passes the same validator. ✅ (harness)
2. Generated persona quality floor enforced by validator tests (banned
   words, register, structure). ✅
3. Pagi Briefing cron ships in setup-script with honest prompt; 18:00
   end-of-day cron added; liveness copy stays accurate. ✅
4. Zero regressions: full suite + typecheck green; curated-persona gates
   (KNOWN_PERSONA_SLUGS, tier enforcement, YAML drift gate) untouched. ✅
5. Real-VPS demo: founder-run per runbook (this session cannot — no creds). ☐
