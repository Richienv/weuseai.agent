# narrative-arc-deck-builder — Hermes skill

Bundle: slide-master (v2)
Tier: starter+ (v2 tier change — was Pro+)
Handler: `hermes-skill:narrative-arc-deck-builder` (Hermes generates the deck locally on the customer's VPS using their BYOK LLM)

## Kapan dipakai

Customer minta deck buat pitch / story / persuasive presentation. Trigger phrases:

- "bikin pitch deck"
- "deck buat investor"
- "deck untuk customer"
- "presentasi 12 slide"
- "deck pakai story arc"
- "internal review deck"
- "deck Q3 / Q4 untuk team"

Default mode kalau customer tidak menyebut "template" secara eksplisit.

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `audience` | enum: investor \| internal-team \| customer \| board \| general | ya | Tanyakan kalau ambigu |
| `topic` | string | ya | Topik / produk / situation utama |
| `duration_minutes` | int | tidak | Default 10 menit (12 slide standar). 5 menit → 6-8 slide; 20 menit → 18-20 slide. |
| `story_arc` | enum: problem-solution-market-traction-ask \| situation-complication-resolution \| outcome-led \| chronological | tidak | Default problem-solution-market-traction-ask buat investor pitch |
| `tone` | enum: formal \| storytelling \| direct | tidak | Default formal buat investor + board, storytelling buat internal team + customer |
| `data_points` | array | tidak | Customer kasih kalau punya data — aku bikin chart, bukan ngarang angka |

## Yang dilakukan

1. Apply defaults berdasarkan `audience`.
2. Susun deck outline (slide-by-slide) dengan title + key visual brief + speaker notes.
3. Story arc default 5-act:
   - **Slide 1-2:** Hook + problem statement
   - **Slide 3-5:** Solution / approach + why-now context
   - **Slide 6-8:** Market or traction data + key visual (chart from customer's data, NOT fabricated)
   - **Slide 9-10:** Differentiator + competitive context
   - **Slide 11-12:** Ask + next steps + thank-you
4. Per slide: title (≤8 words), 1-3 support bullets (kalau perlu), key visual brief, speaker notes (50-80 kata).
5. Output markdown deck ke `/tmp/slide-master-out/deck-<slug>-<timestamp>.md`. Customer convert ke PowerPoint / Keynote / Google Slides via Pandoc atau direct copy-paste.

## Output yang dikembalikan ke customer

Persona-voice wrapper:

> "Deck-nya jadi: [N] slide, story arc [arc-name], tone [tone]. Markdown ada di [path]. Tiap slide udah punya speaker notes + visual brief. Mau aku adjust slide tertentu, atau langsung export ke format spesifik?"

## Fetch template

Sebelum susun deck, panggil `bundle-fetch` dengan `agent_slug` `slide-master` dan filter `kind` ke `pitch-deck`, `outline`, atau `slide` sesuai audience. Kalau template registry punya entry yang cocok (mis. `pitch-deck/seed-round.md` untuk founder pre-revenue, `pitch-deck/series-a.md` untuk metrics-led pitch, `pitch-deck/board-update.md` untuk direksi, `pitch-deck/internal-review.md` untuk kuartalan, `pitch-deck/customer-facing.md` untuk sales meeting, atau `outlines/narrative-arc-10slide.md` untuk approval kerangka), pakai itu sebagai starting frame. Kalau registry tidak punya match, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline criteria

- **Data fabrication.** Kalau customer minta "bikin chart growth 200% YoY" tanpa data source, aku decline. Aku susun deck pakai data yang customer kasih, atau pakai placeholder yang explicitly labeled "[data needed]".
- **Misleading claims.** Tidak nge-frame data dengan cara yang misleading (truncated y-axis, cherry-picked time window). Aku flag kalau request menyiratkan ini.
- **Lebih dari 25 slide tanpa permintaan eksplisit.** Default cap 12-15 slide. Lebih dari itu butuh konfirmasi customer.

## Decline kalau missing context

Kalau cuma "bikin deck" — tanya: "Audience-nya siapa (investor / team / customer)? Topik utama-nya apa?"
