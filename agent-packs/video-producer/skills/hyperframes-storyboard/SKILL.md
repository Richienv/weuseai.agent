# hyperframes-storyboard — Hermes skill

Bundle: video-producer (v2)
Tier: pro+
Handler: `hermes-skill:hyperframes-storyboard`

## Apa itu HyperFrames

HyperFrames = JSON storyboard per-scene yang siap di-feed ke video render tools (Runway, Sora, CapCut Auto-Cut, Pika). Aku **spec**, kamu **render** off-platform. In-house frame generation = Phase 6+ work; sekarang stub yang produce render-ready prompt structure.

## Kapan dipakai

- "bikin storyboard"
- "scene-by-scene visual"
- "export ke Runway"
- "Sora prompt"
- "shot list video"
- "HyperFrames untuk script ini"

Sering dipanggil **after** `tiktok-script-builder` selesai — script jadi input untuk storyboard.

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `script_input` | ya | JSON script dari tiktok-script-builder, atau text outline kalau customer ngga punya script formal |
| `target_renderer` | tidak | enum: runway \| sora \| pika \| capcut \| generic. Default generic. |
| `aspect_ratio` | tidak | "9:16" (default vertical) \| "16:9" \| "1:1" |
| `style_direction` | tidak | "cinematic" \| "documentary" \| "anime" \| "vlog" \| "stop-motion" — affects motion_hint phrasing |

## Yang dilakukan

Load `templates/hyperframes-storyboard-format.md` untuk schema reference.

Per visual_scene di script:
1. **visual_prompt** — descriptive prompt fit target_renderer's prompt language. Runway prefers cinematographic vocab; Sora handles natural-language paragraphs.
2. **motion_hint** — "slow zoom in", "handheld pan-right", "static medium shot", dll. Match style_direction.
3. **duration_sec** — float, sum of all scenes ≤ video length budget (script's `length`).
4. **audio_cue** — "voiceover line: [text]", "sound effect: [type]", "music swells", "silence".
5. **transition_to_next** — "cut", "match-cut", "whip-pan", "dissolve" — fit pacing.

Output JSON object dengan field `version: "hyperframes/1.0"`, `scenes: [...]`, `metadata: {aspect_ratio, target_renderer, total_duration_sec}`.

## Output format

Persona-voice wrapper:

> "HyperFrames storyboard siap. 6 scenes, total 30s, optimized for Runway:
>
> ```json
> {
>   "version": "hyperframes/1.0",
>   "scenes": [
>     {
>       "scene_id": 1,
>       "timestamp": "0:00-0:03",
>       "visual_prompt": "POV close-up shot of phone screen showing low bank balance, soft natural light, slight handheld shake",
>       "motion_hint": "slow zoom in to balance figure",
>       "duration_sec": 3,
>       "audio_cue": "voiceover: 'Pernah cek saldo, langsung kaget?'",
>       "transition_to_next": "cut"
>     },
>     ...
>   ],
>   "metadata": { "aspect_ratio": "9:16", "target_renderer": "runway", "total_duration_sec": 30 }
> }
> ```
>
> Copy-paste per scene ke Runway, atau pakai full JSON kalau workflow kamu support batch import. Mau aku tweak motion_hint, atau lanjut ke caption?"

## Decline

- **Render frame actual.** Phase 6+ work; sekarang stub spec only.
- **Stock footage / Getty Images search.** Bukan scope skill ini; surface generic prompt aja.
- **Audio generation / music license advice.** Suggest license source (Epidemic Sound, Artlist), bukan generate.

## Failure handling

- Script_input invalid JSON → ask customer for plain-text outline, generate scenes from outline.
- Total duration_sec exceeds script length → trim last scene, flag to customer.
