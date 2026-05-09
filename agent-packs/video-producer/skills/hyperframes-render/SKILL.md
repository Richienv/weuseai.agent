# hyperframes-render — Hermes skill

Bundle: video-producer (v2.1)
Tier: pro+
Handler: `edge-fn:hyperframes-render`

## Apa itu HyperFrames render

`hyperframes-storyboard` skill produces a JSON spec — scene-by-scene visual prompt + motion + duration + transition. This skill is the **execution arm**: take that storyboard, kick off per-scene render jobs at the chosen provider (Runway primary, Pika fallback), poll until ready, return per-scene mp4 URLs + a stitch recipe for the customer's Hermes to merge locally.

Founder-side cost: Rp 0 — customer pays the render provider directly via their BYOK key.

## Kapan dipakai

Customer wants the actual mp4, not the storyboard. Trigger phrases:

- "render storyboard ini"
- "convert HyperFrames jadi video"
- "buat mp4 dari scene-nya"
- "execute storyboard"

Sering dipanggil **after** `hyperframes-storyboard` selesai — storyboard JSON jadi input.

## Yang harus diekstrak

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `hyperframes` | object | ya | HyperFrames JSON dari `hyperframes-storyboard` skill (version `hyperframes/1.0`). |
| `api_keys.runway` | string | tidak | Customer BYOK key buat Runway. Required if provider routes ke Runway. |
| `api_keys.pika` | string | tidak | Customer BYOK key buat Pika. Required if provider routes ke Pika. |
| `provider_preference` | string | tidak | enum `runway` \| `pika`. Override storyboard's `target_renderer`. |

Minimal harus ada salah satu API key (kalau dua-duanya kosong, handler return 400).

## Yang dilakukan

1. **Validate** HyperFrames input (version, scene shape, durations, total_duration_sec sum).
2. **Pick provider** via router:
   - `provider_preference` (request) → `target_renderer` (storyboard) → Runway primary → Pika fallback.
   - Skip a provider if API key missing OR if provider's `canHandle()` returns reason (out-of-range duration, prompt too long, unsupported aspect ratio).
3. **Pre-flight cost estimate**:
   - Runway: $0.05/s — 30s clip ≈ $1.50 ≈ Rp 23k
   - Pika: $0.02/s — 30s clip ≈ $0.60 ≈ Rp 9k
   - Surfaced in response; customer decides go/no-go before polling.
4. **Kick off all scenes in parallel** via provider's `startScene()`. Per-scene jobs return `job_id` + `poll_url`.
5. **Return** kickoff response:
   - `jobs[]`: per-scene `{ job_id, provider, scene, poll_url }`
   - `cost_estimate`: total USD cents + provider name + note
   - `stitch_recipe`: transitions + total_duration + cli_hint untuk stitch helper

Customer's Hermes then:
- Polls each `poll_url` until status `succeeded` (mp4_url returned) or `failed`.
- Downloads each mp4 to local fs (e.g. `scene-1.mp4`, `scene-2.mp4`, ...).
- Runs `npx hyperframes-stitch --scenes scene-1.mp4,... --recipe-json /tmp/render-response.json --out merged.mp4`.
- Surfaces `merged.mp4` to customer via Telegram (or upload to Supabase storage if customer wants persistent URL).

## Output

Persona-voice wrapper for the kickoff response:

> "Render kicked off ke Runway. 6 scenes, total ~30s, estimated cost $1.50 (~Rp 23k charged langsung ke Runway account kamu).
>
> Setiap scene jobs lagi processing — biasanya 1-2 menit per scene. Aku polling, kasih tahu kalau ada yang gagal.
>
> Begitu semua succeeded, aku download mp4-nya + run stitch lokal pakai ffmpeg. Output: `merged.mp4` di working dir kamu, ~30 detik final.
>
> Mau kirim ke Telegram begitu jadi, atau upload ke storage URL yang bisa kamu share?"

## Decline

- **No API key supplied** — return error 400, surface "kasih API key Runway atau Pika dulu di .env Hermes kamu".
- **Aspect ratio not in {9:16, 16:9, 1:1}** — Runway+Pika v0 only support these three.
- **Scene duration outside provider range** (Runway 1-10s; Pika 1-8s) — surface "split scene-nya jadi lebih pendek".
- **Visual prompt > provider's char limit** (Runway 1000; Pika 500) — surface "trim visual_prompt-nya".
- **>30 scenes per render** — return 400. Phase 4.5+ may add chunked rendering.

## Failure handling

- **Provider startScene fails (network / 5xx)** — return 502 `provider_unavailable`; customer retries.
- **Some scenes succeed kickoff, some fail** — return 200 with `jobs[]` for the successes + `failures[]` for the rest. Customer decides whether to retry failed scenes.
- **Provider rate-limited** — Runway primary fails → router falls through to Pika (if API key present). Returned `cost_estimate.note` flags the fallback.
- **All providers unavailable** — return 400 `no_provider` with `attempted` list of why each was skipped.

## Stitch helper

The Edge Function does NOT run ffmpeg server-side. Customer's Hermes runs the stitch via local CLI:

```bash
# After polling all jobs to succeeded + downloading each mp4:
npx hyperframes-stitch \
  --scenes scene-1.mp4,scene-2.mp4,scene-3.mp4 \
  --recipe-json /tmp/render-response.json \
  --out merged.mp4
```

CLI lives at `services/hyperframes-stitch/` in the monorepo and ships in the customer-VPS bundle. Requires `ffmpeg` in PATH (`apt install ffmpeg` in cloud-init, one-line addition).

## Phase 4-2 v0 limitations

- **API keys passed per request** — not stored on customer rows. Phase 4.5+ migrates to encrypted storage when SUPABASE_ACCESS_TOKEN is available for autonomous SQL migrations.
- **No CapCut Auto-Cut** — different render category (stock-footage assembly), deferred to Phase 5.
- **No Sora** — pending GA.
- **No live smoke in this PR** — founder runs paid smoke at their option; spec said "founder smoke ~Rp 8-16k per sub-phase" but Runway 30s test = ~Rp 23k (over budget). Code + tests + docs ship; founder verifies live when they want to spend.
