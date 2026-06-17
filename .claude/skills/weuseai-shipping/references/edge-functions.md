# Supabase Edge Functions — deploy playbook

This is the runbook for shipping a change to a Supabase Edge Function in this
repo, and for the specific failure that took payments down: a **stale deploy**
with mismatched CORS. Read this BEFORE you touch anything under
`supabase/functions/`. The CLI is already authenticated on this machine, so
**you deploy yourself** — do not hand the founder commands to run.

This is a separate concern from the Vercel landing auto-deploy. The landing
(`index.html`, `checkout.html`, `welcome.html`, …) ships automatically on push
to `main`. Edge functions do **not** — nothing in a Vercel push runs
`supabase functions deploy`, so the live function silently drifts from the repo
until someone redeploys. That drift is exactly what caused the outage.

---

## 0. Preconditions (verify, don't assume)

The founder's Supabase secrets are present on this Mac and the `supabase` CLI is
logged in. Confirm before you do anything else:

```bash
supabase projects list
```

Look for the **LINKED** row (marked with `●`) on project ref
`gtjgsligllbjcisiyrah`, name `weuseai.agent`, region Seoul:

```
   LINKED | ORG ID               | REFERENCE ID         | NAME          | ...
     ●    | mfinkhogmsadxjtarvev | gtjgsligllbjcisiyrah | weuseai.agent | ...
```

If you see that row, you can deploy. If `projects list` errors with an auth
problem, THEN stop and ask the founder to `supabase login` — but the default
assumption is that you are good to go. (The project ref `gtjgsligllbjcisiyrah`
is also pinned as `project_id` at `supabase/config.toml:19` and as the
`SUPABASE_PROJECT_REF` default in `scripts/deploy-all.sh:22`.)

Edge-function deploys need the founder's Supabase access token + function
secrets, which ARE on this machine. That makes them doable here. It does NOT
make them part of the autonomous-sandbox path — `scripts/deploy-all.sh` exists
precisely because a no-secrets session can't reach this surface.

---

## 1. The three rules that make a deploy actually work

These come from the founder's failed deploy during the payment outage. Each one
maps to a real error message he hit.

### Rule A — run from the REPO ROOT

```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah"
```

The founder's deploy failed with:

```
Entrypoint path does not exist .../supabase/functions/create-invoice/index.ts
```

…only because he ran it from `~`. The CLI resolves function paths relative to
the current directory's `supabase/` tree. `cd` to the repo root first, every
time. Note `velorah` (not the parent `weuseai.agent/`) is the git root and the
directory that holds `supabase/`.

### Rule B — use `--use-api` (no Docker)

```bash
supabase functions deploy <fn> --use-api --project-ref gtjgsligllbjcisiyrah
```

`--use-api` bundles the function server-side via the Management API, so you do
**not** need Docker running locally. The founder hit `Docker is not running`
without it. (`scripts/deploy-all.sh` predates this flag and omits it — if you
run that script and Docker is down, add `--use-api` to its
`supabase functions deploy` line.)

### Rule C — NEVER pass a blanket `--no-verify-jwt`

`verify_jwt` is configured **per function** in `supabase/config.toml`, e.g.:

```toml
[functions.create-invoice]
verify_jwt = false
```

When you deploy **without** any `--verify-jwt`/`--no-verify-jwt` flag, the CLI
reads each function's setting from `config.toml`. That is what you want.

A blanket `--no-verify-jwt` overrides the file and flips a function that should
be authenticated **open** — a security regression. This is not hypothetical
here: `customer-progress-proxy` has **no** `[functions.customer-progress-proxy]`
block in `config.toml`, so it inherits the default `verify_jwt = true`. A
blanket `--no-verify-jwt` would silently expose it. (The header comment at
`config.toml:1-18` records a prior incident where a deploy flipped
`xendit-webhook`'s JWT the wrong way and broke the callback path — same class of
bug.)

`create-invoice` happens to be `verify_jwt = false` already, so passing the flag
*on that one function* is a no-op — which is why the bug is easy to miss. Don't
rely on the no-op. Just never pass the flag; let `config.toml` decide.

---

## 2. The CORS model (why a one-function deploy is usually wrong)

Browser-callable functions get their CORS from
`supabase/functions/_shared/cors.ts`. Understand its shape before changing it.

- **Exact-origin allowlist, never wildcard.** `pickAllowedOrigin(req)` reads the
  request's `Origin` and echoes it back **only** if it passes
  `PROJECT_ORIGIN_RE`. Credentialed XHR requires an explicit origin echo, so a
  `*` wildcard would not work even if we wanted it.
- **Scope-pinned Vercel-preview matcher.** The regex
  `/^https:\/\/weuseai-agent(?:-[a-z0-9]+(?:-[a-z0-9-]+)?)?\.vercel\.app$/i`
  matches production `https://weuseai-agent.vercel.app` and preview deploys of
  the form `https://weuseai-agent-<hash>-richies-projects-6f212435.vercel.app`
  — the prefix `https://weuseai-agent-` plus the team-scope suffix
  `-richies-projects-6f212435.vercel.app` (Vercel orgId
  `team_kkzsbca3s7jSJaiwFL5ZTK37`, scope slug `richies-projects-6f212435`). Only
  our project's hosts pass.
- **Fail-closed fallback.** If the origin does NOT match, `pickAllowedOrigin`
  returns the canonical production origin `https://weuseai-agent.vercel.app`. A
  browser whose real origin differs then rejects the response itself — we fail
  closed, never silently allow a foreign origin.
- **Server-to-server functions are exempt.** `webhookCorsHeaders` uses `*`
  on purpose for `xendit-webhook` / `telegram-bot-webhook`, where the caller is
  not a browser and CORS doesn't apply. Don't "fix" those to the allowlist.

**The load-bearing fact: `_shared/cors.ts` is bundled PER FUNCTION at deploy
time.** It is not a shared runtime module the live functions import at request
time — each `supabase functions deploy` snapshots `cors.ts` into that one
function's bundle. So **a change to `cors.ts` only lands on functions you
re-deploy.** Deploy one and the other eight keep serving the old CORS code.

That is the trap behind the outage: a `cors.ts` allowlist change had been
committed, but the live functions were never redeployed (Vercel pushes don't
trigger it). The browser console showed:

```
Access to fetch … has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

The **total absence** of the header (not a mismatch) is the stale-deploy
signature: the live bundle predates the allowlist code entirely. A mismatched
(but present) header would point at a regex/origin bug instead.

---

## 3. The browser-callable funnel — redeploy ALL of these together

When you change `_shared/cors.ts`, redeploy **every** browser-callable function,
not just the one you were debugging. These are the functions a browser hits
across the checkout → onboarding → welcome funnel (all confirmed present under
`supabase/functions/`):

```
create-invoice
complete-onboarding
customer-readiness
customer-progress-proxy
save-onboarding-profile
rotate-pairing-code
validate-bot-token
reset-bot-pairing
agent-chat-relay
```

Copy-paste deploy block (run from repo root, after `cd`):

```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah"

for fn in create-invoice complete-onboarding customer-readiness \
          customer-progress-proxy save-onboarding-profile \
          rotate-pairing-code validate-bot-token reset-bot-pairing \
          agent-chat-relay; do
  echo "▶ deploy $fn"
  supabase functions deploy "$fn" --use-api --project-ref gtjgsligllbjcisiyrah
done
```

No `--no-verify-jwt` anywhere (Rule C): each function reads its own
`verify_jwt` from `config.toml`. `customer-progress-proxy` (default `true`) and
`agent-chat-relay`/`customer-readiness`/etc. (`false`) all get the correct
setting automatically.

If you changed only ONE function's own code (not `cors.ts` and not other
shared code), deploy just that one — the per-function bundling cuts both ways.
But for any `_shared/*` change that a browser-callable function imports, assume
the whole funnel needs it.

---

## 4. VERIFY the deploy with a real CORS preflight

A green deploy log is not proof CORS is correct. Send an actual preflight and
read the headers back. Substitute the function URL and a real current preview
origin:

```bash
# Expect: HTTP/2 200  +  Access-Control-Allow-Origin echoing the origin you sent
curl -i -X OPTIONS \
  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/create-invoice' \
  -H 'Origin: https://weuseai-agent-<hash>-richies-projects-6f212435.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Pass criteria:
- Status `200`.
- `Access-Control-Allow-Origin` equals the `Origin` you sent (allowlist echo).
- `Vary: Origin` and `Access-Control-Allow-Headers` includes
  `authorization, content-type` (and `x-cid` for `customer-readiness`).

Then prove fail-closed with a junk origin:

```bash
# Expect: 200, but Access-Control-Allow-Origin == https://weuseai-agent.vercel.app
# (the prod fallback) — NOT the junk origin. The browser will reject it.
curl -i -X OPTIONS \
  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/create-invoice' \
  -H 'Origin: https://evil.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

If the junk origin is echoed back, the allowlist is broken — stop and fix
`cors.ts`, don't ship.

Run the preflight against each function you redeployed (the production-origin
case is enough per function; the junk-origin case once is enough to prove the
regex).

**Tell the founder to hard-refresh.** Preflights are cached for
`Access-Control-Max-Age: 86400` (24h) — `MAX_AGE = '86400'` in `cors.ts`. A
browser that cached the failing preflight will keep failing until the cache
expires or the user hard-reloads. Without this step the fix looks like it
didn't work.

---

## 5. Post-deploy sanity

- The deploy needs founder Supabase secrets (present here) — those are function
  *runtime* secrets (e.g. `XENDIT_API_KEY`, `BOT_TOKEN_ENC_KEY`), already set on
  the project. A code/CORS redeploy does **not** require you to re-enter them;
  they persist on the project across deploys. Only set/rotate a secret when the
  task is explicitly about that secret (and rotating `XENDIT_API_KEY` is a
  founder-only action).
- Don't touch `scripts/deploy-all.sh`'s function list to "fix" CORS — that
  script targets the autonomous-backend set (migrations + Fly + a different
  function list) and is for no-secrets CI. The funnel list in §3 is the
  CORS-relevant one.
- After payment-path redeploys, watch the next real checkout in the browser
  console for a clean preflight (no CORS error) before declaring it fixed.
