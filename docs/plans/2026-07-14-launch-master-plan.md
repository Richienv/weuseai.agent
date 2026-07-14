# LAUNCH MASTER PLAN — merge train → leak fix → rotation → chat → hardening (2026-07-14)

The complete end-to-end path from today's state to launched-and-hardened. Written for a Claude Code session executing with founder (Richie) checkpoints. Repo: `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah`. Read `CLAUDE.md` + `MEMORY.md` first. Supabase CLI is authed (project `gtjgsligllbjcisiyrah` linked); `gh` is authed; **`fly` CLI is NOT installed** (Phase 3 installs it).

**Ground rules:** one phase at a time, verify before advancing; STOP + report at any ✋ founder gate or on any unexpected state; never force-push; every merge is squash-merge unless noted; after any main merge remember **main auto-deploys the landing to weuseai.id via Vercel** (supabase functions do NOT auto-deploy — they are already deployed from branches; merging just aligns main).

---

## PHASE 0 — Preflight (10 min, read-only)

1. `git fetch --all --prune`. Confirm open PRs match this table (state drift = re-plan):

| PR | Branch | State (2026-07-14) | Action in this plan |
|---|---|---|---|
| #50 | infra/gitignore-observability-secret | +4/-0, trivial | MERGE (step 2.1) |
| #102 | sesi-r/indonesian-integrations | +4409, stale since May | CLOSE w/ note (2.7) |
| #264 | security/bundle-fetch-xcid | MERGEABLE | MERGE (2.2) |
| #272 | fix/checkout-cors-stale-deploy | superseded by #276 | CLOSE w/ note (2.7) |
| #273 | chore/weuseai-shipping-skill | dev tooling | ✋ founder keep/close (2.7) |
| #274 | landing/enhance-conversion | fully contained in #275 (verified ancestor) | CLOSE after #275 merges (4.4) |
| #275 | landing/redesign-konten-port | new landing+checkout+docs | ✋ Phase 4 gate |
| #276 | fix/payment-cors-chain | payment fixes, ALREADY LIVE in prod | MERGE (2.3) |
| #278 | feat/dashboard-chat-live | chat tier-gate+wiring, deployed dark | MERGE (2.5) |
| (none) | fix/provision-recovery-chain | NO PR YET — the VM-reap fix | PR + MERGE (2.4) |

2. Verify prod healthy: create-invoice returns 200 + invoice_url (test body, plan=bare); retry cron `succeeded` in `cron.job_run_details` (jobid 3); `curl -s https://www.weuseai.id` → 200.
3. Tests green baseline: `npm test` (expect ≈2354 pass / 0 fail).

## PHASE 1 — Stop the money leak (Vultr) ✋ founder, 5 min

1. Founder: my.vultr.com → Products → Instances → **Destroy** the June-3 orphan (ID starts `28bf02cf`) and ANYTHING else listed (nothing legitimate is running — DB truth: 0 running). Then Billing → Payment History: note actual charged amounts.
2. Optional deeper audit (recommended once): founder adds the current Mac IP to the Vultr API key ACL (Account → API) → Claude runs the full audit (instances, snapshots, blocks, reserved-ips, billing history — raw HTTP status checked first; a 401 parses as an empty list, see memory `vultr-orphan-billing-2026-07-14`) → founder removes the IP.
3. DB junk already cleaned (2026-07-14): test subs canceled; honest active count = 2 (renita + richiebot). If founder wants those 2 excluded from the public counter too, decide here (they're validation bots, not paying customers) — affects the scarcity counter + the 799→999 flip base.

## PHASE 2 — The merge train (main becomes truthful)

Order matters. After EACH merge: `git checkout main && git pull`, run `npm test`, and confirm Vercel deploy is green before the next.

- **2.1 — #50** (gitignore, 4 lines): squash-merge. Zero risk.
- **2.2 — #264** (security: bundle-fetch per-customer HMAC binding, H2/H3 IDOR): re-read the diff, confirm the regression tests in it pass (`npx tsx --test` on its spec files), squash-merge, then **redeploy** `supabase functions deploy bundle-fetch --project-ref gtjgsligllbjcisiyrah` (this one is NOT yet live — it merges then deploys, unlike #276).
- **2.3 — #276** (payment: cors allowlist, constraint migration, try/catch, retry RPC, price-flip, rotation runbook): already running in prod — merging aligns main. Squash-merge. No redeploy needed. NOTE: after this, main's `_shared/cors.ts` is current — the branch-bundling deploy gotcha disappears.
- **2.4 — recovery-chain** (the VM-reap): `git checkout fix/provision-recovery-chain && git rebase origin/main`. Expected conflicts ONLY in `scripts/deploy-all.sh` + `supabase/functions/retry-pending-provisions/index.ts` (both sides carry the same RPC fix) — **resolve keeping main's (#276's) versions of those two files**; the branch's unique value is `services/provisioning/src/customer-flow.ts` (reap on failure) + shared retry module + tests. Run `npm test` + `cd services/provisioning && npx tsc --noEmit`. Push, `gh pr create` (title: "[provisioning] reap failed VMs + recovery chain hardening"), squash-merge. **Takes effect only after the Phase-3 Fly deploy.**
- **2.5 — #278** (dashboard chat): cors.ts content identical to merged main → clean. Squash-merge. Already deployed; stays dark until Phase 6.
- **2.6 — re-verify**: full `npm test` on main; live create-invoice check again (deployments unchanged, this is belt-and-braces).
- **2.7 — hygiene**: close #272 ("superseded by #276, which is merged + deployed"), close #102 ("stale cascade from May — reopen from fresh main if revived"), ✋ founder: keep or close #273 (a shipping skill — harmless to keep open).

## PHASE 3 — Fly deploy (makes the reap real) ✋ founder for auth

1. Install: `brew install flyctl`. Auth: `fly auth login` (browser — founder). 
2. From `services/provisioning`: `fly deploy -a weuseai-provisioning` (main now contains the reap). Watch build; the app is min=0 so a cold start after deploy is normal.
3. Verify: `curl -s https://weuseai-provisioning.fly.dev/health` → 200; `fly logs -a weuseai-provisioning` clean.
4. **Regression re-run:** `npm run smoke:chain:deployed` (~8 min, ~1¢) — must repeat the 2026-07-07 FULL PASS (all 16 stages). This proves the reap deploy broke nothing in the live chain.
5. While authed, set the chat flag for Phase 6: `fly secrets set AGENT_CHAT_ENABLED=true -a weuseai-provisioning` (harmless while the edge flag stays off).

## PHASE 4 — Landing decision gate (#275) ✋ founder

The landing branch is the Konten design as index.html + the design checkout as checkout-new.html + marketing doc. Merging = **instantly live on weuseai.id**.

1. ✋ Founder decides the honesty items (marketing team flagged Meta/TikTok ad-ban risk): (a) replace hardcoded "363/500" + MM:SS countdown with the real `/api/public/subscription-count` (renders nothing on failure); (b) drop "Akurat 99%" + "Rp 34jt GRATIS"; keep the honest 799→999-after-1000 line. RECOMMENDED: yes to all — required before any paid campaign.
2. Apply the decided edits on the branch (+ fix the stepper "Lima menit" → "~8 menit" — the measured figure; keep gates green: `npx tsx --test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts` on THAT branch).
3. Full-page Playwright verify (restart `python3 -m http.server 88xx` from repo root first — the curl false-pass gotcha) at 1440+390: 0 console errors; DOM-assert the 4 pricing CTAs (`?plan=solo/voice-starter/library-full/done-for-you`).
4. Squash-merge #275 → **watch the Vercel production deploy** → smoke live: weuseai.id renders the new landing, checkout flow creates a (test) invoice from the LIVE site. Then close #274 ("contained in #275").
5. The design checkout (`checkout-new.html`) stays a preview — do NOT swap over `checkout.html` (66 audit tests guard the live one); that swap is post-launch work.

## PHASE 5 — Xendit production ✋ founder-gated by KYC

1. When the Individual (perorangan) account is approved (Cowork track): collect the LIVE `xnd_production_` secret key + LIVE webhook verification token; set the LIVE invoices callback to `https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/xendit-webhook`.
2. Run `bash scripts/rotate-xendit-prod.sh` (in repo, merged via #276) with the two env vars — it sets secrets, redeploys create-invoice + xendit-webhook, and fails loudly if invoices still come from `checkout-staging.xendit.co`.
3. **First real payment** (founder pays Bare ≈ Rp 199rb from the live site) — watch within 15 min: Xendit PAID → webhook 200 (this is the FIRST-ever prod-mode signature validation — if it 401s, the webhook token is wrong-mode) → provision → Telegram greet. Claude tails Supabase function logs + DB rows live during this.
4. If the webhook signature fails: do NOT retry-pay; fix the token, then replay via the synthetic-paid path the smoke harness uses.

## PHASE 6 — Dashboard chat go-live (the Siap Pakai feature)

Blocker (memory `dashboard-chat-live-2026-07-04`): **nothing writes `vps_instances.api_server_key_cipher`** — the relay fail-closes for every customer.

1. Build key-minting into provisioning: in `setup-script.ts`, enable the Hermes API server (:8642) with a generated key (check upstream hermes-agent docs for the config knob — `api_server` section of config.yaml; shape-independent edit per the LOCKED config rules); return the key from the setup flow; encrypt with `CHAT_KEY_ENCRYPTION_KEY` (see `integration-credential-crypto.ts`) and store to `api_server_key_cipher`. Confirm `CHAT_KEY_ENCRYPTION_KEY` secret exists on the edge fn (64-hex) — mint + set if missing.
2. Tests (mock SSH pattern) + `npm test`; `fly deploy`.
3. E2E: `E2E_CHAIN_HOLD_VPS=1 npm run smoke:chain:deployed` → held VPS; confirm `api_server_key_cipher` populated + :8642 answers; set edge flags `supabase secrets set AGENT_CHAT_ENABLED=true AGENT_CHAT_CID_ALLOWLIST=<held cid> --project-ref gtjgsligllbjcisiyrah` (+ redeploy agent-chat-relay); open `chat.html?cid=<held cid>` → streamed reply; verify a non-web_app tier gets the upsell card. Tear down the held VPS (`POST /tear-down`).
4. Open up: `AGENT_CHAT_ALLOW_ALL=true` (the tier gate is the real gate). Announce as the Siap Pakai differentiator.

## PHASE 7 — Hardening + growth plumbing (post-launch week)

- **7.1 Auto-suspend (P0 cost bleed):** implement the documented-but-missing lifecycle — cron marks subscriptions inactive >30d → `/suspend` (endpoint EXISTS; the caller/columns don't). Without it every idle customer costs ~$5/mo forever. Design first (1 page), founder ✋, then build + tests + fly deploy.
- **7.2 Capacity queue (before ~50 orders/day):** in-process spin-up queue (concurrency 2) in `services/provisioning/src/index.ts` per the G7 brief; or bump Fly to performance-1x.
- **7.3 Pixels (G5):** ✋ needs Meta + TikTok pixel IDs from marketing → wire base pixels + UTM passthrough + `InitiateCheckout`/`Purchase` on landing + checkout (checkout event fires on create-invoice success, purchase on the /welcome return).
- **7.4 Welcome accordion CI miss:** CI flags `#b-whats-happening` missing on the live welcome page (PR #109 content may not be live) — diagnose + fix so the daily e2e smoke goes green once Xendit is prod (its only remaining expected failure).
- **7.5 PT Perorangan follow-through** ✋ founder: certificate → NPWP badan → NIB (oss.go.id) → business bank → upgrade Xendit KYB later.

## PHASE 8 — Launch checklist (all must be true)

- [ ] main == prod (Phases 2-4 merged, Vercel green, weuseai.id serves the intended landing)
- [ ] Xendit LIVE + first real payment validated end-to-end (Phase 5)
- [ ] Recovery: retry cron green AND reap deployed (a killed mid-provision test run deletes its VM)
- [ ] No orphan Vultr instances; billing understood (Phase 1)
- [ ] Honest numbers: real scarcity counter, no fabricated stats, "~8 menit", counter base decided
- [ ] Pixels firing (7.3) before any paid campaign
- [ ] Marketing team has `docs/marketing/2026-07-01-launch-enablement.md` + the honesty boundary
- [ ] Rollback stances known: landing = revert merge commit (Vercel redeploys old); functions = redeploy previous from the pre-merge SHA; Fly = `fly releases` + `fly deploy --image <prev>`.
