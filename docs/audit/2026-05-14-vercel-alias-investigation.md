# Vercel Alias Drift — Investigation

**Trigger:** founder reported "Pembayaran tidak bisa disiapkan saat ini" on production. e2e smoke against `https://weuseai-agent.vercel.app` showed PR #91 / #100 / #105 / #109 / #112 all missing from the live frontend even though they're merged to `main`. Yesterday's quick read was "Vercel auto-promotion stopped." That read was incomplete — the actual situation is more interesting and the fix is one founder-side command + a one-line doc flip.

**Bottom line:**

| URL | Tracks main? | Currently serves |
|---|---|---|
| `https://velorah-nu.vercel.app` | **YES — auto-tracking** | Latest main (58613 bytes, full cascade green) |
| `https://weuseai-agent.vercel.app` | **NO — pinned manual alias** | Commit `1cb69cf` from 26h ago (49670 bytes, pre-PR-#91) |

The founder's `MEMORY.md` and `CLAUDE.md` both say production-of-record is `weuseai-agent.vercel.app`. That's inverted. The auto-tracking URL is `velorah-nu.vercel.app` — and a smoke run against it just now is 7/7 green.

---

## Evidence

### 1 · The project has ONE configured production domain

Via Vercel REST API `GET /v9/projects/<id>/domains`:

```json
[
  {
    "name": "velorah-nu.vercel.app",
    "gitBranch": null,
    "verified": true,
    "createdAt": 1777357126619,
    "updatedAt": 1777357126619
  }
]
```

Only `velorah-nu.vercel.app` is in the project's domain list. `weuseai-agent.vercel.app` is NOT registered as a production domain — so Vercel never auto-tracks it.

### 2 · The latest production deployment's `automaticAliases`

The current latest production deploy (commit `7b14bf2`, today's smoke harness merge) has these auto-aliases:

```json
"alias": [
  "velorah-nu.vercel.app",                                              // ← auto-tracking
  "weuseai-agent-richies-projects-6f212435.vercel.app",                 // ← auto-tracking team domain
  "weuseai-agent-git-main-richies-projects-6f212435.vercel.app"         // ← auto-tracking git-main alias
]
"automaticAliases": [
  "weuseai-agent-richies-projects-6f212435.vercel.app",
  "weuseai-agent-git-main-richies-projects-6f212435.vercel.app"
]
```

`weuseai-agent.vercel.app` is NOT in either list.

### 3 · `weuseai-agent.vercel.app` is a manual alias from project creation, 16 days ago

Via `GET /v3/aliases?limit=100&until=<7d-ago>`:

```json
{
  "alias": "weuseai-agent.vercel.app",
  "deployment": "weuseai-agent-4y2ru2fet-richies-projects-6f212435.vercel.app",
  "created": "2026-04-28T07:26:54.280Z",
  "creator": "kdwbco-5785"
}
```

Created 2026-04-28 — one minute after project creation. Manually set by the founder right after project setup. Currently pointing at deployment `4y2ru2fet` (commit `1cb69cf` from 2026-05-13 09:05 SGT = 26h ago).

Vercel only auto-moves an alias on new production deployments if that alias is in the project's `domains` list. Since `weuseai-agent.vercel.app` is NOT a project domain (just a manually-set alias), it stays pinned wherever it was last set.

### 4 · The cascade is fully live on `velorah-nu.vercel.app`

```
e2e smoke against https://velorah-nu.vercel.app
Passed: 7 / Failed: 0 / Total: 7
══════════════════════════════════════════════════
✓ Step 1: Landing renders                    (HTTP 200, 343416 bytes)
✓ Step 2: Checkout reached                   (HTTP 200, 58467 bytes)
    tos_accepted_at in fetch body: YES       (PR #91 live)
    A2 catalog (CHECKOUT_ERROR_MAP): YES     (PR #100 live)
    tos_required → "Centang dulu" mapping: YES  (PR #112 live)
✓ Step 5: POST /create-invoice               (HTTP 200, returns invoice_url)
✓ Step 7: Invoice URL well-formed            (host=checkout-staging.xendit.co — see §5)
✓ Step 8: /welcome reachable                 (HTTP 200, 69465 bytes)
✓ Step 9: P3 accordion in welcome DOM        (PR #109 live)
✓ Step 10: B2 failure banner                 (PR #105 live)
```

### 5 · Xendit STILL in test mode (independent of alias resolution)

Step 7 returns `invoice_url=https://checkout-staging.xendit.co/web/...` from BOTH `weuseai-agent.vercel.app` and `velorah-nu.vercel.app`. Server adapter correctly calls `https://api.xendit.co` (live API); the staging URL comes back because `XENDIT_SECRET_KEY` on the Supabase Edge Function is a test key (`xnd_development_*` not `xnd_production_*`). This is a real P0 unrelated to the alias drift — see [`2026-05-14-e2e-smoke-findings.md`](./2026-05-14-e2e-smoke-findings.md#p0-2--xendit-running-in-test-mode-despite-claudemd-saying-live).

---

## Root cause (single sentence)

`weuseai-agent.vercel.app` is a **manual alias** (not a registered project domain), and Vercel only auto-moves aliases that are registered as project domains. Manual aliases stay wherever they were last set unless explicitly re-assigned. The auto-tracking production URL has been `velorah-nu.vercel.app` the entire time.

---

## Remediations (founder picks one)

### Option A — flip the canonical URL, retire the manual alias (RECOMMENDED)

**One-time edits, permanent fix:**

1. Update `CLAUDE.md` "Production deploy" section:
   ```diff
   -Landing live di `https://weuseai-agent.vercel.app/` (verify deploys di sini, bukan velorah-nu auto-alias)
   +Landing live di `https://velorah-nu.vercel.app/` (auto-tracks main via project domain). `weuseai-agent.vercel.app` is a vestigial manual alias from project creation, currently pinned to commit 1cb69cf — do NOT verify deploys via it.
   ```

2. Update `MEMORY.md` (founder's auto-memory) — flip the same line.

3. (Optional) Delete the manual alias via `vercel alias rm weuseai-agent.vercel.app` to prevent future confusion.

**Pros:** Simplest, no recurrence possible.
**Cons:** Any external doc / shared link / OG-image pointing at `weuseai-agent.vercel.app` breaks. (Low risk — this is a vercel.app subdomain, not a public custom domain.)

### Option B — register `weuseai-agent.vercel.app` as a project domain

**One CLI command, structural fix:**

```bash
vercel domains add weuseai-agent.vercel.app weuseai-agent
```

This adds it to the project's `domains` list. From that moment on, Vercel auto-moves the alias on every new production deployment, exactly like `velorah-nu.vercel.app` already does.

**Pros:** Keeps the friendlier `weuseai-agent.vercel.app` URL for customer-facing use.
**Cons:** May require domain ownership verification (because vercel.app subdomains under specific names can be reserved). If verification fails, fall back to Option A.

### Option C — one-time repoint, leave the manual-alias pattern

```bash
vercel alias set weuseai-agent-ej4o8i8ft-richies-projects-6f212435.vercel.app weuseai-agent.vercel.app
```

(Where `ej4o8i8ft` is the latest production deploy URL — find with `vercel ls --prod | head -1`.)

**Pros:** Zero structural change.
**Cons:** Drifts again on the next manual alias action (e.g. founder does another `vercel promote` or `vercel alias`). NOT a permanent fix.

### Recommendation

**Option A** is the cleanest. The `weuseai-agent.vercel.app` alias was never doing anything `velorah-nu.vercel.app` doesn't already do — the manual alias was set 16d ago when the project was scaffolded and just got stuck. Removing the inversion in the docs is a 2-line edit. Deleting the alias is a 1-line CLI command. Total fix time: ~3 minutes.

---

## What this changes about the e2e smoke

The smoke harness at `tests/e2e/smoke-production.spec.ts` currently hard-codes `PROD_BASE = 'https://weuseai-agent.vercel.app'`. That's correct **as a regression gate against the documented production URL** — if a customer sees stale code, the smoke must catch it. The smoke is doing exactly what it should.

After Option A:
- Smoke flips `PROD_BASE` to `https://velorah-nu.vercel.app`
- Drift gate removed for the now-deleted alias (or kept as `expect-stale` if alias is kept around)

After Option B:
- Smoke stays as-is. Both URLs become functionally identical.

I'll send the smoke-flip change as a follow-up PR once founder picks an option.

---

## Recurrence prevention

The deeper root cause is **a manual alias that nobody's monitoring**. Two prevention patterns to consider once Option A or B lands:

1. **Add the smoke to CI** (Phase 4 of the structural pass). Run on every PR merge to main. If the production URL ever serves stale code again — for ANY reason — the smoke catches it within 1 deploy cycle.

2. **Daily scheduled smoke** to catch third-party drift (Xendit changing endpoint shapes, Supabase env rotations, CDN propagation lags). Founder-DM alert via the Phase 4 telemetry pattern from PR #110.

Both are Phase 4 scope on the cascade brief — gated on the two P0s clearing.

---

## Status of the 2026-05-13 + 2026-05-14 P0s

| P0 | Root cause | Status |
|---|---|---|
| Stale Vercel alias (this doc) | Manual `weuseai-agent.vercel.app` alias never auto-tracks; `velorah-nu.vercel.app` has been current all along | Founder picks remediation option above |
| Xendit running in test mode (smoke finding §5) | `XENDIT_SECRET_KEY` env on Supabase Edge Function is a test key | Founder rotates to `xnd_production_*` key |

**Both P0s independent.** Fixing the alias does NOT fix the Xendit test-mode issue — that's a separate credential rotation. Customers landing on `velorah-nu.vercel.app/checkout` right now CAN successfully POST to /create-invoice, but the Xendit page they land on still can't take real payment.
