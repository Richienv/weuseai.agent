# Genesis Onboarding — "Jangan isi form. Forward hidup kamu."

**Status:** Phase 1 (the distill brain) prototyped + tested. UI wiring + top-tier
genesis hand-off are specced here, not yet built.
**Date:** 2026-06-13
**Author:** Fable (founder-directed brainstorm → spec)

---

## The idea

Every competitor is a blank box you have to learn. Our promise is the
opposite — *"dia yang menyesuaikan ke cara kerja kamu."* Genesis Onboarding
makes that literally true in the first two minutes:

Instead of typing a 600-character expectations blurb and picking a persona
from a dropdown, the customer **forwards a few things they already have** —
an old proposal they wrote, a couple of WhatsApp business chats, their IG
caption style, a client list — and the agent *reverse-engineers* them: their
role, their daily work, their deliverables, their tone. Then it shows back:

> *"Ini yang aku tangkap soal kamu — betul?"*

…with an honest summary the customer edits or confirms. Only after they
confirm does anything provision.

The wow moment — *"how does it already know how I write?"* — is the
screenshot that travels. And it's honest: it's inference over what they
handed us, shown back transparently before a single byte ships.

## Why it fits (and why it's safe)

- **Builds on existing rails.** The distill step produces exactly the two
  things `complete-onboarding` already takes: an `agent_slug` and an
  `expectations_text`. For top tiers it also produces the `GenesisProfile`
  that the existing `persona-genesis` function already consumes. No new
  provisioning path, no schema change.
- **Honest by construction.** The distill handler has **no side effects** —
  no DB writes, no VPS calls, no spend beyond one extraction call. It returns
  a *draft* for the customer to confirm. Nothing is persisted until the
  normal `complete-onboarding` POST, exactly as today.
- **Honesty lock respected.** The extraction prompt carries `BRAND_RULES`
  (the same block `persona-genesis` uses) including *"jangan mengarang
  kemampuan."* The expectations paragraph passes the same
  `sanitizeExpectations` scaffold-injection gate as the typed path.
- **Works for every tier.** Unlike `persona-genesis` (gated to
  `done-for-you` + `enterprise`), distill only *recommends* a curated persona
  from `personasForTier(tier)` — so the cheapest tiers get the "it already
  gets me" moment too, just mapped onto a curated persona instead of a
  bespoke build.

## Architecture

```
                    ┌─────────────────────── Phase 1 (built) ────────────────┐
 customer forwards  │                                                         │
 samples ──────────▶│  genesis-distill  (pure handler, 1 LLM call, X-CID)     │
 (paste / Telegram) │    • extract GenesisProfile from raw samples            │
                    │    • recommend a persona ∈ personasForTier(tier)        │
                    │    • compose + sanitize an expectations paragraph       │
                    │    • write an honest "here's what I learned" summary    │
                    │  RETURNS a draft — NO side effects                       │
                    └───────────────┬─────────────────────────────────────────┘
                                    │  customer confirms / edits the draft
                                    ▼
       ┌────────────────────────────────────────────────────────────────┐
       │  existing complete-onboarding  (agent_slug + expectations_text) │  ← all tiers
       │  existing persona-genesis      (GenesisProfile)                 │  ← done-for-you / enterprise
       └────────────────────────────────────────────────────────────────┘
```

### Phase 1 — the distill brain (this PR)

`supabase/functions/genesis-distill/` + `_shared/genesis-distill-handler.ts`.

**Contract** (`POST`, X-CID-bound like `persona-genesis`):

```
POST /functions/v1/genesis-distill
headers: { x-cid: <customer_id> }
body: { customer_id: string, tier: string, samples: string }
```

`samples` is the raw forwarded/pasted text (40–8000 chars). The handler:

1. Validates method / JSON / `x-cid === customer_id` / `samples` length /
   `tier` resolves via `resolveTier`.
2. Calls the injected `distill` LLM once (JSON mode) with `BRAND_RULES` +
   the allowed persona list (name + blurb) for the tier.
3. Parses strictly. Malformed JSON → `502 distill_failed` with an honest
   Bahasa retry message.
4. Validates `recommended_persona ∈ personasForTier(tier)`; falls back to
   `the-pro` (the index-0 invariant) when missing/invalid. `bare` tier →
   `personaFree`, recommendation `null`.
5. Sanitizes `expectations_paragraph` via `sanitizeExpectations`. On
   rejection, composes a safe paragraph from the extracted profile fields
   and re-sanitizes; final fallback is a minimal safe default.
5b. **Writing voice (2026-06-13).** Captures a short `voice_note` descriptor
   of the customer's tone (observed in the samples), itself run through the
   sanitizer, and folds it into the expectations paragraph *only when the
   whole thing fits ≤600* — so the SOUL's `{user_expectations_verbatim}`
   makes the agent mirror how the customer actually writes. The customer
   sees + can edit it in the pre-filled textarea (transparent, not magic).
6. Returns the draft:

```jsonc
{
  "ok": true,
  "recommended_persona": "social-conductor" | null,
  "persona_name": "Social Conductor" | null,
  "expectations_paragraph": "…sanitized, ≤600 chars…",
  "profile": { role, daily_tasks, outputs, tools, pain_points },
  "summary_bahasa": "Ini yang aku tangkap soal kamu: …",
  "confirmation_prompt": "Betul begini, atau mau kamu sesuaikan?"
}
```

The handler is pure and dependency-injected (`distill: GenesisDistillLlm`),
so it is fully unit-tested against a canned LLM with zero network. The
production entry (`genesis-distill/index.ts`) wires the same `deepseek-chat`
JSON-mode adapter `persona-genesis` uses — a new *location* for the existing
`DEEPSEEK_API_KEY` secret, not a new credential or new spend category (one
cheap extraction call per onboarding, consistent with the existing
"$3–5 onboarding credits per customer").

### Phase 2 — onboarding UI hand-off (specced, not built)

`onboarding.html` Step 4 gains a tab: **"Forward aja, biar aku yang nyusun."**
The customer pastes samples → calls `genesis-distill` → the page shows the
`summary_bahasa` confirmation card with the recommended persona pre-selected
and the expectations textarea pre-filled (both editable). On confirm, it
submits to `complete-onboarding` exactly as the typed path does today. The
typed/dropdown path stays as the fallback for people who prefer it.

### Phase 3 — Telegram-native forwarding (3a BUILT, 3b next)

The customer's own bot points at `pair-customer-bot-webhook?cid=<id>` from
pairing until `complete-onboarding` deletes the webhook — exactly the Genesis
window, with the `customer_id` already in the URL and the bot token already
decrypted for replies.

**Phase 3a (built):** `pair-customer-bot-webhook-handler` gains an additive
branch — a paired-but-not-onboarded customer who forwards substantial
non-command text (≥40 chars) gets it distilled (server-to-server call to
`genesis-distill`, tier resolved from the subscription), the draft persisted
to `customers.genesis_draft` (new nullable column, migration
`20260613000000`), and an in-character *"ini yang aku tangkap"* reply. It is
gated, cooldown-limited (30s per customer), and touches nothing in pairing /
SOUL / provisioning. The `distillSamples` dep is optional, so absent wiring
the handler is byte-for-byte the old pairing-only behavior.

**Phase 3b (next):** `onboarding.html` reads `customers.genesis_draft` on
load and pre-fills Step 4 (expectations + persona + summary card) — so a
customer who forwarded samples in Telegram finishes with one confirm on the
web. Voice/photo samples ride the same path once that middleware lands.

## Honesty + security notes

- **No fabricated capabilities.** `BRAND_RULES` is injected verbatim; the
  distilled summary describes the *customer*, never promises agent features
  we lack (email/calendar/auto-post). The same constraint the `persona-genesis`
  pipeline already enforces.
- **Scaffold-injection defense.** The expectations paragraph is the only
  free text that reaches SOUL.md, and it passes the identical
  `sanitizeExpectations` gate (rejects `</SOUL>`, `# Hard limits`, control
  chars; 1–600 chars).
- **Tenant binding.** `x-cid === customer_id` (the PR #93 convention),
  re-checked in the handler.
- **No persistence in distill.** The draft is returned, not written. The
  customer's confirmation through `complete-onboarding` is the only write —
  so a distill call can never half-provision or mutate a customer.

## Test coverage (Phase 1)

`tests/genesis-distill-handler.spec.ts` — method/JSON/X-CID guards, samples
length bounds, tier resolution, happy path (profile + recommended persona +
sanitized expectations + summary), persona-validation fallback to `the-pro`,
`bare` persona-free path, injection-laden expectations rejected then safely
recomposed, malformed-LLM → honest 502.
