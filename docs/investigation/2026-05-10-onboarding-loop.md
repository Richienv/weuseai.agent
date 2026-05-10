# Investigation — onboarding loop blocking founder fresh-customer test

**Date:** 2026-05-10  
**Status:** Phase 1 (read-only investigation) complete. Awaiting founder go-ahead for Phase 2 (fix).  
**Repro fixture:** customer `e282ce25-764d-4d88-b592-d4ef2c6cc360` — fully populated, 4 active `pro` subscriptions from today's cascade testing.

---

## TL;DR

**Hypothesis C confirmed (with a wrinkle).** The loop is caused by **two compounding bugs** at the same logical layer:

1. **`/welcome` state C is gated solely on the `&job` URL param**, not on whether the customer is already onboarded. Any landing without `&job` shows "Lengkapi profil agent" — including legitimate "already-onboarded" landings.
2. **`complete-onboarding`'s `409 already_onboarded` redirect points back at `/welcome` without `&job`.** So the only escape route from "I just clicked Lengkapi profil" sends the customer right back to "Lengkapi profil."

The loop closes in 6 hops. There's a **third related bug** worth surfacing: the `/onboarding` boot routing doesn't include `soul_md_text` in its decision (column REVOKED for anon SELECT per Sesi D P0-2), so already-onboarded customers get re-rendered on step 4 as if they still need to fill it. Step 4 submit is idempotent at the handler level (returns 409), but it's the trigger for the loop.

**Recommended fix:** 1-line redirect param + ~25 LOC welcome.html resilience. Estimated 1 PR, ~50 LOC including the test update.

---

## e282ce25 actual DB state (read 2026-05-10 ~22:00 UTC+8)

```
customers:
  display_name             = "Richie Novell"
  email                    = "kidnovell.richie@gmail.com"
  whatsapp_number          = "082154902561"
  telegram_chat_id         = "6805409051"
  telegram_bot_username    = "testaiagentrenbot"
  pairing_code             = NULL
  pairing_code_expires_at  = NULL
  soul_md_text             = "# About me\nI am The Pro, a specialist agent built for Sarah…"
                              (NON-NULL, ~1.5KB persona)

subscriptions:
  4 rows for this customer (today's cascade test repays).
  All status=active, tier=pro, hosting_active=true.
  Latest: 19be8a3a-618b-4bb0-905c-390f275563fc, started_at=2026-05-10T14:50Z
```

Every gating field is populated. The customer IS already onboarded by the data definition.

---

## State-machine trace (the 6-hop loop)

```
[hop 1]  Customer pays via Xendit
         → Xendit success_redirect: /welcome?cid=<cid>      ← NO &job
         (create-invoice-handler.ts:86)

[hop 2]  /welcome polls subscriptions row
         → status='active'
         → tick() runs: `if (job) { … } else { renderState('C') }`
         (welcome.html:720)
         State C renders: "Lengkapi profil agent" CTA → /onboarding?cid=<cid>

[hop 3]  Customer clicks the CTA
         → Browser navigates to /onboarding?cid=<cid>

[hop 4]  Onboarding boot reads anon-allowlisted customer columns:
         id, display_name, telegram_chat_id, telegram_bot_username,
         pairing_code, pairing_code_expires_at
         (onboarding.html:1006)
         Note: email + soul_md_text + whatsapp_number are NOT readable
         from anon (Sesi D P0-2 REVOKE).

         Boot routing (onboarding.html:1899):
           if (chat_id && whatsapp_number && bot_username) → setStep('4')
           else                                            → setStep('1')

         e282ce25 has all three → STEP 4 RENDERS
         (Customer "skips" steps 1, 2, 3 because the routing doesn't know
          soul_md_text is also already set — that field is not readable.)

[hop 5]  Customer fills expectations, clicks Lanjut
         → POST /functions/v1/complete-onboarding
         (onboarding.html:1756)

         Handler hits idempotency check (complete-onboarding-handler.ts:80):
           if (customer.telegram_chat_id
               && customer.soul_md_text
               && subscription.status === 'active') {
             return 409 {
               error: 'already_onboarded',
               redirect: `${publicBase}/welcome.html?cid=${customer_id}`,  ← NO &job
             }
           }

[hop 6]  Onboarding handles 409 (onboarding.html:1781):
           window.location.replace(data.redirect)
         → Browser navigates to /welcome.html?cid=<cid>     ← STILL NO &job
         → BACK TO HOP 2 → LOOP
```

The loop is **deterministic** for any customer who:
- Has `chat_id + whatsapp_number + bot_username` (so boot routes to step 4), AND
- Has `soul_md_text` set + an active subscription (so handler returns 409 instead of re-spinning).

Any debug-reset customer or any customer who refreshes after a successful first-time onboarding will hit this. It just hasn't surfaced in fresh-customer testing because fresh customers complete the loop's "happy half" (state C → onboarding fills SOUL.md → handler succeeds with `&job=` → state C2). Founder hit it because e282ce25 was already populated from the morning's tests.

---

## Why state C was gated on `&job` in the first place

`&job` is the `provisioning_job_id` returned by `complete-onboarding` after a successful `spinUp` call. Welcome.html uses it as a proxy for "we know provisioning was just kicked off" → render the agent-ready story. If absent, the page assumes "we don't know what state the customer is in, so default to 'go finish onboarding.'"

This was a reasonable proxy when:
- All fresh customers landed on welcome WITH `&job=…` (after step 4 success), AND
- All Xendit-success landings (no `&job`) genuinely needed to fill onboarding.

It breaks when an already-onboarded customer lands without `&job`. The proxy is no longer reliable.

---

## Three bugs, in order of root-cause priority

### Bug A (THE ROOT) — `complete-onboarding`'s 409 redirect drops `&job`

**File:** `supabase/functions/_shared/complete-onboarding-handler.ts:84-91`

```ts
if (customer.telegram_chat_id && customer.soul_md_text && subscription.status === 'active') {
  return json({
    error: 'already_onboarded',
    redirect: `${deps.publicBase}/welcome.html?cid=${customer_id}`,   // ← drops &job
  }, 409)
}
```

The handler knows the customer is onboarded but emits a redirect that the welcome page can't distinguish from a first-time landing. **This is the only redirect in the codebase that does this** — the success path at line 331 includes `&job=${spinResult.jobId}`.

### Bug B — `/welcome` state C is gated solely on URL param, not on real readiness

**File:** `welcome.html:709-720`

```js
if (status === 'active') {
  if (job) {
    const probe = await pollReadinessProbe();   // ← only called when job present
    if (!probe || !probe.ready) renderState('B');
    else { await ensureBotUsername(); renderState('C2'); }
  } else {
    renderState('C');                           // ← unconditional, no probe check
  }
}
```

The customer-readiness probe (just shipped) gives us a definitive "is this agent actually ready to chat?" signal that doesn't depend on URL params. State C should fall through to the probe before defaulting to "Lengkapi profil."

### Bug C — `/onboarding` boot can't distinguish "needs step 4" from "step 4 already done"

**File:** `onboarding.html:1899-1907`

```js
if (customer.telegram_chat_id && customer.whatsapp_number && customer.telegram_bot_username) {
  setStep('4');     // ← also fires for already-onboarded customers
} else {
  setStep('1');
}
```

The decision can't include `soul_md_text` because that column is REVOKED for anon SELECT. The "step 4 is already done" case is invisible from the browser without a server round-trip.

---

## Recommended fix shape (founder review point)

### Tier-1 fix (the unblock — ~5 LOC)

**Bug A — patch `complete-onboarding` 409 redirect to include a synthetic `&job=already-onboarded`:**

```ts
return json({
  error: 'already_onboarded',
  redirect: `${deps.publicBase}/welcome.html?cid=${customer_id}&job=already-onboarded`,
}, 409)
```

Welcome.html state C2 already handles bot-username gracefully (renders "Mengambil link bot kamu…" loading state if missing, real CTA when fetched). The synthetic `&job` value isn't pattern-matched anywhere — it's just a "non-empty" marker that flips C → C2 path, which then runs the probe + ensureBotUsername.

This **single line** breaks the loop. Customer who 409s lands on state C2, sees "Buka Telegram @<bot>" CTA, and is unblocked.

### Tier-2 fix (the right architectural fix — ~25 LOC)

**Bug B — make welcome state C call the probe before defaulting to "Lengkapi profil":**

```js
if (status === 'active') {
  // Probe-aware: an already-onboarded customer landing without &job
  // (bookmark, tab refresh, 409 redirect, etc.) should still see C2
  // when their agent is actually ready. Probe is cheap (~1-2s SSH RTT).
  const probe = await pollReadinessProbe();
  if (probe && probe.ready) {
    await ensureBotUsername();
    renderState('C2');
  } else if (job) {
    // Job kicked off but probe says not yet ready → wait state.
    if (Date.now() - startedAt > TIMEOUT_MS) renderState('F');
    else                                     renderState('B');
  } else {
    // No job + probe says not ready → genuinely needs onboarding.
    renderState('C');
  }
}
```

This makes welcome resilient to ANY landing without `&job`, including bookmarked URLs, browser back-button, etc. The probe is the source of truth.

### Tier-3 fix (defense-in-depth — optional, ~10 LOC)

**Bug C — onboarding boot also calls the probe before routing to step 4:**

```js
// Before deciding which step, ask the probe: is the agent already ready?
// If so, the customer doesn't belong on /onboarding at all — bounce to /welcome.
const probe = await pollReadinessProbe(cid);
if (probe?.ready) {
  window.location.replace(`/welcome?cid=${encodeURIComponent(cid)}&job=already-onboarded`);
  return;
}
// ... existing routing
```

Costs one probe call on /onboarding boot. Closes the "customer lands on step 4 redundantly" symptom that causes the bug to even surface.

---

## Recommendation

**Ship Tier-1 + Tier-2 in one PR.** Skip Tier-3 unless the loop reappears in a different shape.

- Tier-1 alone fixes the founder's immediate test loop.
- Tier-2 adds resilience for any future "landing without &job" pattern (bookmarks, back-button, support-routed URLs, debug-reset retests).
- Tier-3 is gravy — costs a probe call per onboarding visit, prevents step 4 ever rendering for completed customers. Defer until we see a reason.

**Estimated PR size:** ~30-40 LOC (handler + welcome.html) + ~15 LOC tests = ~50 LOC total. Single PR. ~30 min implementation, ~10 min deploy.

**Test plan after fix lands:**

1. Manual: re-load `https://weuseai-agent.vercel.app/welcome?cid=e282ce25-764d-4d88-b592-d4ef2c6cc360` (no `&job`). Should render state C2 ("Buka Telegram @testaiagentrenbot") because probe.ready=true on this customer.
2. Manual: from the above, click Buka Telegram → goes to telegram, no loop.
3. Manual: from `/welcome?cid=…`, click "Lengkapi profil" if it ever shows for an already-onboarded customer (it shouldn't post-fix, but if it does), type expectations on step 4 → handler returns 409 → redirect now carries `&job=already-onboarded` → state C2 lands directly. No loop.
4. Automated: add a welcome.html spec asserting probe-aware C2 transition fires when status=active+probe.ready=true even with no `&job`.

---

## What I did NOT touch (per investigation-only rule)

- No code changes. Worktree state is clean against `origin/main` after this report.
- No DB writes. e282ce25's restored state (post-PR #67 verification) is intact.
- No Edge Function or Fly redeploys.
- Phase 2 items (landing hero copy 3-row wrap, checkout name field removal) deferred per founder rule — wait for this loop fix to land + founder confirmation before touching them.

Awaiting founder thumbs-up on fix shape before implementing.
