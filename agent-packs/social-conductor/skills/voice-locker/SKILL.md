# voice-locker — Hermes skill

Bundle: social-conductor (v2)
Tier: pro+
Handler: `hermes-skill:voice-locker`

## Kapan dipakai

- "lock voice"
- "setup voice profile"
- "kasih sample untuk voice"
- "iterate voice"
- "drift detected, re-lock"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `mode` | ya | enum: lock-new \| iterate-existing \| validate |
| `samples` | ya untuk lock-new | Min 20 sample writing — caption lama, post copy, DM reply, blog snippet, anything customer-authored |
| `existing_profile_id` | ya untuk iterate/validate | Reference ke profile sebelumnya |

## Yang dilakukan

Load `templates/voice-profile-template.md` untuk schema.

### lock-new mode
1. Baca 20+ sample.
2. Extract per dimension:
   - **Register** — formal / kasual / playful / educational / premium
   - **Sentence length** — short staccato / medium / long-flowing
   - **Banned words** — explicit list dari brand voice (overlay CLAUDE.md banned words)
   - **Signature phrases** — recurring openers / closers ("kasih tahu", "yuk coba", "save dulu")
   - **Emoji policy** — count avg per post, placement (start / end / inline)
   - **Punctuation style** — exclamation count, ellipsis usage, em-dash freq
   - **Address form** — kamu / Anda / lo / mix
3. Output `voice-profile.json` ke `/var/lib/weuseai/customer-grown/voice-profiles/{customer_id}.json`.
4. Generate 5 test drafts, ask customer fit-check.

### iterate-existing mode
Load existing profile, customer drop 5 new sample atau highlight drift. Update profile incrementally.

### validate mode
Run drift detection: compare last 30 days output vs locked profile. Surface drift dimensions kalau ada.

## Output

Persona-voice wrapper untuk lock-new:

> "Voice profile locked dari 23 sample kamu:
>
> - Register: **calm-edukasi** (formal-light, audience treated as peer)
> - Sentence length: medium (10-18 words avg)
> - Banned words: 'just', 'literally', plus CLAUDE.md global list
> - Signature phrases: 'kasih tahu', 'coba dulu', 'save buat'
> - Emoji: 0-1 per post, mostly end-of-sentence (😉, 💡)
> - Address: **kamu** consistent
> - Punctuation: zero exclamation, occasional em-dash
>
> 5 test draft generate berikut — kasih tahu mana yang fit (high/medium/low). Setelah fit-check, voice locked dan post-drafter aktif."

## Decline

- **Lock voice dengan <20 sample.** Hard refuse — voice profile butuh signal cukup. Suggest customer drop sample lebih dulu.
- **Lock voice dari sample orang lain.** Voice profile = customer's own writing, bukan inspirasi creator lain.

## Failure handling

- Sample insufficient → return list of remaining count + suggest source ("DM reply 5 lagi, post lama 5, blog 3").
- Drift severe (>3 dimension shift) → suggest re-lock, bukan iterate.
