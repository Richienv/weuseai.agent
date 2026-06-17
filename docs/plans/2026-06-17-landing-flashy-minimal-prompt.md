# BUILD PROMPT — weuseai.id landing → flashy / minimal-words / heavily-animated (konten.com energy, our brand, gates intact)

> Paste this whole file to the implementing agent. It is self-contained. Every file:line was verified against the live tree on 2026-06-17.
> **Repo:** `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah`
> **Edit only:** `assets/app.jsx` (components + copy) and the single `<style>` in `index.html` (lines 51–4184, 105 `@keyframes`).
> **Build:** `node scripts/build-landing.mjs` → regenerates `assets/app.js` + `assets/tw.css`. Commit all four files together.
> **Never touch:** `assets/app.js`, `assets/tw.css` by hand (generated); `supabase/functions/_shared/tier-personas.ts` (price source of truth).

---

## 0. NORTH STAR + GUARDRAILS

### The thesis (why we are doing this)
Our traffic is Instagram. A reel viewer lands mid-scroll with ~0.5–1s of patience. The page must be **graspable without reading**: motion enters every block, each "how it works" beat is a moving UI mock (you *see* it, you don't read it), the one piece of real engagement is a *toy* (a draggable slider), and prose is quarantined into collapsed FAQ rows. Headlines are **2 short lines with a color-split** so meaning lands in one fixation. This is the konten.com model, rebuilt on our brand. **Current page prose ≈ 1,900 words; target above-the-fold-through-pricing ≈ 150–250 words**, with the rest collapsed into FAQ.

### Brand tokens (do not break)
- Signal-red `#E5322D` on dark `#0a0a0a` / `#050505`.
- Fonts: Inter (body), Instrument Serif (headings), JetBrains Mono (labels/pills).
- `kamu`, never `Anda`/`lo`/`gue`.

### HARD GATES — all must stay green (these will fail the build if violated)
1. **Freshness** (`tests/landing-build.spec.ts:22`): after any `app.jsx` edit you MUST `node scripts/build-landing.mjs` and commit `app.js`+`tw.css`. The test rebuilds and asserts byte-for-byte equality. It also asserts `index.html` references `/assets/app.js` + `/assets/tw.css` and contains NO `babel`, `cdn.tailwindcss.com`, `hls.min.js`, or `type="text/babel"` (`:40`).
2. **Demo honesty banlist** (`tests/landing-build.spec.ts:64`): `app.jsx` must NOT contain any of these substrings — `Sorted`, `emails`, `GST`, `PR #142`, `Auto-publish`, `Calendar update`, `confirmed dalam`, `Live di 6 platform`, `overnight`, `trending apa`, `Auto-monitor`, `otomatis ke OLX`, `kalender di-sync`, `Otomatis dibaca`, `10×`. And it MUST still contain `Pagi Briefing — dikirim otomatis` and `Aku tidak mengirim apa pun tanpa kamu setujui`. **These two honest strings are at app.jsx:2707 and app.jsx:2716 — they must survive every hero rewrite.**
3. **No exclamation marks** in any body/headline copy (brand rule, CLAUDE.md). konten uses `!` everywhere — we copy its *structure and brevity*, never its punctuation. Every line you write ends in a period or nothing, never `!`.
4. **Banned words** (CLAUDE.md, never appear in copy): `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`. Note `10×` (the unicode-× form) is *also* banned by the honesty test — avoid both spellings.
5. **No fabricated capabilities.** Frame email/calendar as future ("menyusul"), School Expert as "pantau/siapkan" never "kerjakan". No invented revenue or savings numbers anywhere — especially the new slider (rule below).
6. **Pricing-drift** (`tests/landing-pricing-drift.spec.ts`): these literals must stay present in `app.jsx`, untouched — `setupIdr: 99_000`, `setupIdr: 399_000`, `priceLabel: 'Rp 99rb'`, `priceLabel: 'Rp 399rb'`, `month1Total: 'Rp 198rb'`, `name: 'Solo Starter'`, `slug: 'solo'`, and every sellable slug `'bare' 'solo' 'voice-starter' 'library-full' 'done-for-you'`. The hidden Bare decoy object (app.jsx:4410–4417) STAYS in the tiers array. **Trim only `outcomes`/`persona`/`tagline` text — never the numeric price fields or slugs.** Any new slider readout shows volume + the flat Rp 99rb line, NEVER a new price.

### The loop (run after EVERY phase)
```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah"
node scripts/build-landing.mjs
npx tsc --noEmit                                   # if you touched any .ts; jsx is checked by the build
node --test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts
# Re-grep the gates by hand (belt + suspenders):
grep -nE '!' assets/app.jsx | grep -vE '!==|!=|!important|aria-|className|\bn!|//|/\*' # eyeball any body-copy "!"
grep -niE 'basically|literally|honestly|revolutionary|disrupt|10x|10×|game-changer|next-level|kind of|pretty much' assets/app.jsx
```
Then Playwright verify desktop **and** mobile (Phase steps below). Do not proceed to the next phase until the current one is green.

### Verified render order (app.jsx:5396–5411)
`Navbar` → `DashboardDemo` (hero) → `IntegrationsSpine` → `OriginSection` → `StartSection` → `FeaturesChess` → `VelvetSection` → `FeaturesGrid` → `Pricing` → `FAQ` → `Stats` → `CtaFooter`.
(Note: `Stats` currently renders AFTER `FAQ`, near the footer — Phase 3 lifts it up.)

---

## 1. GLOBAL COPY BUDGET (from the konten teardown — enforce per element)

| Element | Budget | konten reference |
|---|---|---|
| Section eyebrow pill | **≤4 words**, JetBrains Mono, uppercase, signal-red. NEVER a paragraph. | `Ladang Cuan Baru` (3), `Gimana Cara kerjanya?` (3) |
| Any headline | **exactly 2 short lines, ≤7 words total**, with a **color-split** (emphasis half in `#E5322D`, rest white) | `3 langkah doang. / Tinggal posting, cuan ngalir.` |
| Hero sub-copy | **≤18 words**, broken into ~3 micro-clauses | `Brand bayar kamu… Posting di… Cuan masuk otomatis…` |
| Step/card title | **≤3 words** | `Klik Join Campaign` |
| Step/card desc | **≤7 words, 1 line** | `Join untuk mulai upload video kamu` |
| Pricing card bullets | **≤3 bullets, ≤5 words each** | numbers, not adjectives |
| Prose (anything longer) | **only inside collapsed FAQ rows** | konten's only long text is collapsed FAQ |

**Rule of thumb:** every section opens with a ≤4-word pill, then a 2-line color-split headline, then a UI mock or numbers — not a sentence. If a section currently leads with a paragraph, that paragraph either becomes a pill+headline or moves to FAQ.

---

## 2. SECTION-BY-SECTION SPEC

Legend: 🔪 = biggest word-cut · 🎞 = gets a new signature animation · ♻️ = reuses an existing primitive.

### Reusable primitives already in the tree (use these, do not reinvent)
- `Mot = M.motion`, house easing `EASE = [0.16,1,0.3,1]` (app.jsx:3, :8) — every `whileInView` reveal.
- `CountUp` (app.jsx:337) — IO-triggered count-up, `toLocaleString('id-ID')`, adds `.glow`. Use for stats + slider readout.
- `BlurText` (app.jsx:376) — per-word blur reveal. Already wraps most headlines.
- `DottedVideo` (app.jsx:72) — the hero bg engine. **Do NOT add a second canvas.**
- `AgentCarousel` rAF marquee (app.jsx:1831) — the marquee pattern is already solved.
- Existing keyframes to reuse: `priceGlowPulse` (index.html:54), `utilMeterDraw`/`utilMeterShimmer` (index.html:82/87/89/90), `isFlow` (index.html:452).

---

### 2.1 — Navbar (app.jsx:406) — TRIM, add gloss CTA
- Keep nav + "Mulai". Give the "Mulai" button the glossy red CTA treatment + sheen sweep (CSS in §2.9 / Spec 5b).
- No copy change.

---

### 2.2 — DashboardDemo / HERO (app.jsx:2699) 🔪🎞 — biggest visual win
**Copy rewrite** (the headline at app.jsx:2825 is currently `Satu super-agent. Growing skills.<br/> Create Anything You Want.` — 8 words, English, no color-split):
- New headline → 2 lines, color-split, ≤7 words:
  ```jsx
  <h2 className="db-headline">
    <span className="hl-em">Satu agent.</span><br className="hidden md:inline" /> Ngerjain semua kerja kamu.
  </h2>
  ```
  (`.hl-em { color:#E5322D; }`). Drop all English.
- Sub-copy → ≤18 words, 3 micro-clauses, ONE CTA only (kill any secondary hero link):
  `Dia nyapa kamu duluan. Briefing pagi masuk sebelum diminta. Kamu cukup setujui.`
- Append a tiny mono honesty line (≤6 words): `Ilustrasi pengalaman · email & kalender menyusul`.
- Mono strip: `Setup 5 menit · QRIS · Rp 99rb/bulan · stop kapan saja`.
- **KEEP the full chat mockup unchanged** — it IS the animation. The honest strings at app.jsx:2707 (`07:00 · Pagi Briefing — dikirim otomatis`) and app.jsx:2716 (`Aku tidak mengirim apa pun tanpa kamu setujui`) MUST stay verbatim.

**Animation to ADD — SPEC 1: hero circuit-flow background** (konten's "nodes flowing into a hub", signal-red, pure SVG — no second canvas).

New component, place near `BlurText` (~app.jsx:404):
```jsx
function HeroCircuit() {
  return (
    <svg className="hero-circuit" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path className="hc-wire" d="M-20 140 C 300 140, 360 300, 600 300" />
      <path className="hc-wire" d="M-20 300 C 280 300, 340 300, 600 300" />
      <path className="hc-wire" d="M-20 460 C 300 460, 360 300, 600 300" />
      <path className="hc-wire hc-wire--r" d="M1220 140 C 900 140, 840 300, 600 300" />
      <path className="hc-wire hc-wire--r" d="M1220 460 C 900 460, 840 300, 600 300" />
      <circle className="hc-hub" cx="600" cy="300" r="26" />
      <circle className="hc-hub-ring" cx="600" cy="300" r="26" />
    </svg>
  );
}
```
Render it inside `DashboardDemo`'s hero `<section>` RIGHT AFTER `<DottedVideo … className="db-hero-video" />` (app.jsx:2817) and BEFORE `<div className="db-hero-dim" />` (app.jsx:2818), so it sits behind the dim and never competes with the chat mock.

CSS — add near the hero block (~index.html:300, beside `.db-section--hero .db-hero-video`):
```css
.hero-circuit { position:absolute; inset:0; width:100%; height:100%; z-index:1; pointer-events:none; opacity:0.5; }
.hero-circuit .hc-wire { fill:none; stroke:rgba(229,50,45,0.55); stroke-width:1.4; stroke-dasharray:14 220; animation:hcFlow 3.2s linear infinite; }
.hero-circuit .hc-wire:nth-child(2) { animation-delay:-0.9s; }
.hero-circuit .hc-wire:nth-child(3) { animation-delay:-1.8s; }
.hero-circuit .hc-wire--r { animation-direction:reverse; opacity:0.7; }
.hero-circuit .hc-hub { fill:rgba(229,50,45,0.18); stroke:#E5322D; stroke-width:1.5; transform-box:fill-box; transform-origin:center; animation:hcHub 2.6s ease-in-out infinite; }
.hero-circuit .hc-hub-ring { fill:none; stroke:#E5322D; stroke-width:1.2; transform-box:fill-box; transform-origin:center; animation:hcRing 2.6s ease-out infinite; }
@keyframes hcFlow { to { stroke-dashoffset:-234; } }
@keyframes hcHub  { 0%,100%{opacity:0.85;} 50%{opacity:1; transform:scale(1.06);} }
@keyframes hcRing { 0%{opacity:0.6; transform:scale(1);} 100%{opacity:0; transform:scale(2.4);} }
@media (max-width:767px){ .hero-circuit{ opacity:0.35; } }
@media (prefers-reduced-motion:reduce){
  .hero-circuit .hc-wire,.hero-circuit .hc-hub,.hero-circuit .hc-hub-ring{ animation:none; }
  .hero-circuit .hc-wire{ stroke-dasharray:none; opacity:0.4; }
  .hero-circuit .hc-hub-ring{ display:none; }
}
```
Perf: 5 short paths + 2 circles, animating only `stroke-dashoffset`/`transform`/`opacity`. Sits under the existing dim (the dim already raises eyebrow/frame to z-3, index.html:320–321). The mobile `@media(max-width:767px)` block at index.html:323 already dims the hero video — match that pattern.

---

### 2.3 — IntegrationsSpine (app.jsx:5184) 🔪🎞♻️ — add pill, float a phone column, slash descs
- ADD a ≤4-word mono pill above the headline (it currently leads straight into the headline at app.jsx:5215 `Dia kerja di app beneran.`). Pill: `KERJA DI APP KAMU`.
- KEEP headline `Dia kerja di app beneran.` (5 words).
- CUT the sub-paragraph; if one line is wanted: `Bukan jawab di chat — dia kerja di app kamu.` (≤8 words).
- 🔪 Slash the four app `line` descs (app.jsx:5187–5208, ~88w → ~24w), keep `ask`/`msg` (they animate):
  - R2 Content → `Susun & jadwalkan konten kamu.`
  - R2 Fit → `Atur program latihan, catat progres.`
  - R2 Finance → `Rapikan cashflow, kasih ringkasan.`
  - School Expert → `Pantau tugas & tenggat sekolah.` **(honest: "pantau", never "kerjakan" — app.jsx:5205, per the comment at 5180–5183)**
- KEEP foot line; trim to `Empat app. Satu agen. Rp 99rb/bulan.` (6w).

**Animation ♻️ (SPEC 9): floating GPU-composited phone column** reusing the existing iPhone slideshow assets (`r2-*.png`, already in `/assets`). Apply konten's recipe to the phone container:
```css
.is-phone-float {
  width:360px; aspect-ratio:582/1280;
  mask-image:linear-gradient(to bottom, transparent 0%, black 32%, black 66%, transparent 78%);
  -webkit-mask-image:linear-gradient(to bottom, transparent 0%, black 32%, black 66%, transparent 78%);
  will-change:transform; transform:translateZ(0); contain:layout paint;
}
@media (max-width:767px){ .is-phone-float{ width:240px; } }
@media (prefers-reduced-motion:reduce){ .is-phone-float :is(.is-shot){ animation:none; } }
```
Reuse the existing `isShotFade` crossfade (index.html:426) for the screenshot stack — do not add new screenshot keyframes.

---

### 2.4 — OriginSection (app.jsx:5275) 🔪 — wordiest prose offender, biggest cut
- KEEP the two pills (`Resep Hangzhou` / `Dirakit untuk Indonesia`).
- 🔪 Headline at app.jsx:5317 is currently `Resep kampus elite China. Tenaga satu tim penuh. Aktif dalam 8 menit.` (12 words). Shrink to a 2-line color-split, ≤7 words:
  ```jsx
  text="Resep kampus elite China. Aktif 8 menit."
  ```
  (drop the middle clause). If `BlurText` supports a color-split, wrap the second line red; otherwise leave as-is — the cut alone is the win.
- 🔪 Sub: 32 words → ≤20: `Satu tim agent di Telegram kamu — riset, surat, slide, laporan. Dirakit di Zhejiang University, dibawa pulang buat kamu.` Cut `Bukan chatbot yang cuma jawab; tim yang mengerjakan` (redundant with hero).
- KEEP the stat labels — they count up (pure motion).
- Move the deleted backstory sentence into a new FAQ row (§2.8).

---

### 2.5 — StartSection + carousel (app.jsx:2668; AgentCarousel app.jsx:1831) 🔪♻️ — 2nd-fattest block
- Pill: `TIM KAMU` (2w).
- Headline at app.jsx:2685 is `Spesialis untuk tiap pekerjaan. Satu tim. Satu chat.` (8w) → `Spesialis tiap kerja. Satu chat.` (5w, color-split).
- CUT the sub entirely (the carousel cards carry it).
- 🔪 Collapse each of the 12 carousel descs (the wordy block ~230w → ~30w) to a 2–4 word capability tag (honest mapping):
  The Pro → `Briefing pagi & ingatan` · Deep Researcher → `Riset jadi laporan` · Doc Expert → `Surat, proposal, skripsi` · Web Creator → `Ide jadi web app` · Project Conductor → `Proyek jadi task board` · Business Director → `Roadmap founder Indonesia` · Trade Pro → `Briefing pasar & emiten` · Slide Master → `Outline jadi deck` · Social Conductor → `Kalender & draf konten` · Video Producer → `Skrip TikTok & Reels` · Email Manager *(Segera)* → `Rapikan kotak masuk` · Calendar Agent *(Segera)* → `Atur jadwal kamu`
- ♻️ KEEP the rAF marquee motion as-is (it is already the konten "alive" marquee).

---

### 2.6 — FeaturesGrid "Empat langkah" (app.jsx:3496, headline app.jsx:3568) 🔪🎞 — convert to konten's sliding step-cards
- KEEP headline `Empat langkah. Delapan menit.` (4w). (Consider 3 steps over 4 per konten's "3 langkah doang" — founder call; if kept at 4, fine.)
- 🔪 Slash each step body (~96w → ~24w), one line each:
  1. `Pilih plan kamu` → `Satu instance dedicated, langsung termasuk.`
  2. `Isi informasi` → `Pilih channel. AI brain kami yang pilihkan.`
  3. `Sistem auto-setup` → `Server, persona, template — kami siapkan.`
  4. `Mulai pakai` → `Buka Telegram, kirim pesan, beres.`

**Animation 🎞 (SPEC 4): alternating slide-in + a "drawing" connector line.** Swap each card's `whileInView` (currently a plain fade) to alternate x-offset:
```jsx
initial={{ opacity: 0, x: i % 2 ? 40 : -40, y: 20 }}
whileInView={{ opacity: 1, x: 0, y: 0 }}
transition={{ duration: 0.7, ease: EASE }}
```
Add the connector (the section already has a `.how-line` div). New CSS near the how block (~index.html:3050):
```css
.how-cycle .how-line { position:absolute; top:32px; left:12%; right:12%; height:2px;
  background:linear-gradient(90deg, rgba(229,50,45,0.15), rgba(229,50,45,0.6), rgba(229,50,45,0.15));
  transform:scaleX(0); transform-origin:left center; }
.how-cycle.in-view .how-line { animation:howDraw 1.2s cubic-bezier(0.16,1,0.3,1) forwards; }
.how-cycle .badge { position:relative; }
.how-cycle .badge::after { content:''; position:absolute; inset:-4px; border-radius:50%;
  box-shadow:0 0 0 0 rgba(229,50,45,0.5); animation:howBadgePop 0.6s ease-out backwards; }
.how-cycle .flex:nth-child(2) .badge::after { animation-delay:0.3s; }
.how-cycle .flex:nth-child(3) .badge::after { animation-delay:0.6s; }
.how-cycle .flex:nth-child(4) .badge::after { animation-delay:0.9s; }
@keyframes howDraw { to { transform:scaleX(1); } }
@keyframes howBadgePop { 0%{box-shadow:0 0 0 0 rgba(229,50,45,0.6);} 100%{box-shadow:0 0 0 14px rgba(229,50,45,0);} }
@media (prefers-reduced-motion:reduce){
  .how-cycle .how-line{ transform:scaleX(1); animation:none; }
  .how-cycle .badge::after{ animation:none; }
}
```
Trigger `.in-view` by wrapping the grid in a `Mot.div` with `onViewportEnter={e => e.currentTarget.classList.add('in-view')}` (framer is already imported).
**WARNING:** there is a PARALLEL OLD `how*` 16s-loop system at index.html:3022–3235 NOT used by the current `FeaturesGrid`. Do not touch it — style the current grid only.

---

### 2.7 — Pricing (app.jsx:4400) 🔪🎞 — slash bullets, add the interactive slider toy (highest-retention element)
**Copy 🔪:**
- Cut the long capacity paragraph; KEEP only `Bayar setup sekali. Hosting transparan, pause kapan saja.` (8w).
- KEEP headline `Pilih ukuran tim kamu. Upgrade kapan saja.` (7w).
- Trim each card's `outcomes` to ≤3 bullets, ≤5 words (honest, prices untouched):
  - Solo: `3 persona inti` · `Mode teks` · `VPS dedicated`
  - Voice Starter: `Ngobrol pakai suara` · `3 persona inti` · `VPS dedicated`
  - Library Lengkap: `10 persona, suara` · `VPS 24/7` · `Support antre depan`
  - Siap Pakai: `8 persona + web app` · `Dashboard sendiri` · `Support privat 24/7`
- Move the repeated "Kredit LLM perkenalan…" bullet to ONE footnote under the grid.
- **DO NOT touch any of these literals** (pricing-drift gate): `setupIdr: 99_000` (app.jsx:4414), `setupIdr: 399_000`, `priceLabel: 'Rp 99rb'` (4413), `month1Total: 'Rp 198rb'` (4417), `slug: 'bare'` (4410), `name: 'Solo Starter'`, `slug: 'solo'`, and every sellable slug. The hidden Bare decoy object (4410–4417) STAYS.

**Animation 🎞 (SPEC 2): the interactive value slider — konten's payout-slider equivalent.** This is the single highest-ROI beat; it replaces the most "is it worth it" copy with one draggable gesture.
**Honesty gate (critical):** the readout must NOT invent revenue or savings. Frame it as *volume the agent covers*, with the flat Rp 99rb line as the punch (volume scales, price doesn't). No new price ever appears.

New component, render at the TOP of `Pricing` (app.jsx:4400, above the cards):
```jsx
function ValueSlider() {
  const [tasks, setTasks] = useState(40); // tugas / minggu
  const pct = (tasks - 5) / (200 - 5) * 100;
  return (
    <div className="vslider" style={{ '--vpct': pct + '%' }}>
      <div className="vslider-eyebrow">Geser — lihat berapa yang dia tangani</div>
      <div className="vslider-readout">
        Kalau kamu kasih <b>{tasks}</b> tugas seminggu, satu agent menanganinya —
        hosting tetap <b className="vslider-flat">Rp 99rb/bulan</b>.
      </div>
      <div className="vslider-track" aria-hidden="true"><span className="vslider-fill" /></div>
      <input className="vslider-input" type="range" min="5" max="200" step="5"
        value={tasks} onChange={e => setTasks(+e.target.value)}
        aria-label="Tugas per minggu" />
    </div>
  );
}
```
CSS near the pricing block (~index.html:175):
```css
.vslider { max-width:560px; margin:0 auto 44px; text-align:center; position:relative; }
.vslider-eyebrow { font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:rgba(229,50,45,0.9); margin-bottom:14px; }
.vslider-readout { font-family:'Inter',sans-serif; font-weight:300; font-size:16px; line-height:1.5; color:rgba(245,245,245,0.85); margin-bottom:20px; }
.vslider-readout b { color:#fff; font-weight:600; }
.vslider-readout .vslider-flat { color:#E5322D; }
.vslider-track { position:relative; height:6px; border-radius:999px; background:rgba(255,255,255,0.08); overflow:hidden; box-shadow:inset 0 0 0 1px rgba(229,50,45,0.18); }
.vslider-fill { position:absolute; inset:0 auto 0 0; width:var(--vpct,40%); border-radius:999px; background:linear-gradient(90deg, rgba(229,50,45,0.5), #E5322D); transition:width 0.12s cubic-bezier(0.4,0,0.2,1); }
.vslider-fill::after { content:''; position:absolute; top:0; bottom:0; right:-2px; width:14px; background:radial-gradient(circle, rgba(255,170,160,0.95), transparent 70%); animation:vsliderGlow 1.8s ease-in-out infinite; }
.vslider-input { position:absolute; left:0; right:0; bottom:-10px; width:100%; height:26px; opacity:0; cursor:grab; margin:0; }
.vslider-input:active { cursor:grabbing; }
@keyframes vsliderGlow { 0%,100%{opacity:0.5;} 50%{opacity:1;} }
@media (prefers-reduced-motion:reduce){ .vslider-fill::after{ animation:none; opacity:0.8; } .vslider-fill{ transition:none; } }
```
Perf: one `range` input + a cheap width transition + React state (no rAF).
**Featured-card CTA** gets the glow pulse (Spec 5b, §2.9) — it is already red and on-brand (the white hero button stays un-pulsed).

---

### 2.8 — FAQ (app.jsx:4958) 🔪 — absorb relocated prose, cut 17 → ~7
🔪 Single wordiest block (~720w). Collapse duplicates (two "gak tech-savvy" Qs, two "data aman" Qs, two "cancel/refund" Qs). Tighten answers to 2 sentences. Keep the conversion-blockers + the relocated OriginSection backstory as one new row:
1. `Gak tech-savvy, bisa?` → `Bisa. Setup otomatis, gak install apa-apa. Cukup chat di Telegram.`
2. `Aman buat data bisnis?` → `Agent jalan di VPS pribadi kamu, bukan shared. Kami gak baca isi chat kecuali kamu minta bantuan dan kasih izin.`
3. `Beda sama subscription biasa?` → `Setup sekali bayar. Hosting Rp 99rb transparan kayak bayar listrik, stop kapan saja.`
4. `Berapa biaya LLM?` → `Kredit perkenalan termasuk. Lanjut pakai kunci sendiri, transparan ke penyedia tanpa markup.`
5. `Mau berhenti?` → `Stop kapan saja, tagihan berhenti, setup tetap kamu punya.`
6. `Bisa demo dulu?` → `Bisa. Booking 15 menit, kami tunjukkan agent live.`
7. *(relocated backstory)* `Kok dari China?` → `Tim agent ini dipelajari di Zhejiang University, Hangzhou, lalu dirakit untuk Indonesia.`
(The remaining ~10 belong on a `/faq` page, not the IG landing.)
The FAQ accordion already uses the `transition-[grid-template-rows]` 0fr→1fr trick — keep it; that is konten's exact accordion mechanic.

---

### 2.9 — Stats (app.jsx:5077) 🎞♻️ + CtaFooter (app.jsx:5122) 🔪 + global polish

**Stats → SPEC 3: lift into a flashy proof-bar with count-up.** The `Stats` block already uses `CountUp` (real honest numbers: 8 mnt / 10 / 190+ / 24) but renders near the footer (app.jsx:5410). Lift its `items.map` markup into a `<div className="proofbar">` rendered in `App` right after `<DashboardDemo />` (app.jsx:5397) — or directly under the ValueSlider — so the counting numbers land in the first scroll. Add a staggered odometer entrance:
```css
.proofbar .pb-item { animation:pbRise 0.7s cubic-bezier(0.16,1,0.3,1) backwards; }
.proofbar .pb-item:nth-child(2){ animation-delay:0.08s; }
.proofbar .pb-item:nth-child(3){ animation-delay:0.16s; }
.proofbar .pb-item:nth-child(4){ animation-delay:0.24s; }
@keyframes pbRise { from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:none;} }
@media (prefers-reduced-motion:reduce){ .proofbar .pb-item{ animation:none; } }
```
Remove the old bottom `Stats` render to avoid duplicate count-ups (founder call: keep one).

**CtaFooter 🔪:** KEEP headline `Besok pagi jam 7, briefing pertama dari tim kamu masuk.` (app.jsx:5136 — strongest line on the page). Sub 28w → 9w: `Atau besok sama kayak hari ini. Kamu yang pilih.` Keep legal/contact.

**SPEC 5 — global polish (cheap konten gloss):**
```css
/* 5a — hover lift + red rim on cards */
.pc-card,.how-mockbox{ transition:transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease; will-change:transform; }
.pc-card:not(.pc-card-featured):hover,.how-mockbox:hover{ transform:translateY(-4px); box-shadow:0 18px 50px -28px rgba(229,50,45,0.5); border-color:rgba(229,50,45,0.4); }
/* 5b — glossy CTA + sheen sweep (apply .cta-pulse to the FEATURED pricing CTA + navbar Mulai, NOT the white hero button) */
.cta-pulse{ position:relative; overflow:hidden; animation:ctaPulse 3.4s ease-in-out infinite; }
.cta-pulse::after{ content:''; position:absolute; top:0; bottom:0; left:-60%; width:40%; transform:skewX(-20deg);
  background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%); animation:ctaSheen 3.4s ease-in-out infinite; }
@keyframes ctaPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(229,50,45,0);} 50%{box-shadow:0 0 28px -2px rgba(229,50,45,0.55);} }
@keyframes ctaSheen{ 0%{left:-60%;} 60%,100%{left:130%;} }
@media (prefers-reduced-motion:reduce){ .pc-card:hover,.how-mockbox:hover{transform:none;} .cta-pulse{animation:none;} .cta-pulse::after{display:none;} }
```
**SPEC 6 — scroll-reveal as the default motion.** Any block that does not already animate gets `Mot.div` with `initial={{opacity:0, y:16}}` / `whileInView={{opacity:1, y:0}}` / `viewport={{once:true, amount:0.3}}` / `transition={{duration:0.7, ease:EASE}}`. This is the single pattern (konten does it ~45×) that makes the whole page feel "heavily animated" cheaply. framer respects reduced-motion by default; no extra guard needed for these.

Optional warm bottom-tints per section (konten temperature trick): faint `radial-gradient` warm base at section bottoms — low priority, do last.

---

## 3. PHASED BUILD ORDER (highest IG-impact first; rebuild + gates + Playwright after EACH)

**Phase A — Hero (Spec 1 circuit + copy cut + sub-copy ≤18w).** §2.2. The instant konten read + biggest reading-load drop.
**Phase B — "How it works" visual steps (Spec 4) + FeaturesGrid copy slash.** §2.6. Sequence reads as motion.
**Phase C — OriginSection slash + IntegrationsSpine pill/phone-float/desc-slash.** §2.4, §2.3.
**Phase D — Pricing slider (Spec 2) + bullet slash + proof-bar lift (Spec 3).** §2.7, §2.9. The signature toy.
**Phase E — Carousel trim + FAQ 17→7 + CtaFooter trim + global polish (Spec 5/6).** §2.5, §2.8, §2.9.

After every phase:
```bash
node scripts/build-landing.mjs
node --test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts
```
Then Playwright (load `index.html` via a static server, e.g. `npx serve` or open the built file): screenshot at **1440×900 (desktop)** and **390×844 (mobile)**; drag the slider and assert the readout updates and the Rp 99rb line never changes; toggle `prefers-reduced-motion` and confirm motion stills (no layout breakage). Visually confirm the new section is graspable in <3s without reading.

---

## 4. TEST / VERIFY (definition of done)

1. `node --test tests/landing-build.spec.ts` green — freshness (byte-for-byte rebuild) + honest-demo strings present + banned demo substrings absent.
2. `node --test tests/landing-pricing-drift.spec.ts` green — all setup-fee literals + slugs intact.
3. Banlist + exclamation re-grep clean (commands in §0). Manually scan every NEW string for `!` and the banned-word list (including unicode `10×`).
4. Responsive: desktop + mobile screenshots show 2-line headlines not wrapping into mush; phone column edge-feathered; slider draggable on touch.
5. Reduced-motion: every new block has its guard; toggle and confirm stills.
6. **Reading-load sanity:** each section from hero → pricing should be graspable in <3s — pill + 2-line headline + mock/numbers, no paragraph above the FAQ.
7. Confirm the two honest hero strings still live at app.jsx:2707 / :2716 after the rewrite.

---

## 5. OPEN FOUNDER DECISIONS (surface before/while building)

1. **Voice latitude.** The directive says relax calm-premium toward PUNCHY + MINIMAL. konten leans slangy (`doang`, `cuan ngalir`, `gak perlu ribet`). How far do we go? This prompt uses light slang (`gak`, `kamu`, `beneran`, clipped 2-liners) WITHOUT `!`. Founder to confirm tone ceiling — e.g. is `doang`/`ngalir` on-brand for us, or keep it a notch more composed.
2. **School Expert status.** Kept as "pantau/siapkan" (honest future-tense, app.jsx:5205). Confirm we never imply it submits/does the schoolwork.
3. **Slider framing.** The ValueSlider shows task *volume* + the flat Rp 99rb line — no savings/revenue claim. Confirm this honest framing is acceptable, or supply a real metric to drive it (it must trace to a shipped fact: Rp 99rb flat, 10 personas, 190+ templates, 8-min setup).
4. **3 vs 4 steps** in FeaturesGrid (konten uses 3). Keep 4 or drop to 3.
5. **Drop the bottom `Stats`** after lifting it into the proof-bar (avoids duplicate count-ups), or keep both.
6. **`/faq` page** for the ~10 FAQ rows we're removing from the landing — build now or defer.

---

## 6. CONSTRAINTS + NON-GOALS

- **Do NOT** add a second canvas/WebGL — the hero already runs `DottedVideo` (app.jsx:2817). All new motion is SVG `stroke-dashoffset` / CSS `transform`+`opacity`+`filter` / one `range` input.
- **Do NOT** animate `width/height/top/left/box-shadow` on hot paths (compositor-only properties), except the precedented glow pulses.
- **Do NOT** edit `assets/app.js` / `assets/tw.css` by hand; they are generated.
- **Do NOT** alter any price literal or slug (pricing-drift gate); the hidden Bare decoy (app.jsx:4410–4417) stays.
- **Do NOT** touch the old `how*` 16s-loop system (index.html:3022–3235) — it's unused by the current grid.
- **Do NOT** add `!`, banned words, or fabricated capabilities — ever.
- **Non-goals:** new copy sections, new pages (except optional `/faq`), new npm packages, redesigned color system, new fonts. This is a motion + brevity pass on the existing structure, not a rebuild.

---

### Key files
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/assets/app.jsx` — all components + copy (anchors verified: Navbar 406, DashboardDemo 2699 [hero video 2817, dim 2818, headline 2825, honest strings 2707/2716], StartSection 2668 [headline 2685, AgentCarousel 1831], IntegrationsSpine 5184 [headline 5215, descs 5187–5208, School Expert 5205], OriginSection 5275 [headline 5317], FeaturesGrid 3496 [headline 3568], Pricing 4400 [price pins 4410–4417, utility-meter 3902], FAQ 4958, Stats 5077, CtaFooter 5122 [headline 5136], render order 5396–5411; primitives CountUp 337 / BlurText 376 / DottedVideo 72).
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/index.html` — the single `<style>` (51–4184, 105 keyframes; reuse `priceGlowPulse` 54, `utilMeterDraw` 89, `isFlow` 452, `isShotFade` 426; hero CSS 300–323).
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/scripts/build-landing.mjs` — the build (Tailwind 3.4.17 pinned).
- Gates: `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/tests/landing-build.spec.ts` (freshness + honesty banlist at :64–78) · `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/tests/landing-pricing-drift.spec.ts` (price/slug pins).