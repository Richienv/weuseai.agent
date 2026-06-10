# Runbook — Persona Genesis + Pagi Briefing

What it is: a done-for-you/enterprise customer describes their work over
Telegram (`/bikin-persona`, five questions in Bahasa) and the system
generates a bespoke persona — SOUL.md + 7-9 skills + 5-7 templates +
playbook — validates it against the same gates as the curated library,
publishes it through the existing bundle pipeline, and restarts their agent
with the new identity. Pagi Briefing: every new provision gets a real
07:00 WIB personalized morning briefing cron + an 18:00 WIB end-of-day
summary (replacing the generic news cron).

Spec: `docs/specs/2026-06-10-mission2-build-spec.md`.

## Deploy (founder or any secrets-bearing session)

1. **Migration:** apply `supabase/migrations/20260610010000_persona_genesis.sql`
   via the Mgmt API (creates `custom_personas`).
2. **Secrets:** set `DEEPSEEK_API_KEY` as a Supabase Edge Function secret —
   the same business key the Cloudflare proxy uses (new location, not a new
   credential): `supabase secrets set DEEPSEEK_API_KEY=sk-…`
3. **Edge Functions:**
   `supabase functions deploy persona-genesis`
   `supabase functions deploy bundle-fetch`   (custom-slug path)
4. **Provisioning (Fly):** redeploy via `deploy-provisioning.yml` — ships
   the Pagi Briefing/EOD crons, the `/bikin-persona` skill install, the
   genesis URL env line, AND the bundle-pull v2 script (canonical-tier
   filter fix + custom-persona pull).
5. **Existing fleet note:** VPSes provisioned before this deploy have the
   v1 pull script + the old news cron baked in. They heal on re-provision;
   for in-place rollout, SSH-push `/usr/local/bin/weuseai-bundle-pull`
   regenerated from `buildBundlePullScript()` + re-run the two
   `hermes cron add` lines from setup-script. (Small fleet today — judgment
   call whether to bother before the next reprovision cycle.)

## Real-VPS verification (the step this build is waiting on)

The full chain is verified locally (mock LLM + in-memory storage +
real validator/packager/fetch gates — `tests/persona-genesis-chain.spec.ts`).
What is NOT yet verified is the live path. Procedure (~20 min):

1. Provision a throwaway **done-for-you** customer via the admin form
   (real Vultr box, your own test bot token).
2. Confirm the halo ping arrives, then `/start`.
3. Run the demo script below. Watch:
   - Supabase logs for `persona-genesis` (3 DeepSeek calls)
   - `custom_personas` row → `active`
   - Storage: `bundles/custom-<cid>/1.0.0.tar.gz`
   - VPS `/var/log/weuseai-bundle-pull.log` → "Custom persona found"
   - `~/.hermes/skills/` → the generated skill dirs
4. Next morning 07:00 WIB (or `hermes cron run` manually): Pagi Briefing
   arrives unprompted, in the new persona's voice.
5. Tear down the box.

## Demo script (sales video)

Founder's exact Telegram messages + expected behavior:

| # | You send | Agent does |
|---|----------|------------|
| 1 | `/bikin-persona` | Explains in Bahasa it will ask five questions about your work, then build you a custom persona. Asks question (a): your role. |
| 2 | `Marketing manager di startup F&B di Bandung` | Asks (b): what your days look like. |
| 3 | `Bikin kalender konten IG/TikTok, brief desainer, rekap performa ads tiap minggu` | Asks (c): what outputs you produce. |
| 4 | `Kalender konten, caption, brief kreatif, laporan mingguan buat founder` | Asks (d): your tools. |
| 5 | `Canva, Meta Ads Manager, Google Sheets, Notion` | Asks (e): what eats your time. |
| 6 | `Rekap performa mingguan makan setengah hari, dan sering kehabisan ide caption` | Summarizes your profile in 2-3 sentences, asks you to confirm. |
| 7 | `Pas. Gas.` | POSTs the profile; replies with the generation message: persona is being built, ready in a couple of minutes. (Behind the scenes: 3 DeepSeek calls, validation, publish, VPS restart.) |
| 8 | *(wait ~2 min)* `halo` | The agent answers AS the new persona — introduces itself with its generated name and your domain ("operasional marketing F&B…"), offers its new capabilities. |
| 9 | `bikinin kalender konten minggu depan, tema promo kopi susu` | Uses its generated kalender-konten skill + template: a filled weekly content calendar table, in Bahasa, no exclamation marks. |
| 10 | *(next morning, 07:00 WIB — the money shot)* | **The agent texts YOU first**: Pagi Briefing in the custom persona's voice — outstanding items from yesterday's chat, three news items relevant to F&B marketing, and "apa prioritas kamu hari ini?". No calendar/email claims. |

## Failure modes

- Generation fails validation → customer gets an honest "belum berhasil,
  coba lagi" message, `custom_personas.status='failed'`, **founder DM** with
  the full error list. Nothing ships.
- `DEEPSEEK_API_KEY` unset → every generation 502s with `llm_unconfigured`
  in the founder alert. Fail-closed.
- VPS refresh fails after publish → persona is live in Storage; installs on
  next restart; founder DM'd with the rerun command.
- Rate limits: one in-flight generation per customer; 3 generations/day.

## Tier placement (founder decision pending)

Shipped gate: done-for-you + enterprise (`GENESIS_TIERS` in
`persona-genesis-handler.ts`, mirrored in bundle-fetch, drift-pinned).
Recommendation in the spec; moving tiers is a one-line change + redeploy of
both functions. No pricing was changed.
