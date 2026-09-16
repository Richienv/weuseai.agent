# Auto-suspend: status, the landmine I fixed, and 3 decisions for you

**Date:** 2026-07-27 · **Author:** Claude (while founder did Xendit KYC)
**Scope:** the "Auto-pause kalau nggak aktif >30 hari" promise on checkout + the `survival mechanism` in CLAUDE.md.

---

## TL;DR (baca ini aja kalau buru-buru)

Auto-suspend **bukan fitur baru** — udah kebangun full sejak 2026-06-07 sebagai **Fleet Sentinel**
(pg_cron tiap 15 menit → edge fn → Fly `/suspend` → Vultr halt). Tapi dia **rusak 3 cara**, dan
satu di antaranya bahaya. Aku udah **benerin yang bahaya + bikin aman-by-default** (2 file, ada
test). Sisanya **2 keputusan bisnis + 1 keputusan copy** yang aku nggak boleh ambil sendiri.

| # | Masalah | Status |
|---|---------|--------|
| 1 | **Landmine**: bisa suspend pelanggan yang aktif tiap hari cuma karena VPS-nya >30 hari | ✅ **FIXED + di-test** (aman sekarang) |
| 2 | **Halt Vultr nggak ngehemat uang** — tetap dibilling full rate | ⚠️ **keputusan kamu** (business model) |
| 3 | **Sinyal aktivitas nggak pernah ditulis** — `last_activity_at` zero writers | ⚠️ **keputusan kamu** (butuh hook di VPS) |
| 4 | Checkout janji "auto-pause" sebagai fitur yang UDAH jalan | ⚠️ **keputusan copy kamu** |

Bottom line: fitur ini **dark + sekarang aman** (dry-run by default, nggak bakal halt siapa-siapa).
Nggak ada yang urgent hari ini (0 pelanggan real, semua Vultr instance udah dihapus). Tapi 2 & 3
harus dijawab sebelum auto-suspend dinyalain beneran.

---

## 1. The landmine — FIXED ✅

**What it was:** `fleet-sentinel-handler.ts:157` computed idle time as
`ageMs(last_activity_at) ?? ageMs(created_at)`. Since `last_activity_at` is **never written by
anything** (grep: zero writers across the whole repo), it's always `null`, so idle **always** fell
back to `created_at` = age since the box was provisioned.

Result: any `running` + `active` + non-Always-On VPS provisioned ≥30 days ago would be **suspended
— even if the customer messaged their bot every single day.** The most destructive action (halting
the box) had the *weakest* guard, while a mere alert (`dead_agent`, line 293) correctly required
`last_activity_at !== null`.

Why it hasn't bitten yet: the cron is dark (needs founder GUCs `app.fleet_sentinel_url/token`), and
there are 0 real customers with a >30-day box right now. It's a **latent** trap that fires the day a
real customer's VPS turns 30 days old.

**The fix (2 changes, on `main`, NOT deployed — you merge):**

1. `supabase/functions/_shared/fleet-sentinel-handler.ts` — idle is now measured **only** from real
   recorded activity. Null activity → idle is *unknown* → never suspend, never resume. `created_at`
   still drives orphan detection (alert-only), where it's correct.
2. `supabase/functions/fleet-sentinel/index.ts` — `FLEET_SENTINEL_DRY_RUN` now **defaults to `true`**
   (alert-only). Only an explicit `=false` gives the loop teeth. This matches the migration's own
   "recommended first run" note, which the code previously contradicted (`?? 'false'`).

Regression tests added in `tests/fleet-sentinel-handler.spec.ts`: old 90d box active-today → no
suspend; null-activity box → no suspend; suspended+null → no resume. **21/21 green.**

---

## 2. Halt doesn't save money — YOUR DECISION ⚠️ (this is the big one)

The suspend path calls Vultr `POST /instances/{id}/halt` (`vultr-vps.ts:175`). **A halted Vultr
instance still bills at the full plan rate.** Only `DESTROY` stops compute billing. There is **no
snapshot / restore method anywhere** in the provider layer.

So the economic premise the business model rests on is false:
- CLAUDE.md → *"Auto-suspend … cost drop dari Rp 145k → Rp 17k/bulan storage-only"* — **not true** as built.
- The spec (`docs/specs/2026-06-07-fable5-10x-build-spec.md`) states halt = storage-only billing — **wrong.**

**Options (pick one — I recommend C for now, A later):**

- **A — Snapshot + destroy + restore-on-return** (real savings). Needs: a new `snapshot()`/
  `createFromSnapshot()` primitive in `vultr-vps.ts` + `IVPSProvider`, a `snapshot_id` column, and a
  **new-IP re-wire** (a restored box gets a new IP + instance id, breaking every stored
  `vps_instances.ip_address` + SSH-by-IP path). This is real infra I **cannot test from the Mac**
  (Vultr key is IP-allowlisted; snapshot pricing/retention unverified on your account). Don't ship blind.
- **B — Destroy + reprovision-on-return** (simpler, ~5-min cold start on return, loses box state).
- **C — Accept the ~$5/mo and change the promise** (fastest, honest). Keep "pause from dashboard"
  (stop billing by canceling), drop the "auto-pause saves cost" framing until A is built.
- **D — Move idle boxes to a cheaper plan** — Vultr has no cheap "hibernate" tier; not really viable.

My recommendation: **C now** (make copy honest, no infra risk), **A as a funded follow-up** once you
can verify Vultr snapshot behavior + pricing on a live box with me.

---

## 3. The activity signal isn't wired — YOUR DECISION ⚠️

Even with the landmine fixed, auto-suspend **can't work correctly** until something writes
`last_activity_at`. And the hard part: the **primary channel is invisible to us**. After
onboarding, Hermes long-polls Telegram `getUpdates` **on the VPS** (the webhook is deleted), so
customer messages never touch Supabase. A customer active only on Telegram would look 100% idle to
the control plane.

To make suspend correct we'd need:
- a **VPS-side activity hook** (Hermes inbound-message → `POST /stamp-activity`) — the majority
  signal; needs a `setup-script` change + **real-VPS verification** (your infra), and
- control-plane stamps for the minority channels (dashboard chat `agent-chat-relay`, proxy usage),
  which I *can* build + unit-test from here.
- **Resume must be control-plane-driven** — a suspended box is off and can't emit anything.

Decision: do you want me to build the receiving end now (`stamp-activity` endpoint + the 2
control-plane stamps + tests), leaving only the VPS-side Telegram hook for a real-VPS session? Or
hold the whole thing until #2 is decided (since if you pick C, auto-suspend stays parked anyway)?
I lean **hold until #2** — building the signal before we know whether we even want halt-based
suspend risks building the wrong thing.

---

## 4. Honesty: the checkout copy — YOUR CALL ⚠️

`checkout.html` asserts, on a **pay page** that explicitly commits (its own comment, line ~578) to
"every line here is a capability that already ships":
- `:550` "Auto-pause kalau nggak aktif >30 hari."
- `:561/:573` "skip auto-suspend"
- `:598` "Hosting auto-pause kalau kamu nggak aktif >30 hari"

As built, auto-pause doesn't reliably work (broken signal) and doesn't save cost (halt). That's a
false present-tense claim under our honesty locks. `index.html:1369` is fine — it only says "Bisa
pause kapan saja" (true: manual pause from dashboard exists).

Because it's marketing copy on the paid flow, I'm **not rewriting it unilaterally** (CLAUDE.md:
brand/pricing copy is founder-gated). Proposed minimal honest reword, your approval:
> "Pause kapan saja dari dashboard — nggak kepakai, nggak usah bayar." (drops the auto/>30-day claim)

---

## What I deliberately did NOT do

- Did **not** build Vultr snapshot/destroy/restore — untestable from the Mac, and #2 is your call.
- Did **not** wire a partial activity signal then leave suspend keyed on it — that's the exact
  half-built shape that created the landmine.
- Did **not** merge — these are edge-fn changes that auto-deploy on merge to `main`. You merge with
  the dry-run context in hand.
- Did **not** edit the checkout marketing copy.

## Recommended next steps

1. You merge the 2-file safety fix (it's pure de-risking; safe-by-default). I can open the PR.
2. You decide #2 (economics). If **C**, I do #4 copy reword + we park auto-suspend, done.
3. If **A/B**, we schedule a real-VPS session (your Vultr access) to build + verify snapshot/restore,
   and I build the activity signal in parallel.
