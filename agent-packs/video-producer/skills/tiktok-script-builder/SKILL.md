# tiktok-script-builder — Hermes skill

Bundle: video-producer
Tier: pro
Handler: `edge-fn:tiktok-script-handler` (validator only; Hermes generates the script locally using customer's BYOK LLM)

## Kapan dipakai

Customer minta script TikTok atau Reels atau Shorts. Trigger phrases:

- "bikin script TikTok"
- "script Reels"
- "scriptin video pendek"
- "ide konten TikTok"
- "buat hook video"
- "rencana TikTok harian"
- "draft Reels 30 detik"

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `topic` | string | ya | Topic content video (3-200 char) |
| `length` | 15 \| 30 \| 60 \| 90 | tidak | Default 30. Customer kasih tahu kalau spesifik. |
| `audience` | "gen-z" \| "millennial" \| "general" | tidak | Default general |
| `platform` | "tiktok" \| "reels" \| "shorts" | tidak | Default tiktok |

## Yang dilakukan

Architecture pivot 2026-05-08: skill ini generate JSON script LOKAL pakai LLM kamu (BYOK key di .env), lalu POST hasil JSON ke handler untuk validation. Cost LLM stays on customer.

### Step 1: Generate script JSON locally

Pakai system prompt berikut dengan LLM yang configured di `OPENAI_API_KEY` (customer's BYOK):

```
Kamu penulis script untuk {platform}. Format video: {length} detik, audience {audience}.

Generate JSON object dengan field berikut:
- hook: 3 detik pertama. Maks ~30 char untuk read-aloud cepat.
- body: konten utama, tone Bahasa Indonesia kasual.
- cta: 3-5 detik terakhir. Action concrete.
- visual_scenes: array {timestamp (mm:ss), description}. 1-12 scene.
- sound_suggestion: nama trending sound atau genre.
- hashtags: 3-10 hashtag, format ^#[a-zA-Z0-9_]+$ (no spaces, no special chars).

Output: JSON object SAJA. Tidak ada markdown, tidak ada prosa. Mulai dengan { dan akhir dengan }.
```

User prompt: `Topic: {topic}\n\nGenerate:`

Set temperature 0.7, max_tokens 800.

### Step 2: POST hasil ke handler untuk validation

```
POST $WEUSEAI_WORKFLOW_EXECUTE_URL
Body: {
  "customer_id": "$WEUSEAI_CUSTOMER_ID",
  "workflow_id": "<resolved from local manifest>",
  "parameters": {
    "script": <hasil JSON dari step 1>,
    "topic": "...",
    "length": 30,
    "audience": "gen-z",
    "platform": "tiktok"
  }
}
```

### Step 3: Handle response

- HTTP 200: handler return `{ format: 'json', script: <validated> }`. Format ke customer dengan persona voice (trend-fluent, hook-first, shipping-tempo).
- HTTP 400 dengan `schema_validation_failed`: fix yang flagged + retry step 1 dengan stricter system prompt. Maks 2 retry; abis itu kasih tahu customer "Lagi ada glitch generate script. Coba topic yang lebih spesifik?"

## Contoh interaksi

**Customer:** "Bikin script TikTok 30 detik tentang tips budgeting buat anak muda"

**Kamu (Video Producer) — output (setelah generate + validate):**

Done. Hook bertenaga, fit untuk gen-z budgeting niche.

🎬 **Hook (0:00–0:03):** "Pernah cek saldo, langsung kaget?"
**Body (0:03–0:25):** Coba 50/30/20 rule. 50% kebutuhan, 30% keinginan, 20% tabungan.
**CTA (0:25–0:30):** "Save video ini buat reminder."

**Visual scenes:**
- 0:00 — POV cek saldo HP, ekspresi kaget
- 0:05 — Cut to overlay text 50/30/20 rule
- 0:20 — Demo split di kalkulator
- 0:28 — Final CTA dengan teks "save"

**Sound:** oh-no-oh-no original sound (aug 2026 trend)
**Hashtags:** `#fintok #budgeting #keuanganId #millennialmoney`

Kamu bisa shoot ini hari ini, atau aku iterate dengan angle berbeda — tinggal kasih tahu.

## Fetch template

Sebelum generate script, panggil `bundle-fetch` dengan `agent_slug` `video-producer` dan filter `kind` ke `schema-spec` atau `script`. Kalau template registry punya entry yang cocok (mis. `tiktok-script-format.md` untuk JSON schema strict — field hook, body, cta, visual_scenes, sound_suggestion, hashtags dengan regex hashtag dan timestamp; `indonesia/script-template-tiktok-id-7sec-hook.md` untuk struktur 7-second-hook audience Indonesia — beat 0-2s hook + 2-7s setup, 7-22s body, 22-27s payoff, 27-30s CTA + brand callout, register BI casual TikTok-ID; `scripts/short-form-script.md` untuk 4-beat short-form generic dengan per-beat visual cue dan audio cue terpisah), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk platform, length, atau audience tertentu, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Hard limits

- Tidak post atas nama customer tanpa preview eksplisit
- Tidak claim trend metrics yang tidak verified — kalau LLM hallucinate angka view, strip atau flag sebagai estimasi
- Hashtag pattern strictly enforced di handler-side schema (^#[a-zA-Z0-9_]+$)

## Failure handling

- Validation rejects schema → retry generation 1× dengan stricter prompt
- 2 retry fail → customer-facing apology + log run_id
- LLM API error (customer's BYOK) → "Cek balance OpenRouter / API key kamu, lagi error."
