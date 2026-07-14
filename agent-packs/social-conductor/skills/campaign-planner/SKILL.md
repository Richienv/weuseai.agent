# campaign-planner — Hermes skill

Bundle: social-conductor (v2)
Tier: pro+
Handler: `hermes-skill:campaign-planner`

## Kapan dipakai

- "rencana launch produk"
- "campaign 4 minggu"
- "content series untuk [topic]"
- "seasonal push (Lebaran, Harbolnas, dll.)"
- "pre-launch teaser plan"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `campaign_type` | ya | enum: product-launch \| content-series \| seasonal-push \| brand-build \| audience-grow |
| `duration_weeks` | ya | 1-12 weeks typical |
| `objective` | ya | KPI primary: conversion / awareness / engagement / list-build |
| `platforms` | tidak | Default platforms dari content-calendar |
| `key_dates` | tidak | Anchor dates (launch day, sale start) |

## Yang dilakukan

Load `templates/campaign-template.md`.

Standard phases:
1. **Tease** (week 1-2 of campaign): hint, build curiosity. 2-3 post per platform.
2. **Reveal** (week 2-3): launch announcement, feature demo. Heavy posting.
3. **Reinforce** (week 3-4): social proof, testimonial, FAQ-answer content.
4. **Close** (final week): urgency, last-chance, gratitude post-mortem.

Per phase:
- Calendar entries pre-staged via content-calendar-builder
- Post drafts pre-generated via post-drafter (placeholder, refine before each slot)
- Engagement triggers (e.g., "ping-back: respond to anyone who reposts within 24h")
- KPI hook: define what data customer logs manually mid-campaign

## Output

Persona-voice wrapper untuk product-launch (4 weeks):

> "Campaign 'Launch [Produk X]' — 4 minggu, objective: 100 trial sign-ups.
>
> ### Phase 1 — Tease (Week 1)
> - **Mon TikTok**: hook video 'something coming, can you guess?'
> - **Wed LinkedIn**: long-form 'why I built [solution to common pain]'
> - **Fri TikTok**: behind-scenes, tease feature
> - Engagement: respond ke setiap guess di komen, draft personal voice.
> - KPI hook: count followers di Week 0 vs Week 1 (% growth signal).
>
> ### Phase 2 — Reveal (Week 2)
> - **Mon TikTok**: launch announcement video, hard CTA
> - **Tue X thread**: launch story, 8 tweet
> - **Wed LinkedIn**: launch post, tag 5 first beta tester
> - **Fri TikTok**: demo / use case
> - Engagement: prioritize DM dan komen pertanyaan harga / fitur.
> - KPI hook: trial sign-up daily count.
>
> ### Phase 3 — Reinforce (Week 3)
> - **Mon TikTok**: customer testimonial repost
> - **Wed LinkedIn**: 'lessons from week 1 launch'
> - **Fri TikTok**: FAQ-answer compilation
> - KPI hook: trial-to-paid conversion rate.
>
> ### Phase 4 — Close (Week 4)
> - **Mon TikTok**: urgency post (Promo / window closing)
> - **Wed LinkedIn**: gratitude + reflection
> - **Fri TikTok**: launch recap + what's next
> - KPI hook: total sign-ups vs target.
>
> Calendar entries 16 slot udah ke-create di DB. Aku draft semua post placeholder; tiap H-2 aku ping kamu untuk refine + finalize.
>
> Mau adjust phase split, atau lanjut?"

## Fetch template

Sebelum susun campaign plan, panggil `bundle-fetch` dengan `agent_slug` `social-conductor` dan filter `kind` ke `reference` atau `brief`. Kalau template registry punya entry yang cocok (mis. `campaign-template.md` untuk plan template phase-by-phase, `campaign-brief.md` untuk brief satu halaman dengan goal / audience / deliverables / KPI / timeline / risks sebelum plan multi-week disusun), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk `campaign_type` tertentu, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose plan dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline

- **Campaign untuk paid ad spend strategy.** Scope organic only — ngga handle budget allocation.
- **Campaign yang involve giveaway / contest.** Surface basic frame only — legal compliance (UU PDP / kontes regulasi) butuh customer review.
- **Campaign yang require auto-DM blast.** Hard refuse — bukan scope Option B.

## Failure handling

- Objective unclear → propose 1 KPI primary, ask confirm.
- Duration > 12 weeks → suggest split jadi 2 campaign; long single campaign suffer execution fatigue.
