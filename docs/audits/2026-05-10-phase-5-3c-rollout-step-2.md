# Phase 5-3.c Rollout — Step 2 (Provisioning Wire-Up Complete)

> **Status: code shipped + tests green.** HERMES_INSTANCE_HMAC_KEY env intentionally unset on prod — final flip is founder's call when ready.

---

## Recap of Phase 5-3.c (the 2-step rollout)

**Step 1 (PR #32 — landed 2026-05-09):** Edge Function side
- Added `signCustomerToken` / `verifyCustomerToken` / `extractBearerToken`
- Wired `verifyToken` dep into `hermes-kanban-proxy-handler` + `approval-queue-handler`
- Both Deno entries read `HERMES_INSTANCE_HMAC_KEY` env (when set) → enforce HMAC; when unset → backward-compat MVP
- Live smoke verified end-to-end: env set → 401 / 201 → env unset → backward-compat

**Step 2 (this PR — landed 2026-05-10):** Provisioning side
- `setup-script.ts` accepts `hermesInstanceToken?: string` param
- Token written to VPS `~/.hermes/.env` as `HERMES_INSTANCE_TOKEN=<hex>`
- `customer-flow.ts` computes token at provisioning time when `HERMES_INSTANCE_HMAC_KEY` is set in provisioning service env
- 5 new tests + round-trip verification

---

## Final flip checklist (founder action)

When ready to enable HMAC enforcement on prod for new customers:

```bash
# 1. Generate the shared secret (once)
HMAC_KEY=$(openssl rand -hex 32)
echo "HMAC key (save in password manager): $HMAC_KEY"

# 2. Set on Supabase Edge Functions (verifier side)
supabase secrets set HERMES_INSTANCE_HMAC_KEY=$HMAC_KEY \
  --project-ref gtjgsligllbjcisiyrah

# 3. Set on Fly.io / provisioning service env (issuer side)
#    Fly: fly secrets set HERMES_INSTANCE_HMAC_KEY=$HMAC_KEY -a weuseai-provisioning
#    (or whatever provisioning host is deployed to)

# 4. Verify both sides see the env
#    - hit /functions/v1/hermes-kanban-proxy with no token → expect 401
#    - provision a test customer; ssh in; cat ~/.hermes/.env | grep HERMES_INSTANCE_TOKEN
#      → expect a 64-hex value
```

**Don't flip before existing customers are migrated.** Pre-rollout customers' VPS instances don't have the token in env → their Hermes-side calls would 401. Two options:

- **Option A (preferred for first-customer launch):** flip BEFORE first customer is provisioned. No back-fill needed.
- **Option B (if customers exist):** SSH-in script to inject `HERMES_INSTANCE_TOKEN` into existing VPSes' env before flipping the verifier. This already exists as a pattern (Phase 2E-3 fleet SSH).

---

## Threat model summary (per Phase 5-3.c spec)

- **Cross-customer mint:** verifier re-derives expected token from `body.customer_id` → if attacker uses customer A's token to write customer B's data, hash mismatch → 401.
- **Shared-secret leak:** if any one VPS leaks the env, attacker gets the secret + can mint for any customer. Acceptable for Phase 5 paying-customer scope.
- **Phase 6+ hardening:** rotate shared secret periodically; or move to per-customer hashed secrets in DB.

---

## What's NOT in this PR (out of scope)

- **Hermes-side caller updates** — kanban-orchestrator skill on customer VPS needs to read `HERMES_INSTANCE_TOKEN` and include `Authorization: Bearer <token>` on platform callbacks. This is Hermes upstream territory (we don't fork). For Phase 5, Hermes-side calls already succeed (MVP customer_id existence check). Once founder flips the switch + Hermes-side updates land in a future Hermes release, the upgrade is graceful.
- **Existing customer back-fill SSH script** — if any pre-rollout customers exist when founder flips, write a one-shot script. Currently zero such customers, so no work needed.
- **Rotation runbook** — Phase 6+ defense. Not in scope.

---

## Verification (this PR)

- ✅ 5/5 new tests pass (`tests/setup-script-hmac.spec.ts`)
- ✅ Round-trip: `signCustomerToken` → `setup-script.ts` env → `verifyCustomerToken` succeeds
- ✅ Cross-customer isolation: tokenA does not leak into customerB's setup script
- ✅ Back-compat: `hermesInstanceToken` omitted → `HERMES_INSTANCE_TOKEN=` line absent
- ✅ 907/908 total tests pass (1 pre-existing skip)
- ✅ `npm run typecheck:all` clean across all packages

---

## What's queued

- Founder flips `HERMES_INSTANCE_HMAC_KEY` in Supabase + provisioning env when ready (Studio-tier customer onboarding moment is the natural trigger)
- Hermes-side caller updates (upstream concern; we monitor for the upstream release)
