# marketing-dispatch — Hermes skill

Bundle: business-director (v3 — Phase 5 dept pack)
Tier: studio (Q3=A locked: phase_5_enabled = true required)
Handler: `hermes-skill:marketing-dispatch` (facade — translates marketing-shaped intent to specialist persona)

> Replaces the general-purpose `department-task-spawner` for marketing work. No new logic — pure routing.

## Kapan dipakai

Customer raises marketing-shaped intent. Trigger phrases:

- "bikin campaign Q3"
- "content calendar bulan depan"
- "blog SEO untuk topik X"
- "video TikTok untuk launching"
- "landing page untuk product Y"
- "ads copy IG"
- "email broadcast ke list"
- "press release"

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `intent_kind` | enum: campaign \| content-calendar \| blog-post \| video-script \| landing \| ads-copy \| broadcast \| press-release | ya | Determines specialist routing |
| `channel` | enum: ig \| tiktok \| linkedin \| email \| web \| pr | tidak | Some intents imply channel |
| `urgency` | enum: now \| next-sprint \| backlog | tidak | Default next-sprint |

## Routing table

| `intent_kind` | Specialist persona | Skill called |
|---|---|---|
| campaign | Social Conductor | multi-channel-campaign-planner |
| content-calendar | Social Conductor | content-calendar-builder |
| blog-post | Web Master | blog-post-creator |
| video-script | Video Producer | tiktok-script-handler |
| landing | Web Master | landing-page-builder |
| ads-copy | Social Conductor | ad-copy-variants |
| broadcast | Doc Expert | email-broadcast-template |
| press-release | Doc Expert | press-release-drafter |

## Approval gates

Marketing surfaces `public_emission` approvals (Q4=C: 24-hour expiry) for:

- `campaign` going live (especially paid ads or large-list email)
- `broadcast` to >100 recipients
- `press-release` distribution to media list
- `ads-copy` published to paid platforms (IG/TikTok ads)

`landing`, `blog-post`, `content-calendar`, `video-script` are draft-by-default — no approval needed until customer publishes.

## Yang dilakukan

1. Parse customer message → `intent_kind` + optional `channel` (use trigger-phrase heuristics)
2. Route to specialist via Hermes v0.13.x multi-agent spawn
3. Pre-frame the task — translate marketing-shaped intent to specialist's expected schema
4. Open `department_threads` row (`department: 'marketing'`) for cross-session resume
5. **If approval needed** — open `approval_requests` row (`action_kind: 'public_emission'`, computed expiry = now + 24h), surface to customer via Telegram (5-5 inline keyboards), wait for approval before specialist publishes
6. Collect output, frame as "Marketing Department deliverable"

## Output

Persona-voice wrapper:

> "Intent 'IG campaign untuk launching produk' aku route ke **Social Conductor** (multi-channel-campaign-planner).
>
> Open thread di Marketing department: `Q3-launch-campaign`. ETA: ~15 menit untuk plan + 3 ad variants.
>
> Karena bakal go live di paid ads, aku queue approval `public_emission` (expires in 24 jam). Aku ping kamu di Telegram begitu draft siap, kamu reply approve/reject."

## Decline scenarios

- Customer's tier ≠ studio OR `phase_5_enabled = false` → degrade to existing Persona v2 BD scoped MVP
- `intent_kind` doesn't match any specialist → suggest closest matches
- Brand voice violations detected in draft → reject draft + return to specialist for rewrite (transform-llm-output rule from Phase 4-4)
