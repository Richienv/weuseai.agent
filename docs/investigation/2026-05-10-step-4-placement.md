# Investigation — Step 4 placement (after vs. before pairing)

> Track 6 of post-pair UX polish (2026-05-10). **No code change.** This
> doc captures trade-offs so a future cascade can decide.

## Today's order

```
Step 1 — Konfirmasi data        (name, email, WhatsApp)
Step 2 — Validate bot token     (paste BotFather token, deploy webhook)
Step 3 — Pair via /pair <code>  (poll until customer.telegram_chat_id set)
Step 4 — Cara kamu pakai agent  (free-text expectations → SOUL.md)
        → submit triggers complete-onboarding
                            (mint LLM key → spinUp → refreshEnv → greet)
```

So today, SOUL.md generation is BLOCKED on pairing completion. The VPS
provision starts at xendit-webhook (post-payment, before onboarding even
opens), but it boots WITHOUT a SOUL.md — the file is empty until step 8a
(refreshEnv) plumbs it in once step 4 is submitted.

## Founder feedback that prompted this

> "Step 4 (describe agent) awkwardly AFTER pairing — investigate if it
> should move before or be reframed."

The friction symptom: customer pairs in step 3, sees the canned reply
(removed in Track 3), gets bounced back to onboarding to type more
words about the agent's persona. Felt like an out-of-flow second ask.

## Option A — keep as today (status quo)

**Pros**
- Pairing is the highest-friction step (BotFather download, copy token,
  paste, /start, /pair). Putting it BEFORE the open-ended writing task
  means a customer who bails at the writing prompt has at least already
  completed the irreversible deploy work.
- The customer-bot pairing window (10 min before code rotates) needs to
  be USED before it expires. If we put step 4 first, a slow-typing
  customer might watch the code expire mid-thought.
- SOUL.md gets meaningful input — the customer has just finished a
  technical-feeling task and is now in a "describe the assistant I want"
  headspace. Putting it first risks rushed answers.

**Cons**
- "Yet another step" surprise after pairing succeeds.
- SOUL.md doesn't reach the VPS until step 4 submits, so the agent boots
  with empty persona and then restarts ~30s later. Wastes one Hermes
  cold-start cycle per customer.
- Customer's mental model: "I paid → I paired → I'm done" doesn't match
  reality.

## Option B — move step 4 BEFORE step 2/3

**Pros**
- SOUL.md generates while VPS provisions in parallel. Total wall-clock
  ~2 min faster from payment → first usable agent (we save the
  refreshEnv-restart roundtrip on the happy path).
- Customer thinks about "what should the agent do" while still in the
  marketing/sales mindset from the landing page — usually richer answers.
- Pairing becomes the LAST customer-action step before "agent active",
  which maps better to "you finished setup" intuition.

**Cons**
- BotFather flow is alien to non-tech customers. Today's order acts as a
  funnel: customers who can't get past step 2 (token validation) bail
  early without us having spent time on persona generation. Reordering
  means we'd render step 4 to customers who'll never make it past step 2,
  inflating the "abandoned at pairing" cohort with people we've wasted
  10 min of their attention on.
- Required field changes: pairing relies on `customer.id` being known
  (which it is post-payment, fine), but the per-customer bot token
  is set in step 2. If we reorder, the proactive greeting (Track 2)
  lands on a chat that doesn't exist yet because pairing is now AFTER
  refreshEnv. Track 2 would have to fire on a different boundary
  (Telegram getUpdates first message handler instead of Edge Function
  hop) — much more architectural surgery.

## Option C — reframe, don't reorder

Soft-merge step 4 into step 1 or step 2 as "tell us about your agent" —
treat it as another data-collection field, not a separate "now describe
your AI's soul" rite. Defaults the persona to a calm-premium template
when blank, lets opinionated customers customize.

**Pros**
- Reduces step-count from 4 to 3 visually.
- SOUL.md generates earlier (could plumb into xendit-webhook spinUp), so
  the parallel-provision win in Option B applies here too.
- Doesn't move pairing later — keeps the funnel intact.

**Cons**
- "Persona" deserves attention; tucking it into a checkout-style form
  field probably means most customers leave it blank → all agents feel
  the same → reduces the differentiator.
- Visual hierarchy: step 1 already has 3 fields; adding "agent persona"
  textarea makes the card crowded.

## Founder recommendation (analysis only — not a decision)

**Don't reorder yet.** The cost of Option B (architectural surgery for
proactive greeting + losing the funnel filter) outweighs the benefit
(2 min wall-clock saved, mental-model improvement). Once we've shipped
the cascade currently in flight (Tracks 1-5) and watched 3-5 fresh
customers, revisit with data on:

1. How many customers complete step 2 but bail at step 4? (If <10%, the
   funnel-filter argument from Option A weakens.)
2. How long does the average customer take to write expectations? (If
   <60s, the "rushed answer if step 4 is first" worry is unfounded.)
3. Does the proactive greeting (Track 2) land in time, or does the
   customer reach Telegram before the greeting fires? (If they land
   first, Track 2's value drops, and Option B's penalty-on-greeting
   matters less.)

If 1+2+3 all favor a move, ship Option C (reframe in-place) — it gets
the parallel-provision win without the funnel cost.

## Open question for founder

Should step 4 be **optional** (with a "skip — use a calm-premium default
persona" CTA) regardless of placement? That's an orthogonal call to the
order question, and removing it from the critical path would close the
"customer wrote nothing because they're tired" failure mode.
