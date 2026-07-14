# e2e Smoke Findings — 2026-05-14

**Smoke target:** `https://weuseai-agent.vercel.app/`
**Harness:** [`tests/e2e/smoke-production.spec.ts`](../../tests/e2e/smoke-production.spec.ts)
**Run command:** `npx tsx --test tests/e2e/smoke-production.spec.ts`
**Sentinel email pattern:** `e2e-smoke-${timestamp}@weuseai.test`
**Driving brief:** founder reported "Pembayaran tidak bisa disiapkan saat ini" on /checkout; 1577 existing tests missed it because there was zero end-to-end coverage of the live deployed system.

---

## Summary

| Step | Description | Result |
|---|---|---|
| 1 | Landing renders | ✓ pass |
| 2 | /checkout reachable | ✓ pass (but 3 drift warnings on deployed code) |
| 5 | POST /create-invoice with valid body | ✓ pass — server returns invoice_url |
| 7 | invoice_url well-formed Xendit URL | ✓ pass — BUT it's `checkout-staging.xendit.co` (P0, see #2 below) |
| 8 | /welcome reachable with cid | ✓ pass |
| 9 | /welcome contains P3-CF-1 accordion | ✗ fail — accordion missing from live deploy |
| 10 | /checkout?error=failed reveals B2 banner | ✗ fail — banner markup missing from live deploy |

**2 P0 findings, 1 process gap, 0 P1, 0 P2.**

---

## P0-1 · Stale Vercel production alias (RE-CONFIRMED from 2026-05-13)

### What customer sees

Anyone clicking "Bayar Sekarang" on the live URL:

1. JS at `checkout.html:1124` (deployed version) sends a POST body **WITHOUT** `tos_accepted_at` because PR #91's JS isn't on the live deploy
2. Server-side `create-invoice` Edge Function (which IS current) gates ToS per pass-3 audit → returns `400 { error: "tos_required" }`
3. Live frontend's catch handler (pre-PR-#100) shows raw English code echo

Live deploy is at `1cb69cf` from ~26h ago. PRs **#91 / #99 / #100 / #101 / #103 / #104 / #105 / #106 / #107 / #108 / #109 / #110 / #111 / #112** are all merged to main but NOT on the production alias.

### Evidence (smoke output)

```
Step 2: GET /checkout reaches checkout form
    HTTP 200, 49545 bytes
    tos_accepted_at in fetch body: NO (PR #91 frontend missing → Step 5 will fail tos_required)
    A2 catalog (CHECKOUT_ERROR_MAP) present: NO
    A2 has tos_required → "Centang dulu..." mapping: NO (PR #112 catalog cleanup missing)

Step 9: /welcome contains P3-CF-1 "Apa yang sedang terjadi" accordion
    <details id="b-whats-happening">: MISSING
    "Apa yang sedang terjadi" summary text: MISSING
    (PR #109 Phase 3 may not be on the deployed alias)

Step 10: B2 failure banner present
    <div id="xendit-failure-banner">: MISSING
    revealXenditFailureBannerIfNeeded function: MISSING
    if (errParam !== 'failed') return guard: MISSING
    (PR #105 B2 may not be on the deployed alias)
```

The smoke proves the SERVER works (Step 5 returned 200 + invoice_url when called with a correct body). The bug surfaces only because the FRONTEND deployed at the production alias is months out of date relative to `main`.

### Root cause

`weuseai-agent.vercel.app` alias is pinned to deployment `dpl_8ExUxMKPMD48Nv8g1hX8TUq6ySXh` (commit `1cb69cf`) from 2026-05-13 09:05 SGT. The `weuseai-agent-git-main-...vercel.app` alias auto-tracks main correctly (verified yesterday: returns 57614-byte current checkout.html with all PRs applied). The production primary domain has been pinned, manually or by a project-config drift.

### Remediation (founder action — out of code scope)

```bash
# Find the latest production deployment URL
vercel ls --prod | head -3

# Promote it to the production alias
vercel promote https://weuseai-agent-<latest>-richies-projects-6f212435.vercel.app
```

OR: Vercel dashboard → Deployments → click latest Ready production deploy → "Promote to Production".

**Worth a 5-min investigation:** WHY did the alias stop auto-promoting ~26h ago? The `git-main` alias updates fine; only the primary domain is pinned. Most likely cause: a manual promote or "Disable Auto-Production" toggle ~26h ago. Check project settings → Production Branch / Deployment Protection so this doesn't silently happen on the next push.

### Severity reasoning

**P0** — this is the bug that blocked the founder and would block every paying customer. Every other smoke finding downstream of this is a victim of the same root cause.

---

## P0-2 · Xendit running in TEST mode despite CLAUDE.md saying LIVE

### What customer sees

After the alias gets promoted (closing P0-1), customers WILL be able to submit checkout. Server returns 200 with `invoice_url`. Customer clicks the URL → lands on Xendit's checkout page. But:

```
Step 7: Invoice URL well-formed
    host=checkout-staging.xendit.co, path=/web/6a05370cb30934f497e785fe
```

`checkout-staging.xendit.co` is Xendit's **staging environment**. Real money transactions don't route through it. A real customer would either see a "TEST MODE" banner on Xendit's page, OR their bank card / QRIS app would reject the payment with "merchant not configured", OR the payment would appear to succeed but never actually settle.

### Diagnosis (verified via code-read)

`services/payment/lib/payment/xendit-payment.ts:27` correctly defaults to `https://api.xendit.co` (the production API endpoint). The adapter is NOT misconfigured.

The reason Xendit returns staging URLs from a production API endpoint is that the `XENDIT_SECRET_KEY` configured on the deployed Supabase Edge Function is a **test key** (key prefix `xnd_development_*`), not a **live key** (prefix `xnd_production_*`). Xendit's `api.xendit.co` endpoint accepts both key types — the key determines whether the returned invoice is real or staging.

### Evidence

- Local Xendit adapter base URL: `https://api.xendit.co` (correct, live)
- Live smoke result: `invoice_url=https://checkout-staging.xendit.co/web/6a05370cb30934f497e785fe`
- Therefore: live deploy's `XENDIT_SECRET_KEY` is a test key.
- CLAUDE.md says: "Payments: Xendit live (QRIS primary, e-wallet + cards supported). Sandbox retired."

The CLAUDE.md statement contradicts the deployed env. Either the env has stale config from sandbox-era, or CLAUDE.md was forward-dated before the live rotation actually happened.

### Remediation (founder action — credentials rotation)

This is "Need API keys, credentials, or paid signup" per CLAUDE.md's STOP rules. Founder owns the Xendit account.

Steps:
1. Log into Xendit Dashboard → Settings → Developers → API Keys
2. Find or generate a **production / live** secret key (prefix `xnd_production_`)
3. Rotate it onto the Supabase Edge Function env:
   ```bash
   supabase secrets set --project-ref gtjgsligllbjcisiyrah XENDIT_SECRET_KEY=xnd_production_xxxxx
   ```
4. Also rotate `XENDIT_WEBHOOK_TOKEN` to the live webhook token (Settings → Callbacks → Production)
5. Re-run smoke to confirm `invoice_url` host is now `checkout.xendit.co` (no `-staging`)

### Severity reasoning

**P0** — customers who get past P0-1's broken-checkout will get to a Xendit page that can't take their money. Equivalent revenue impact: zero paying customers possible until rotated.

---

## P1 · None

No P1 findings on this pass. After the two P0s are resolved by founder action, the smoke harness should pass end-to-end.

---

## P2 · Smoke coverage limits (pure HTTP) — Phase 4 scope

This harness is **HTTP-only by design** so it ships fast, has zero new dependencies, and runs in any CI minutes-bounded environment. That trades off coverage of:

| What HTTP can't see | Why it matters | Phase 4 plan |
|---|---|---|
| Runtime console errors on /welcome state-B | State-B has a live tick() that polls customer-progress; if JS throws here, customer sees a frozen progress bar | Playwright pass: load page, wait 5 s, dump `page.consoleMessages()` |
| `<details>` open-close UX (P3-CF-1 accordion) | Markup may be present but reveal animation broken | Playwright pass: click summary, assert details element is open |
| Time-based state transitions (B → C2 → C → F) | The 3-tier escalation ladder (slow → very slow → timeout) can only be observed by waiting | Playwright with `page.waitForTimeout()` |
| Form submit via DOM event vs direct fetch | DOM event handlers can be wired wrong (e.g. preventDefault missed) but a direct POST still works | Playwright: fill form, click button, capture network request |

These are tractable additions in Phase 4 when Playwright is brought up to root scope (currently only in `services/autobrowse`, Sesi R's scope). Doesn't block first paying customer.

---

## Notes on the harness itself

- **No new dependencies.** Uses only `node:test`, `node:assert`, and `fetch` (Node 18+ built-in).
- **Fail-independent.** Each step is its own `test()` block — one failure doesn't suppress the report for subsequent steps. Run output gives the full picture in one pass.
- **Sentinel email** `e2e-smoke-${ts}@weuseai.test` makes test customers/subscriptions identifiable in the database for cleanup. Email domain `@weuseai.test` is reserved (not a real TLD) so Resend will not actually send mail to it.
- **Excluded from default `npm test` glob** (`tests/*.spec.ts` vs this file's `tests/e2e/*.spec.ts`). Run only via the explicit command above. Reason: every run creates a real Supabase customer row + Xendit invoice creation request; running on every dev CI would spam.
- **Production URL pinned** to `https://weuseai-agent.vercel.app/` per MEMORY.md ("always verify deploys via weuseai-agent.vercel.app/, not the velorah-nu auto-alias"). Hard-coded in the harness — do not change.

---

## Cleanup of smoke-test customer rows (cosmetic)

Each smoke run inserts a row in `customers` keyed on the sentinel email. Across many runs these accumulate (still bounded — same-email customer is found-or-inserted, so only NEW timestamps produce new rows). Founder can periodically:

```sql
DELETE FROM customers WHERE email LIKE 'e2e-smoke-%@weuseai.test';
-- Cascades to subscriptions and consent_events via FK ON DELETE CASCADE
```

Not urgent. Not in scope for any Phase 3 PR.

---

## Next pickup (Phase 3+)

Two P0s above are both founder-side (alias promotion + Xendit key rotation). No code work needed to unblock the customer flow. After founder resolves both, re-run the smoke; it should be fully green.

Phase 4 (CI wiring) and Phase 5 (closeout) will start once the two P0s are confirmed cleared. No code PRs to ship in Phase 3 — the audit's job here is verification, not refactor.
