# Phase 2E-2: Bundle Delivery + Live VPS Integration — Spec (2026-05-08)

> **Status:** DRAFT 2026-05-08 — awaiting founder review before implementation.
> **Branch:** `feat/hermes-vps-integration` (off main at `7f9ed98`).
> **Builds on:** `docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md` (Phase 2E-1, merged in `7f9ed98`).

---

## Why this exists

Phase 2E-1 shipped per-agent bundles + Hermes-native skill library + 5 Edge Functions, but **the bundles never reach the customer's VPS**. The `bundleTarBase64` parameter on `buildSetupScript()` is wired but optional; `customer-flow.ts` (the caller in the provisioning service) currently doesn't pass it. Customers provisioned today get the Phase 1/2A baseline (DAILY_NEWS_SKILL_MD only) — no Hermes-native skills, no per-agent bundle, no self-extension.

Phase 2E-2 closes the loop:

1. Bundles get **uploaded to Storage** at the moment a customer registers their persona choice (via `customer-flow.ts` wiring or onboarding handler).
2. **Minimal bootstrap** ships inline in the setup-script (extend-capabilities + The Pro SOUL.md + base manifest, ~50KB) so the customer can chat from second 1 even if Storage is unreachable.
3. **Full bundle pulled from Storage** at first Hermes boot via a generated `weuseai-bundle-pull` script. Failure mode: keep minimal bootstrap, retry on next boot.
4. **Tier gate** at Hermes skill registration — every VPS gets all Studio-tier skills installed; Hermes only registers skills whose `enabled_for_tiers` includes the customer's current tier. Tier upgrades become instant.
5. **Self-extension Level 1** — `extend-capabilities` runtime persistence to `/var/lib/weuseai/customer-grown/` verified end-to-end.
6. **Live smoke test** — provision a real VPS, send a real chat message, confirm full path: chat → Hermes intent match → workflow-execute → handler → output → reply.

---

## Architecture

```
Customer registration                  Platform                       Customer's VPS
─────────────────────                  ────────                       ──────────────
                                                                      
[onboarding picks                                                     
 persona]                                                             
       │                                                              
       ▼                                                              
customer-flow.ts                                                      
  ─ tar agent-pack/<slug>/ + agent-pack/_shared/                      
  ─ POST bundle-publish                                               
                            ─►  bundle-publish ──► Storage           
                                  (admin only)      bundles/<slug>/   
                                                    <version>.tar.gz  
                                                                      
                                                                      
[provisioning starts]                                                 
  ─ buildSetupScript(                                                 
      bundleTarBase64=<bootstrap, ~50KB>,                             
      bundleVersion=<version pin>,                                    
      ...)                                                            
       │ SSH                                                          
       ▼                                                              
                                                          Setup script:
                                                          - extract bootstrap (extend-capabilities + The Pro SOUL.md + base manifest)
                                                          - install /usr/local/bin/weuseai-bundle-pull
                                                          - Hermes systemd unit ExecStartPre=/usr/local/bin/weuseai-bundle-pull
                                                          - start Hermes
                                                                      
                                                          Hermes boot:
                                                          - weuseai-bundle-pull runs:
                                                            - read WEUSEAI_AGENT_SLUG + customer_id from .env
                                                            - HTTP GET bundle-fetch ──► bundle-fetch ──► signed URL
                                                            - download tar.gz
                                                            - extract to /var/lib/weuseai/bundle/<slug>/<version>/
                                                            - copy SKILL.md files into ~/.hermes/skills/<name>/
                                                            - filter by tier: read manifest, skip skills whose
                                                              enabled_for_tiers excludes customer's tier
                                                            - record success in bundle_pull_attempts table
                                                          - Hermes loads remaining skills, customer chats
```

**Failure isolation:** every step has a fallback.
- Storage upload fails at registration → blocks provisioning, alert founder (treat as platform issue).
- Storage download fails on VPS boot → keep minimal bootstrap, retry on next boot, customer can still chat (with limited skill set).
- Tier gate misconfig → skill simply doesn't register; Hermes moves on.
- Self-extension generation fails → customer sees "lagi ada glitch, coba lagi sebentar?" persona-voiced apology.

---

## Schema migration

File: `supabase/migrations/2026XXXX_bundle_versioning.sql`

```sql
-- Per-customer bundle version pins + update policy.
alter table customers
  add column if not exists bundle_versions jsonb default '{}'::jsonb,
  add column if not exists bundle_update_policy text
    not null default 'pin'
    check (bundle_update_policy in ('pin', 'latest', 'staged'));

-- Tier-default seeding helper (called at subscription activation).
-- starter → 'pin', pro/studio → 'latest'. Staged is opt-in via dashboard.
comment on column customers.bundle_versions is
  'Per-agent version pins, e.g. {"doc-expert": "1.0", "the-pro": "1.2"}. Hermes boot script pulls these versions via bundle-fetch. Empty {} means latest-of-each (rare; production sets this from tier defaults).';

comment on column customers.bundle_update_policy is
  'pin: never auto-update; latest: pull latest on boot if newer than installed; staged: pull but stay disabled until customer confirms in dashboard. Defaults at activation: starter=pin, pro=latest, studio=latest.';

-- Bundle pull telemetry — one row per Hermes boot script attempt.
create table if not exists bundle_pull_attempts (
  id              bigserial primary key,
  customer_id     uuid references customers(id) on delete cascade,
  agent_slug      text not null,
  version_requested text,
  version_installed text,        -- null when failed
  status          text not null check (status in (
    'success', 'failed', 'timeout', 'permission_denied', 'storage_unavailable'
  )),
  error_detail    text,
  bytes_pulled    bigint,
  duration_ms     int,
  attempted_at    timestamptz default now()
);

create index if not exists bundle_pull_attempts_customer_idx
  on bundle_pull_attempts(customer_id, attempted_at desc);

create index if not exists bundle_pull_attempts_status_idx
  on bundle_pull_attempts(status, attempted_at desc);

comment on table bundle_pull_attempts is
  'Phase 2E-2 telemetry. Indexes (customer_id, attempted_at desc) for per-customer reliability dashboard; (status, attempted_at desc) for fleet-wide failure rate.';

-- RLS: service-role only.
alter table bundle_pull_attempts enable row level security;
```

---

## Edge Functions (2 new)

### 1. `bundle-publish`

**Method:** POST
**Auth:** Admin only — service-role JWT in Authorization header. Used at customer registration (called from `customer-flow.ts` provisioning service) and from CI/CD when shipping new bundle versions.

**Input:**
```json
{
  "agent_slug": "doc-expert",
  "version": "1.0.0",
  "bundle_tar_base64": "H4sIA..."
}
```

**Process:**
1. Verify caller has service-role JWT (else 401).
2. Validate `agent_slug` is a known persona (must match `KNOWN_PERSONA_SLUGS`).
3. Validate `version` is semver (regex `^\d+\.\d+\.\d+$`).
4. Decode base64 → upload to Storage at `bundles/<agent_slug>/<version>.tar.gz`.
5. Idempotent — overwriting an existing version is allowed (`upsert: true` in Storage call). Use case: reseed during dev. Production should always bump version.
6. Return `{ ok: true, path: "bundles/...", size_bytes }`.

### 2. `bundle-fetch`

**Method:** POST
**Auth:** Customer-side — `customer_id` UUID in body, validated against active subscription. Same auth model as `workflow-execute`.

**Input:**
```json
{
  "customer_id": "uuid",
  "agent_slug": "doc-expert"
}
```

**Process:**
1. Validate customer + tier (must have active subscription).
2. Read `customers.bundle_versions[agent_slug]` and `customers.bundle_update_policy`.
3. Determine target version:
   - `pin` policy → use `bundle_versions[agent_slug]` (the explicit pin); if missing, fall back to the tier-default version (Phase 2E-2 hard-codes "1.0.0" as the only version we ship).
   - `latest` policy → list `bundles/<slug>/` in Storage, pick semver-highest version, return it.
   - `staged` policy → return the pinned version (staged update lands in Phase 3+ when dashboard ships).
4. Mint a 5-minute signed URL for `bundles/<slug>/<version>.tar.gz`.
5. Return `{ version, signed_url, expires_at, sha256 }`.
6. Hermes boot script downloads the tar via the signed URL.

**Why signed URL vs streaming the bytes:** signed URLs let the customer's VPS download via a CDN edge close to them (Singapore in our case); streaming through the Edge Function adds latency + Edge Function bandwidth. ~5MB bundles benefit from CDN.

---

## Bootstrap embed (critical path)

The `customer-flow.ts` calls `buildSetupScript(...)` with a minimal bootstrap `bundleTarBase64`. This bootstrap is NOT the full bundle — it's a small ~50KB tarball containing only:

```
_bootstrap-bundle.tar.gz/
├── manifest.json                       # base manifest (skills: extend-capabilities only)
├── skills/
│   └── extend-capabilities/
│       └── SKILL.md                    # shared self-extension skill
└── SOUL.md                             # The Pro persona scaffold
```

The bootstrap is **pre-built** by a CI/CD step:

```sh
tsx scripts/build-bootstrap-bundle.ts
# → writes agent-packs/_bootstrap-bundle.tar.gz
```

The build script reads:
- `agent-packs/the-pro/SOUL.md`
- `agent-packs/_shared/skills/extend-capabilities/SKILL.md`
- A small `manifest.json` constructed in-script (skills: extend-capabilities only; `self_extend: true`)

…tars + gzips them, writes to disk.

`customer-flow.ts` then reads `agent-packs/_bootstrap-bundle.tar.gz` at provisioning time, base64-encodes, passes as `bundleTarBase64` to `buildSetupScript()`.

**Drift check:** `tests/bootstrap-bundle-build.spec.ts` runs the build script + asserts:
- Output is a valid gzipped tar
- Tar contains exactly the 3 files listed above
- Total size < 100KB (sanity bound)
- The SOUL.md inside matches `agent-packs/the-pro/SOUL.md` byte-for-byte
- The SKILL.md inside matches `agent-packs/_shared/skills/extend-capabilities/SKILL.md` byte-for-byte

This keeps the bootstrap in sync with the canonical source files; CI catches drift.

---

## Hermes boot script (`weuseai-bundle-pull`)

Generated by `services/provisioning/src/bundle-pull-script.ts` (mirroring `setup-script.ts` pattern). Written to the VPS at `/usr/local/bin/weuseai-bundle-pull` during initial setup.

**Hermes systemd unit gets `ExecStartPre=/usr/local/bin/weuseai-bundle-pull`** so the bundle pull happens before Hermes starts loading skills.

**Pseudocode:**
```bash
#!/bin/bash
set -u  # NOT set -e — we want graceful failure

LOG=/var/log/weuseai-bundle-pull.log
log() { echo "[$(date -u '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# Read env from .env
source /home/weuseai/.hermes/.env
SLUG="${WEUSEAI_AGENT_SLUG:-the-pro}"
CID="${WEUSEAI_CUSTOMER_ID}"
URL="${WEUSEAI_BUNDLE_FETCH_URL:-https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/bundle-fetch}"

# Check if already installed at the pinned version (idempotent on reboot)
INSTALLED_VERSION_FILE="/var/lib/weuseai/bundle/$SLUG/.installed-version"
if [ -f "$INSTALLED_VERSION_FILE" ]; then
  log "Bundle already installed; skipping pull"
  exit 0
fi

# Pull
log "Fetching bundle for $SLUG (cid=$CID)"
RESPONSE=$(curl -fsS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"customer_id\":\"$CID\",\"agent_slug\":\"$SLUG\"}" \
  --max-time 30 \
  2>>"$LOG") || {
    log "✗ bundle-fetch failed (non-fatal); customer keeps minimal bootstrap"
    record_attempt "storage_unavailable" "$?"
    exit 0  # never fail the boot
  }

VERSION=$(echo "$RESPONSE" | jq -r '.version')
SIGNED_URL=$(echo "$RESPONSE" | jq -r '.signed_url')

log "Pulling $SLUG@$VERSION from $SIGNED_URL"
mkdir -p "/var/lib/weuseai/bundle/$SLUG/$VERSION"
curl -fsSL "$SIGNED_URL" --max-time 60 \
  | tar -xz -C "/var/lib/weuseai/bundle/$SLUG/$VERSION" \
  || { log "✗ extract failed"; record_attempt "failed" "$?"; exit 0; }

# Filter skills by tier (read manifest, skip skills whose enabled_for_tiers
# excludes customer's tier). Phase 2E-2 implementation: read tier from .env.
TIER="${WEUSEAI_TIER:-starter}"
for skill_dir in /var/lib/weuseai/bundle/$SLUG/$VERSION/skills/*/; do
  skill_id=$(basename "$skill_dir")
  enabled_tiers=$(jq -r ".skills[] | select(.id == \"$skill_id\") | .enabled_for_tiers[]?" \
    "/var/lib/weuseai/bundle/$SLUG/$VERSION/manifest.json" 2>>"$LOG")
  if [ -n "$enabled_tiers" ] && ! echo "$enabled_tiers" | grep -q "^$TIER$"; then
    log "Skipping $skill_id (tier $TIER not in enabled_for_tiers)"
    continue
  fi
  install -m 0644 -D "$skill_dir/SKILL.md" "/home/weuseai/.hermes/skills/$skill_id/SKILL.md"
done

# Mark installed (idempotent gate for next boot)
echo "$VERSION" > "$INSTALLED_VERSION_FILE"
record_attempt "success" 0
log "✓ Bundle install complete ($SLUG@$VERSION)"
```

**`record_attempt`** — POST to a small `bundle-pull-record` endpoint that writes to `bundle_pull_attempts`. Defined inline as a shell function. (Or skip if Storage is unreachable — caller can't reach our Edge Functions either.)

---

## Tier gate (`enabled_for_tiers` field)

`manifest.json` skill schema gets a new optional field:

```json
{
  "id": "trade-pro-market-snapshot",
  "description_id": "...",
  "execution": "edge-function",
  "handler_ref": "edge-fn:market-snapshot-handler",
  "tier": "pro",                            // backward-compat (deprecate?)
  "enabled_for_tiers": ["pro", "studio"]   // NEW — auth gate at boot
}
```

**Backward compat:** when `enabled_for_tiers` is absent, fall back to interpreting `tier` as "this tier and above" (the existing semantic from 2E-1). When both present, `enabled_for_tiers` wins.

**Manifest validator update:** allow `enabled_for_tiers` as an optional array of `WORKFLOW_TIERS`. Test that boot-time tier filter respects it.

**Tier upgrade flow** (Phase 2E-2 acceptance criterion):
1. Customer in DB → tier flips from `starter` to `pro` (today: webhook from Xendit on subscription upgrade; Phase 2E-2 doesn't ship the upgrade flow itself, just its reception).
2. Hermes restart triggered (via `systemctl restart hermes-agent` over SSH from a small admin tool, or scheduled nightly restart).
3. `weuseai-bundle-pull` runs `ExecStartPre`, sees newer/same version installed, skips pull.
4. Hermes loads skills — but boot script ALSO updates which SKILL.md files are symlinked into `~/.hermes/skills/` based on the new tier.
5. Pro-tier skills now active.

The "tier flip → instant" UX win requires the boot script to re-evaluate tier every boot. It already reads `WEUSEAI_TIER` from .env each time. So we need .env to be updated when tier flips. Cleanest: a small Edge Function `customer-tier-bump` (Phase 2E-3, not 2E-2) that SSHes in and updates .env + restarts Hermes. For 2E-2, document this as a manual operation: founder SSHes in, edits .env, restarts.

---

## Self-extension Level 1 (locked from founder Q3)

The 4 levels in the spec doc, but **only L1 in 2E-2:**

| Level | Scope | Phase |
|---|---|---|
| **L1** | Customer-grown skills/templates persist to `/var/lib/weuseai/customer-grown/` ONLY. Zero platform visibility. | 2E-2 ✓ |
| L2 | Aggregate analytics opt-in (kind/count only, no content) | Phase 3+ |
| L3 | Per-template explicit share opt-in | Phase 3+ |
| L4 | Auto-share (probably never default) | Phase 3+ |

**L1 implementation (already in extend-capabilities SKILL.md, just needs E2E verification):**

```
/var/lib/weuseai/customer-grown/
├── templates/                         # generated by extend-capabilities
│   └── <slug>.<ext>
├── skills/                            # Phase 2E-2 reserves; not used yet
└── extension-log.jsonl                # append-only audit (local only)
```

**E2E test** (acceptance criterion):
1. Live VPS provisioned with bundle.
2. Send chat: "Bikin SKDU buat usaha aku."
3. Verify Doc Expert agent confirms with customer (extension consent).
4. Send chat: "Boleh, coba aja."
5. Verify `/var/lib/weuseai/customer-grown/templates/skdu-letter.md` exists on VPS (SSH to verify).
6. Verify `/var/lib/weuseai/customer-grown/extension-log.jsonl` has one new line with the request metadata.
7. Send chat (in same session): "Bikin SKDU lagi buat klien lain."
8. Verify response time is faster (template cached) — agent should reuse the existing template, not regenerate.

---

## Live VPS smoke test plan

End-to-end: provision a real VPS via existing `services/test-idcloudhost` infrastructure + customer-flow path, run smoke test, tear down.

**Test customer:** spin a new dedicated test customer specifically for 2E-2 smoke. Email pattern `phase2e2-smoke+<YYYYMMDD>@weuseai.example`. Mark via email pattern recognition (no schema change needed). Tear down after smoke passes.

**Smoke script** lives at `tests/_e2e-bundle-pull-smoke.mts` (mirroring `tests/_e2e-ssh-real.mts` from Phase 1). Marked with leading underscore so it's not picked up by `npm test` — runs only when explicitly invoked:

```sh
# Manual run only — provisions a real VPS, costs ~$0.05, takes ~10 min
SUPABASE_URL=$STAGING_URL \
SUPABASE_SERVICE_ROLE_KEY=$STAGING_SERVICE_KEY \
IDCLOUDHOST_API_KEY=$IDCH_KEY \
  tsx tests/_e2e-bundle-pull-smoke.mts
```

**Smoke steps:**
1. Insert test customer + subscription (`tier: pro`, `status: active`) → returns `cid`.
2. Tar agent-packs/doc-expert + agent-packs/_shared → upload via `bundle-publish` for version `1.0.0`.
3. Spawn IDCloudHost VPS via existing flow.
4. SSH in, build setup-script with bootstrap `bundleTarBase64` + `agentSlug=doc-expert` + `bundleVersion=1.0.0` + `tier=pro`.
5. Wait for Hermes boot + bundle-pull to complete (poll `/var/lib/weuseai/bundle/doc-expert/1.0.0/.installed-version` over SSH, max 5 min).
6. Send chat via Telegram bot: "Bikin invoice 3jt buat PT Maju, due 21 Mei."
7. Wait for Telegram reply (max 60s).
8. Assertion: reply contains a signed URL to an HTML invoice + line about "PT Maju" + "Rp 3.000.000".
9. Curl the signed URL → verify HTML contains `weuseai.agent` brand mark + `PT Maju` + `Rp 3.000.000`.
10. Tear down: delete VPS, delete test customer, delete `bundle_pull_attempts` rows for this CID.

**Cleanup safety:** if smoke fails between steps 3-8, the VPS sticks around. Add a TTL cleanup script (`scripts/cleanup-stale-test-vps.ts`) that deletes any VPS older than 1 day with email matching `phase2e2-smoke+*@weuseai.example`. Run weekly via cron OR manually before each smoke run.

---

## Open questions resolved

### Q1: Bundle storage layout — `bundles/<slug>/<version>.tar.gz`

Recommendation: **slug-prefixed flat tarballs**. Path format `bundles/<agent-slug>/<semver>.tar.gz`.

Rationale:
- Single-download (one HTTP) at the VPS, atomic extract.
- Slug prefix lets us list "all versions of doc-expert" cleanly (`supabase storage ls bundles/doc-expert/`).
- Per-version tarball means cache invalidation is per-version (CDN respects this).
- Alternative `bundles/<slug>-<version>.tar.gz` works but the slug-prefix nesting is cleaner for listing/management.
- Alternative nested-files-per-version is rejected: more roundtrips, no real gain at our 5MB-per-bundle scale.

### Q2: Bootstrap embed format — separate file + base64 at customer-flow

Recommendation: **pre-build at CI/CD time, base64 at provision time.**

Rationale:
- Keeps `setup-script.ts` clean of large embedded strings.
- Bootstrap is a versioned artifact (`agent-packs/_bootstrap-bundle.tar.gz`) that's drift-tested against canonical source files.
- `customer-flow.ts` reads the file from disk at provision time, base64-encodes, passes through `buildSetupScript()`.
- Future variations (per-tier bootstrap, A/B testing) easier to manage as separate files than as inline strings.
- CI step `tsx scripts/build-bootstrap-bundle.ts` is the source of truth.

### Q3: Hermes boot script ownership — `services/provisioning/src/bundle-pull-script.ts`

Recommendation: **own it the same way we own `setup-script.ts`** — generator function in `services/provisioning/src/bundle-pull-script.ts`, called by `setup-script.ts` to inline the script content into the VPS install.

Rationale:
- Mirrors existing pattern (setup-script.ts).
- Lives in provisioning service, not in agent-packs/ (it's infra concern, not persona-specific).
- Generated content is a bash script written to `/usr/local/bin/weuseai-bundle-pull` at provision time.
- Hermes systemd unit gets `ExecStartPre=` directive added by setup-script.
- Tests: `tests/bundle-pull-script.spec.ts` covers script-generation invariants (env vars referenced, retry logic present, idempotent gate works).

### Q4: Smoke test infra — dedicated test customer + IDCloudHost spin/tear, leveraging existing patterns

Recommendation: **new dedicated test customer per smoke run**, using the existing `services/test-idcloudhost` provisioning pattern, with TTL cleanup as a safety net.

Rationale:
- Matches Phase 1 `tests/_e2e-ssh-real.mts` pattern — proven.
- Email pattern `phase2e2-smoke+<YYYYMMDD>@weuseai.example` makes cleanup script trivial.
- TTL cleanup script (`scripts/cleanup-stale-test-vps.ts`) deletes any VPS+customer older than 1 day matching the pattern. Safe to run automatically.
- Dedicated customer avoids polluting the real customers table or the founder's own account.

### Q5: Failure telemetry — `bundle_pull_attempts` table

Recommendation: **YES, add the table** as specified in the schema migration above.

Rationale:
- 1 row per pull attempt (success or fail) is cheap (low write volume).
- Enables per-customer reliability dashboard (Phase 3 work).
- Enables fleet-wide failure rate alerting (e.g. "Storage outage caused 30% pull failures in last hour").
- Cost: negligible (~1 row per Hermes boot, ~10-100 rows per customer per month).

---

## Scope boundaries

### IN SCOPE (Phase 2E-2)

- [ ] Schema migration: `customers.bundle_versions` + `customers.bundle_update_policy` + `bundle_pull_attempts` table
- [ ] Edge Function: `bundle-publish` (admin-only, idempotent upload)
- [ ] Edge Function: `bundle-fetch` (customer-authenticated, returns signed URL)
- [ ] Edge Function: `bundle-pull-record` (customer-side telemetry POST)
- [ ] `customer-flow.ts` wiring: tar agent-pack/<slug>/ + agent-pack/_shared/, POST to bundle-publish, then provision with bootstrap
- [ ] `services/provisioning/src/build-bootstrap-bundle.ts` build script + CI step
- [ ] `services/provisioning/src/bundle-pull-script.ts` boot-script generator
- [ ] `setup-script.ts` enhancement: install `/usr/local/bin/weuseai-bundle-pull` + Hermes systemd `ExecStartPre`
- [ ] `enabled_for_tiers` field added to manifest schema + validator + boot-script tier filter
- [ ] Self-extension L1: end-to-end test verifying persistence across boots
- [ ] Live VPS smoke test: real provision → real chat → real workflow-execute → real reply
- [ ] Tests:
  - bundle-publish/fetch handler tests
  - bundle-pull-script generation tests
  - Bootstrap drift tests (tar content matches canonical files)
  - Tier-gate filter tests
  - bundle_pull_attempts row insertion tests
- [ ] Docs: README + demo updated with the new flow

### OUT OF SCOPE (deferred per founder direction)

- PDF rendering → Phase 2E-3 (separate spec, separate branch)
- Bundle expansion to 4+ agents → Phase 2E-4 (parallel-able)
- Auto-update background job → Phase 2E-5
- Privacy levels 2-4 → Phase 3+
- Bundle versioning UI in dashboard → Phase 3+
- Staged bundle update mode → Phase 3+
- `customer-tier-bump` Edge Function (instant tier upgrade) → Phase 2E-3 (depends on Xendit upgrade webhook)

---

## Acceptance criteria

- [ ] New customer registration → `customer-flow.ts` uploads bundle to Storage automatically (verified via storage ls)
- [ ] Provisioning script delivers minimal bootstrap to VPS in critical path (~50KB embed); customer chat works second 1 even if Storage unreachable
- [ ] Hermes first boot → `weuseai-bundle-pull` runs as `ExecStartPre`, pulls full bundle from Storage, installs to `~/.hermes/skills/`, registers skills
- [ ] Storage unreachable on boot → customer keeps minimal bootstrap, `bundle_pull_attempts` row inserted with `status='storage_unavailable'`, retries on next boot, doesn't fail provisioning
- [ ] Tier-gated skills only register if `enabled_for_tiers` includes customer tier (verified via Hermes log + manifest inspection)
- [ ] Tier upgrade simulation: manually flip customer.tier, restart Hermes, verify previously-disabled skills now active
- [ ] `extend-capabilities` skill creates new SKILL.md/template, persists to `/var/lib/weuseai/customer-grown/`, audit log appended, survives reboot
- [ ] Live smoke test on dedicated test VPS: chat "bikin invoice 3jt PT Maju" → invoice-generator skill invoked → workflow-execute called → HTML returned → delivered back via Telegram
- [ ] Schema migration applied to staging Supabase
- [ ] Tests: ~30 new (handler tests, generator tests, drift tests, tier-gate tests, telemetry tests)
- [ ] `npm run typecheck:all` clean
- [ ] PR description includes reliability notes (failure modes + fallbacks)

---

## Phase boundaries

| Phase | Scope | Status |
|---|---|---|
| **2E-2** (this branch) | Bundle delivery + Hermes boot script + tier gate + self-extension L1 + live VPS smoke | Drafting |
| **2E-3** | PDF rendering (separate renderer-choice spec) + `customer-tier-bump` instant upgrade flow | Pending |
| **2E-4** | Bundle expansion (Slide Master, Trade Pro, Web Master, Macro Strategist, Business Director) — parallel-able | Pending |
| **2E-5** | Auto-update background job (nightly poll for new bundle versions per `latest`-policy customers) | Pending |
| **Phase 3+** | Privacy levels 2-4 + dashboard UI + staged update mode | Pending |

---

## Estimated work breakdown

5 days end-to-end, matching founder's estimate:

| Day | Deliverables |
|---|---|
| **Day 1** | Schema migration + bundle-publish + bundle-fetch Edge Functions + bundle-pull-record + handler tests |
| **Day 2** | `customer-flow.ts` wiring + `build-bootstrap-bundle.ts` + bootstrap drift test + setup-script bootstrap embed |
| **Day 3** | `bundle-pull-script.ts` generator + tier-gate filter + manifest validator update + boot script tests |
| **Day 4** | Self-extension L1 verification + live VPS smoke test infra + smoke test execution |
| **Day 5** | Polish + cleanup script + docs update + PR open |

**Mid-phase checkpoint after Day 3** — bootstrap + boot script + tier-gate working in isolation (handler-level tests pass; no live VPS yet). Ping for review before Days 4-5.

---

## Open questions for founder review (small, locking before implementation)

The 4 founder positions are locked. The 5 open questions I've recommended answers for above are mostly mechanical; flag if any feel wrong:

| # | My recommendation | Confirm? |
|---|---|---|
| Q1 | `bundles/<slug>/<version>.tar.gz` (slug-prefixed flat tarballs) | □ |
| Q2 | Pre-built `agent-packs/_bootstrap-bundle.tar.gz` + base64 at provision time | □ |
| Q3 | `services/provisioning/src/bundle-pull-script.ts` generator (mirrors setup-script.ts) | □ |
| Q4 | Dedicated test customer per smoke run, IDCloudHost spin/tear, TTL cleanup | □ |
| Q5 | `bundle_pull_attempts` table (1 row per attempt) | □ |

Reply with "all picks" or specific overrides.

---

*Last updated: 2026-05-08 by Claude (Phase 2E-2 spec draft)*
