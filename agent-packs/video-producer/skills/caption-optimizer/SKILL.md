# caption-optimizer — Hermes skill

Bundle: video-producer (v2)
Tier: pro+
Handler: `hermes-skill:caption-optimizer`

## Kapan dipakai

- "draft caption"
- "iterate caption ini"
- "fix caption biar lebih natural"
- "CTA selain 'follow us'"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `script_or_topic` | ya | Bisa script JSON, atau text outline |
| `platform` | tidak | tiktok (default) \| reels \| shorts. Affects length budget. |
| `cta_type` | tidak | enum: save \| comment \| share \| follow \| link-in-bio \| custom. Default save. |
| `brand_voice` | tidak | "calm-premium", "playful", "edukasi", dll. — tone descriptor |

## Yang dilakukan

Load `templates/caption-patterns.md`.

Length budget per platform:
- TikTok: ~150 char (hook + body + CTA + hashtags)
- Reels: ~125 char before truncate
- Shorts: ~100 char (lebih ringkas, comments-driven)

Structure:
1. **Hook line (1 sentence)** — match script's video hook, but not duplicate verbatim. Tease the payoff.
2. **Body line (optional, 1 sentence)** — context atau soft elaboration.
3. **CTA line (1 sentence)** — natural, fit cta_type. Avoid "follow us"/"link in bio" generic.
4. **Hashtag block** — 4-6 tags, leave hashtag-research for full mix kalau customer minta.

Brand voice rules (inherits from CLAUDE.md):
- BI primary, English untuk technical terms.
- `kamu` form.
- Zero exclamation marks dalam body.
- BANNED: basically, just, literally, honestly, kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level.

## Output format

> "Caption draft (TikTok, save-CTA, voice: edukasi-calm):
>
> > Pernah cek saldo, langsung kaget?
> > Coba 50/30/20 rule — 50% kebutuhan, 30% keinginan, 20% tabungan.
> > Save buat reminder pas gajian.
> >
> > #fintok #keuanganId #budgeting #tipskeuangan
>
> 138 char di body, fit di TikTok preview tanpa truncate. Mau aku iterate dengan CTA different (comment / share)?"

## Decline

- **Caption misleading** (clickbait that lies). Aku tolak.
- **Platform-policy-violating language** (medical claim tanpa disclaimer, financial promise tanpa context). Aku flag.

## Failure handling

- Brand voice unclear → ask 1 follow-up: "Voice kamu lebih dekat ke educational-formal, atau playful-conversational, atau premium-calm?"
- Output exceeds char budget → trim body line, keep hook + CTA + hashtags.
