# JWT-role auth pattern for admin Edge Functions

> **One-line rule.** Admin-only Edge Functions (server-to-server, never customer-callable) must gate on the **role claim** of the gateway-issued JWT, not on raw equality between the bearer string and `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

> **One-line reason.** Supabase's `sb_publishable_*` / `sb_secret_*` key system rewrites the bearer into a synthesized JWT before the function sees it, so raw-string equality silently breaks the moment the project enables the new keys. The role claim is the only durable signal.

---

## Use this verbatim

The canonical implementation lives at `supabase/functions/_shared/admin-auth.ts`. Import + call:

```ts
import { isServiceRoleCaller } from '../_shared/admin-auth.ts'

Deno.serve(async (req) => {
  if (!isServiceRoleCaller(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  // ... rest of handler
})
```

Don't inline a copy. If you need to fix the pattern, fix it there.

---

## Where the pattern goes (and where it doesn't)

| Auth model | Use this pattern? | Examples |
|---|---|---|
| Server-to-server, called by trusted backends only (provisioning service, CI, scheduled functions) | **YES** | `bundle-publish`, `customer-tier-bump`, `create-invoice`, `invoice-generator-handler`, `daily-briefing-handler` |
| Customer-callable (Hermes on VPS posting on behalf of an authenticated customer) | NO — gate on `customer_id` + active subscription | `workflow-list`, `workflow-execute`, `bundle-fetch`, `bundle-pull-record` |
| Webhook with provider-specific signature header | NO — validate the signature; bearer is irrelevant | `xendit-webhook` (Xendit's `x-callback-token`), Telegram bot webhooks (Telegram's secret token) |

---

## Trust boundary

`verify_jwt = false` in `supabase/config.toml` means the platform doesn't reject unauth requests at the gateway — but the gateway still authenticates whatever bearer IS sent and rewrites it into a signed JWT before forwarding. So:

- Empty bearer → empty token reaches the function → `decodeJwtPayload(token)` returns `null` → `isServiceRoleCaller` returns `false` → 401.
- Anonymous bearer (`anon` key, `sb_publishable_*`) → JWT with `role: 'anon'` → 401.
- Service-role bearer (legacy JWT, `sb_secret_*`) → JWT with `role: 'service_role'` → passes.
- Forged JWT signed with a different key → gateway rejects upstream, function never sees it.

We don't verify the signature ourselves because the gateway already did. Trusting the role claim is equivalent to trusting the gateway, which is the correct level of trust given the function lives behind it.

---

## When you ship a new Edge Function

1. Pick the auth model from the table above.
2. If admin-only: import `isServiceRoleCaller` and gate on it.
3. Add 5 auth tests in `tests/<function-name>-auth.spec.ts`:
   - No bearer → 401.
   - Bearer with anon-role JWT → 401.
   - Bearer with service-role JWT → passes through.
   - Bearer with malformed JWT (not 3 parts, bad base64) → 401.
   - Bearer with valid signature but `role: 'authenticated'` (real-customer JWT, somehow ended up here) → 401.
4. If customer-callable: gate on `customer_id` + check `subscriptions.status = 'active'`. Don't import `isServiceRoleCaller`.
5. Document the choice inline at the top of the function file with a one-line comment: `// Auth model: admin (service-role JWT)` or `// Auth model: customer (customer_id + active subscription)`.

---

## History

- **2026-05-08, Phase 2E-2:** original `bundle-publish` deployed with raw-string equality. Smoke testing failed silently with 401 because Supabase had migrated the project's runtime `SUPABASE_SERVICE_ROLE_KEY` env value to the new `sb_secret_*` format while our local `.env.local` (and our smoke harness's bearer) still sent the legacy JWT. Diagnosed via debug instrumentation that printed the function-side env value vs the bearer prefix — the gateway was rewriting the bearer into a 455-char synthesized JWT, never matching the 41-char `sb_secret_*` env value. Fix: decode the JWT and check `role`.
- **2026-05-08, Phase 2E-3:** pattern lifted into `supabase/functions/_shared/admin-auth.ts` and applied to `create-invoice`, `invoice-generator-handler`, `daily-briefing-handler`. This reference doc captures the pattern so future contributors don't re-derive it.

---

## See also

- `docs/workflows/README.md` → "Edge Function admin auth" section (longer version with code).
- `docs/risks-known.md` → "Floating IP orphan leak" entry has a related pattern (never POST to creation-shaped endpoints without verifying idempotency).
