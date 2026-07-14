# Landing redesign build prompt — weuseai.id

> Generated 2026-06-16 by a 9-agent ultracode workflow (5 architects + 3 critics + synthesis), verified against the working tree. Hand to a fresh Opus 4.8 + ultracode session. Edits assets/app.jsx → rebuild via scripts/build-landing.mjs (freshness-gated).

# THE PERFECT BUILD PROMPT — weuseai.id Landing Redesign

You are the lead front-end engineer redesigning the **weuseai.agent** marketing landing page for its new domain **weuseai.id**. Execute this end-to-end. Every line/path below was verified against the working tree on 2026-06-16. Cited line numbers are valid only against the **pristine** tree — re-ground after each phase because edits shift them.

---
## ✅ FOUNDER DECISIONS — RESOLVED (2026-06-16), override §7 defaults
1. **Integration status + REAL APP NAMES:** the founder confirms the 3 apps are **LIVE today**, built/operated OUTSIDE this repo, and named **R2 Content · R2 Fit · R2 Finance** (the agent connects INTO them and does work there). The 4th = **R2 School / Gmail** (coming — email + school portal + assignments). The repos (`/Volumes/Extreme SSD/R2-Build`, `R2-Finance`, `fitness`, `R2-School`) + their Claude project memory exist but weren't mounted/rich when checked 2026-06-14→16, so the exact value-prop copy below is a **DRAFT inferred from the names** — founder must confirm/replace. → tiles: R2 Content / R2 Fit / R2 Finance = **`status:'live'` (Aktif, pulsing)**; R2 School/Gmail = **`segera`** (dashed/static). The §3.2 array below uses the real names.
   - **STILL NEEDED FROM FOUNDER before this section ships:** confirm (or correct) the one-line value prop + the micro-stat for each of R2 Content / R2 Fit / R2 Finance, and a one-word confirm of what each app actually does (don't assume my drafts are accurate).
2. **Gmail/Sekolah:** keep `segera`, future-tense, scope-vague, **`menyiapkan tugas` (prepares) — NEVER `mengerjakan` (does it for you)**. UU-PDP/consent still flagged (reading email is personal data) — founder to confirm before that tile ever flips to live.
3. **Build pacing:** founder is reviewing this prompt before the build starts — do NOT begin editing `app.jsx` until the founder gives the go + the real integration copy.
---


**Repo root:** `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/`
**The source you edit:** `assets/app.jsx` (5256 lines, React via global UMD, `React.createElement`, Tailwind classes). **Never hand-edit `assets/app.js` or `assets/tw.css`** — they are build artifacts.
**Component CSS lives in:** `index.html` inside one `<style>` block (lines ~51–3939). There is no separate CSS file. New keyframes/rules go there.

---

## 1. GOAL + THE NEW PAGE ORDER

**Goal:** Replace the China-recipe video hero with the live dashboard-chat mockup as the top hero; make "your agent does real work in 4 apps" the dominant, conversion-driving centerpiece directly under the hero; make pricing fit one viewport on 14"/13" MacBooks; enlarge the 4-step cards; rebuild the persona carousel as a true infinite loop with a button on every card; turn the Rp 99rb/bulan line into a tasteful "utility meter" wow moment; migrate the displayed/canonical domain to **weuseai.id**; delete the China section entirely. Brand voice locked (Bahasa Indonesia, `kamu`, calm-premium, zero exclamation in body, no banned words).

**Current `App()` order (verified, `app.jsx:5234–5249`):**
`Navbar → Hero(video/China) → StartSection(#proses carousel) → DashboardDemo → FeaturesChess → VelvetSection → FeaturesGrid(4-step) → ChatVsAgentSection → HangzhouEdge → CostComparisonSection → Pricing → CommunitySection → FAQ → Stats → CtaFooter`

**THE CANONICAL NEW ORDER (this is the single source of truth — the three component specs disagreed; THIS one wins):**

```
Navbar                  KEEP
Hero                    CHANGE → becomes the dashboard-chat hero (DashboardDemo frame lifted in); video + China copy DELETED
IntegrationsSpine       ADD  ← THE CENTERPIECE (req 8); immediately after hero, BEFORE the carousel
StartSection (#proses)  KEEP → persona carousel, rebuilt (req 6); KEEP id="proses"
FeaturesChess           KEEP
VelvetSection           KEEP
FeaturesGrid (4-step)   CHANGE → bigger cards (req 4)
ChatVsAgentSection      KEEP
HangzhouEdge            DELETE  ← entire section + its function definition (req 5)
CostComparisonSection   KEEP
Pricing                 CHANGE → full-viewport fit + Rp99k wow meter (req 3 + 7)
CommunitySection        KEEP
FAQ                     KEEP
Stats                   KEEP
CtaFooter               CHANGE → de-China the closing copy (req 5)
DashboardDemo           REMOVE from flow (its frame is absorbed into Hero)
```

Resolved conflicts: `IntegrationsSpine` is the authoritative component name (not `IntegrationsSection`). It goes **after Hero, before StartSection** (conversion critique §3 — lead with the differentiated claim, not the carousel). `DashboardDemo` is no longer a standalone sibling.

---

## 2. BUILD MECHANICS + GUARDRAILS (IMPOSSIBLE TO SKIP)

**The one true loop — after EVERY edit to `app.jsx` or `index.html`:**

```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah"
node scripts/build-landing.mjs          # esbuild app.jsx→app.js (minified, es2018, createRoot); tailwind→tw.css. ~200ms.
npx tsx --test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts   # the gates (use the repo's runner invocation)
```

**Why you cannot skip the rebuild:** `tests/landing-build.spec.ts:22–38` reruns `build-landing.mjs` and asserts the committed `app.js`/`tw.css` are **byte-for-byte identical** to a fresh build. If you edit `app.jsx` and forget to rebuild, CI reds with "assets/app.js is stale." A clean rebuild on the pristine tree currently reproduces both artifacts exactly — keep it that way.

**Gates that MUST stay green (all in `tests/landing-build.spec.ts` unless noted):**
1. **Freshness (22–38):** rebuild reproduces artifacts byte-for-byte. → Always rebuild before claiming done.
2. **Stack integrity (40–50):** `index.html` MUST keep `<script src="/assets/app.js" defer></script>` and `<link rel="stylesheet" href="/assets/tw.css">`, and MUST NOT contain `babel`, `cdn.tailwindcss.com`, `hls.min.js`, or `type="text/babel"`. Your meta/head edits don't touch these — don't introduce any banned string.
3. **Compile + sane bundle (52–62):** `app.jsx` must esbuild-compile clean (the `HangzhouEdge` deletion must leave no dangling braces), `app.js` > 50KB, contains `createRoot`, no `import` statements.
4. **Demo honesty (64–78):** greps **all of `app.jsx`** for banned fabricated-capability substrings — confirmed list: `Sorted`, `emails`, `GST`, `PR #142`, `Auto-publish`, `Auto-monitor`, `otomatis ke OLX`, `kalender di-sync`, `Otomatis dibaca`, `10×` (and more on lines 70–72). And asserts two strings stay PRESENT: `Pagi Briefing — dikirim otomatis` and `Aku tidak mengirim apa pun tanpa kamu setujui` (both inside the `DashboardDemo` conversation array). **Any new copy you write must clear the banned list; the two required strings must survive the hero extraction.**
5. **Pricing drift (`tests/landing-pricing-drift.spec.ts`):** asserts tier setup-fee literals `setupIdr: 99_000`, `setupIdr: 399_000`, etc. are intact. **Do not change any price.** Your pricing work is layout/animation only.

**Brand gates (manual, per CLAUDE.md):** zero `!` in body (max 1 per caption), `kamu` not `Anda`/`lo-gue`, dark `#0a0a0a` / ink `#f5f5f5` / accent `#E5322D`, Inter + Instrument Serif. BANNED words: `basically, just, literally, honestly, kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level`. Filter: "would someone I respect in Jakarta save this or scroll past?"

**Regression discipline:** `index.html` + `app.jsx` are shipped production. Preserve `Navbar`, FAQ, footer, all `checkout.html` / `wa.me/6282154902561` / `cal.com/weuseai.agent/15min` links, and the og/canonical meta. **Re-verify in a browser preview after every phase's rebuild** (serve the dir; load `index.html`; check console is clean, the changed section renders, nav/FAQ/footer/checkout still work).

**Concurrency note:** this prompt is executed serially by one session in the phase order of §5. Do the **deletions first** (they shrink the file), re-ground line numbers after each phase, do `App()` wiring last, and run ONE final rebuild + full `npm test` after everything merges.

---

## 3. COMPONENT-BY-COMPONENT BUILD SPEC

### 3.1 HERO SWAP (req 2) — promote the dashboard-chat mockup to top, delete video/China hero

The mockup already exists fully built as `DashboardDemo()` (`app.jsx:2729–2923`) with all `.db-*` CSS in `index.html:248–746`. **Reuse it; do not rebuild the mockup.**

**Steps (Option A — lowest risk):**
1. **Extract the frame.** In `DashboardDemo()` keep the conversation array, state machine, and render helpers UNCHANGED (the honesty-gate strings live there). Rename it `DashboardFrame()` and remove its own `db-eyebrow`/headline/sub block (~`app.jsx:2845–2852`) — it returns from `<div className="db-frame">` (~2854) down only. **Do NOT trim the conversation array (2736–2763)** — it is load-bearing for the honesty gate.
2. **Rewrite `Hero()` (`app.jsx:438–551`).** Keep `id="beranda"`. Drop the `<video>`/`DottedVideo` (441–447), `hero-grain` (448), the `Resep Hangzhou` pill (466), the China headline (471), the Zhejiang sub-copy (481), and the old 4-stat glass block (515–547). Render: eyebrow pill (`Agen kamu bekerja` + `.live-dot`), `<h1 className="db-headline">`, sub-line, two CTAs, trust line, then `<DashboardFrame />`.
   - **CRITICAL (brand critique D3):** the existing headline has an explicit `<br className="hidden md:inline" />`. Do **NOT** route it through `BlurText` (it word-splits and drops the `<br>`, causing a ragged 3-line wrap on 13"). Render the headline as a plain `<h1 className="db-headline">Satu super-agent. Growing skills.<br className="hidden md:inline" /> Create Anything You Want.</h1>`. Keep the EN/ID mix verbatim (founder-locked).
   - **CRITICAL (completeness critique A1):** add `className="db-section"` to the hero `<section>` so `.db-section::before` (the radial red wash) and `.db-section .db-eyebrow-pill .live-dot` scope correctly. Verify in preview the wash actually renders on `#beranda`; if not, carry the `radial-gradient` inline.
   - **CRITICAL (completeness G1):** the old hero may have had a reduced-motion guard; the new `Mot.div` entrances must respect `prefers-reduced-motion` — wrap entrance transitions so they no-op under reduced motion (the file's existing pattern), since the global RM strategy is selective (only `.agent-track { transition: none }`), NOT a blanket kill.
3. **Copy (locked):**
   - Eyebrow: `Agen kamu bekerja`
   - H1: `Satu super-agent. Growing skills. Create Anything You Want.`
   - Sub: `Dia yang menyapa kamu duluan — briefing pagi masuk sebelum diminta, draft dan laporan jadi sebelum kamu sempat minta dua kali. Bukan chatbot yang nunggu ditanya; tim yang mengerjakan.`
   - Trust line: `Setup 5 menit · bayar pakai QRIS · hosting Rp 99rb/bulan · berhenti kapan saja`
   - CTAs: primary **`Aktifkan asisten kamu`** → `checkout.html`; secondary **`Konsultasi gratis (15 menit)`** → `https://cal.com/weuseai.agent/15min`.
   - **Honesty hedge (completeness B2):** the old `DashboardDemo` sub had `Ilustrasi pengalaman; integrasi email dan kalender menyusul bertahap.` (~2851). It is being dropped. Re-home a short `Ilustrasi pengalaman.` hedge near the `DashboardFrame` (e.g. a `font-mono text-[10px] text-white/40` caption under the frame) so the page keeps an "illustration" disclaimer next to a mockup showing a calendar deliverable.
   - **Add a 4-app proof micro-row under the trust line (conversion §2/§5):** four glyph+dot chips — `Content · Fitness · Finance · Gmail` — with 3 dot states matching the IntegrationsSpine status (live vs dashed). This puts the differentiated claim above the fold. Status MUST match §3.2's resolved live/coming decision (default: all dashed/"Segera" until founder confirms).
4. **Re-order `App()`** per §1: `<Hero />` first child (now the dashboard hero), then `<IntegrationsSpine />`, then `<StartSection />`. Remove `<DashboardDemo />` (5238) and `<HangzhouEdge />` (5243).

### 3.2 ⭐ THE 4-INTEGRATION CENTERPIECE — `<IntegrationsSpine />` (req 8, THE highlight)

Mount immediately after `<Hero />`, before `<StartSection />`. `id="integrasi"`.

**HONESTY GATE — READ FIRST (this is the #1 blocker, blends the integrations spec §0 + the conversion critique §1):**
Ground truth: `supabase/functions/_shared/tier-personas.ts:100,126` — `web_app` is a **boolean FLAG only**, false on all tiers except `done-for-you`/`enterprise`, and even those are "FLAGS only." There is **zero Content/Fitness/Finance app code** anywhere in the repo. Therefore these apps are **NOT live today**.

- **Default ship state: all four tiles = `status:'segera'` (coming).** Do NOT label anything `Aktif` without founder confirmation. Flipping a tile to live is a one-field change (`status:'live'`).
- **Conversion warning (critique §1):** a centerpiece with four "Segera" chips *suppresses* willingness-to-pay — it stamps "not built yet" on the page's biggest claim. **This is why §7 lists "which of the 3 apps are genuinely live" as the #1 founder decision.** If the founder confirms the 3 web apps are live → ship 3× `Aktif` (solid pulsing spokes) + Gmail `Segera` (dashed). If demo/beta → use `Beta terbatas`. If roadmap-only → demote this from centerpiece to a one-line roadmap strip.
- **Overclaim guardrails (enforce regardless):** a spoke only PULSES (`ucEdge` traveling dot) if its tile is `live`; `segera` spokes are static `stroke-dasharray` dashed + dim (`rgba(255,255,255,.14)`). The animated diagram reads as live data-flow before the eye reads the chip — so an animated spoke into a non-live app is a visual lie even if the text says "Segera." Gmail/Sekolah copy stays future-tense, scope-vague (`merangkum yang penting`, not `membaca semua email`), and uses **`menyiapkan tugas`** (prepares) NOT **`mengerjakan tugas kamu`** (does it for you) — the latter is an academic-integrity + UU-PDP liability. Flag PDP/consent to founder.

**Layout:** centered hub-and-spoke SVG (one `AGEN` hub node → 4 app nodes) above a 4-up tile grid. Equal tiles (one agent, four reaches — no hierarchy).

**Data-driven component (add to `app.jsx`, mount in `App()`):**
```jsx
const INTEGRATIONS = [
  { key:'content', name:'R2 Content', viz:'content', status:'live',  // founder-confirmed LIVE 2026-06-16; line/micro below are DRAFT [CONFIRM]
    line:'Agen kamu menyusun konten — dari kalender posting sampai draf caption — langsung di tempat kamu mengaturnya.',
    micro:'7 post terjadwal minggu ini.' },          // ← prefer a concrete artifact over a category label (conversion §5)
  { key:'fitness', name:'R2 Fit', viz:'fit', status:'live',  // founder-confirmed LIVE 2026-06-16; line/micro below are DRAFT [CONFIRM]
    line:'Agen kamu menata program latihan dan mencatat progres, jadi kamu tinggal jalan tanpa mikir rencananya.',
    micro:'Streak 12 hari berjalan.' },
  { key:'finance', name:'R2 Finance', viz:'fin', status:'live',  // founder-confirmed LIVE 2026-06-16; line/micro below are DRAFT [CONFIRM]
    line:'Agen kamu merapikan pemasukan dan pengeluaran, lalu memberi ringkasan yang langsung kamu mengerti.',
    micro:'Ringkasan cashflow tiap minggu.' },
  { key:'gmail', name:'Gmail / Sekolah', viz:'mail', status:'segera',
    line:'Agen kamu membaca email dan portal sekolah kamu, merangkum yang penting, dan menyiapkan tugas sebelum tenggat.',
    micro:'Email, portal, tenggat.' },
];
```
Eyebrow `AGEN KAMU NGGAK CUMA MENJAWAB` (brand critique A1 — keep `nggak`, **drop `doang`**; `menjawab` is a half-step more premium than `ngobrol`). Headline (Instrument Serif): `Dia kerja di app beneran.` Sub: `Bukan cuma jawaban di chat. Agen kamu masuk ke aplikasi yang kamu pakai tiap hari, lalu mengerjakan — bukan menyuruh kamu mengerjakan.` Add a closing line under the grid tying value to price (conversion §5): `Empat app. Satu agen. Hosting Rp 99rb/bulan.`

**Tile viz — reuse existing idiom (don't reinvent):** Content → `uc-content`; Gmail → `cap-email`; Fitness → new `is-fit` heartbeat polyline w/ `ucEdge` dash-pulse (~8 lines CSS); Finance → new `is-fin` 3-bar climb using the `pv-mem .ticks` idiom (~8 lines). Each viz should read as "a result that landed in the app," matching the hero's concrete register (the hero shows real `q4-sales-pivot.xlsx`, `IDR/USD 15.892`).

**CSS** (add `.is-*` rules to the `index.html` `<style>` block, same dialect as `.db-section`/`.uc-*`). Status chip reuses `priceLiveDot` for `live`, muted dashed for `segera`.

**MUST-FIX reduced-motion (brand critique B6 — the integrations spec OMITTED this):**
```css
@media (prefers-reduced-motion: reduce) {
  .is-hub .edge, .is-hub .node, .is-dot, .is-chip .is-dot { animation: none; }
}
```

**Honesty-gate self-check:** before rebuild, confirm none of your tile copy contains a banned substring (`emails`, `Otomatis dibaca`, `kalender di-sync`, `Auto-publish`, etc.). The Gmail line uses `email` (singular, safe) — keep it that way.

**Mobile (conversion §2 — the IG screenshot is mobile):** do NOT `display:none` the hub on phones. Build a **vertical hub variant** (agent node top, 4 app nodes fanning down) that survives 380px, so the IG screenshot asset exists on the device screenshots are taken on. Hide the *horizontal* hub only between ~768–900px (where a 760px-wide 4-spoke diagram compresses awkwardly) and show the vertical variant ≤767px.

### 3.3 PRICING FULL-VIEWPORT (req 3) — `Pricing()` @4460, `PricingCard()` @3830, grid @4625, wrapper @4599

**Do not touch tier values (4467–4587)** — the drift gate pins them. Layout/animation only.

**3a. Engage 5 columns at the right width + tighten gaps (JSX @4625):**
```jsx
// BEFORE: grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-5 items-stretch
// AFTER:  pricing-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 xl:gap-4 items-stretch
```
**Keep 5-col at `xl` (1280), NOT `lg` (1024)** (brand critique B1 — 5 cols at 1024px = ~180px each, unreadable; the width math only validates ≥1280). Bump the inner wrapper @4599 from `max-w-6xl` to `max-w-[1320px]` — **edit ONLY line 4599, never `replace_all`** (`max-w-6xl` appears at 3030, 3573, 4072, 4599, 4961; 3573 is the 4-step container that §3.5 also edits).

**Layout math:**
- **14" (1512px):** inner width after `lg:px-16` (128px) ≈ 1384px. 5 cards + 4×16px gaps → card ≈ 264px. Comfortable.
- **13" (1280px):** inner width ≈ 1152px. 5 cards + 4×12px gaps → card ≈ 221px. Tight but legible only WITH the §3d cuts below (mandatory, not optional).

**3b. Compress section chrome — raw CSS in `index.html` `<style>`, keyed off HEIGHT (Tailwind has no height variants):**
```css
@media (min-width: 1280px) and (max-height: 940px) {   /* 14" w/ browser chrome ≈ 840px usable < 940 → engages */
  #pricing { padding-top: 56px; padding-bottom: 56px; }
  #pricing .pricing-head { margin-bottom: 28px; }
  #pricing .pricing-head .pricing-h2 { font-size: 2.6rem; line-height: 1.0; }
  #pricing .pricing-head .pricing-sub { margin-top: 12px; font-size: 0.8rem; }
  #pricing .pricing-head .pricing-intro { display: none; }
}
@media (min-width: 1280px) and (max-height: 800px) {   /* 13" */
  #pricing { padding-top: 40px; padding-bottom: 40px; }
  #pricing .pricing-head { margin-bottom: 20px; }
  #pricing .pricing-head .pricing-h2 { font-size: 2.2rem; }
}
```
Add hook classes in JSX: header wrapper @4600 → `pricing-head`; intro `<p>` @4607 → `pricing-intro`; sub `<p>` @4618 → `pricing-sub`. **CRITICAL (brand B1):** the headline is `BlurText as="h2"` — add an explicit `pricing-h2` class to it and target `#pricing .pricing-h2`, do NOT rely on a bare `h2` descendant selector (fragile if BlurText wraps the tag in a motion div → the font-size override would silently no-op and the headline stays 60px, blowing the budget).

**3c. Compress card internals (raw CSS, same block):**
```css
@media (min-width: 1280px) and (max-height: 940px) {
  #pricing .pricing-grid > * { padding: 18px !important; }
  #pricing .pricing-grid .pc-block { margin-top: 14px; }
  #pricing .pricing-grid .pc-outcomes > li { font-size: 12.5px; line-height: 1.35; }
  #pricing .pricing-grid .pc-outcomes { gap: 7px; }
  #pricing .pricing-grid .pc-cta { margin-top: 16px; padding-top: 10px; padding-bottom: 10px; }
  #pricing .pricing-grid .pc-month1 { font-size: 1.6rem; }
}
```
Add hooks in `PricingCard`: the three `mt-6` blocks (~3927/3937/3961) → `pc-block`; outcomes `<ul>` (~3946) → `pc-outcomes`; Bulan-1 total `<span>` (~3910) → `pc-month1`; CTA `<a>` (~3981) → `pc-cta`; "Untuk siapa" block (~3927) → `pc-persona`.

**3d. Trim the tallest card — MANDATORY for the 13" contract (brand critique B1, not optional):**
```css
@media (min-width: 1280px) and (max-height: 940px) {
  #pricing .pricing-grid > *[style*="priceGlowPulse"] { transform: scale(1) !important; }  /* normalize featured scale */
}
@media (min-width: 1280px) and (max-height: 800px) {
  #pricing .pricing-grid .pc-persona { display: none; }   /* reclaim ~52px/card on 13" */
}
```

**3e. Keep REKOMENDASI emphasis:** the metallic border + `priceGlowPulse` + "Rekomendasi kami" pill stay; only the *scale* is normalized at the fit breakpoint.

### 3.4 THE Rp99k WOW CARD (req 7) — utility-meter under the hosting figure

Replace the plain hosting row (`app.jsx:3898–3904`, figure at 3902) with a `HostingMeter` sub-component (add above `PricingCard` ~3829). Metaphor: "bayar kayak listrik" — a red current sweeps L→R like an electricity meter. Figure stays static in Instrument Serif; only a 4px secondary bar animates.

```jsx
function HostingMeter({ amount = 'Rp 99rb', featured = false }) {
  return (
    <div className="hosting-meter" data-featured={featured ? '1' : undefined}>
      <div className="hm-row">
        <span className="hm-label">Hosting per bulan</span>
        <span className="hm-amount">{amount}<span className="hm-per">/bulan</span></span>
      </div>
      <div className="hm-meter" aria-hidden="true"><span className="hm-flow" /></div>
      <div className="hm-foot"><span className="hm-dot" />bayar kayak listrik · stop kapan saja</div>
    </div>
  );
}
// swap the hosting block for:  <HostingMeter amount={tier.hostingMonth || 'Rp 99rb'} featured={isFeatured} />
```

**CSS (add near pricing CSS in `index.html` `<style>`):**
```css
.hosting-meter { margin-top:10px; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); }
.hosting-meter[data-featured="1"] { border-color:rgba(229,50,45,0.30); background:rgba(229,50,45,0.04); }
.hosting-meter .hm-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.hosting-meter .hm-label { font-family:'Inter',sans-serif; font-weight:300; font-size:12px; color:rgba(255,255,255,0.55); }
.hosting-meter .hm-amount { font-family:'Instrument Serif',serif; font-size:17px; letter-spacing:-0.02em; color:#fff; }
.hosting-meter .hm-per { font-family:'Inter',sans-serif; font-weight:300; font-size:11px; color:rgba(255,255,255,0.45); margin-left:3px; }
.hosting-meter .hm-meter { position:relative; margin-top:9px; height:4px; border-radius:3px; overflow:hidden; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.04); }
.hosting-meter .hm-flow { position:absolute; inset:0; width:42%; border-radius:3px;
  background:linear-gradient(90deg, rgba(229,50,45,0) 0%, rgba(229,50,45,0.35) 30%, #E5322D 60%, rgba(229,50,45,0.35) 80%, rgba(229,50,45,0) 100%);
  box-shadow:0 0 10px rgba(229,50,45,0.55); will-change:transform,opacity; animation:hmFlow 2.6s cubic-bezier(0.45,0,0.55,1) infinite; }
.hosting-meter[data-featured="1"] .hm-flow { animation-duration:2.1s; }
@keyframes hmFlow { 0%{transform:translateX(-110%);opacity:0.4;} 45%{opacity:1;} 100%{transform:translateX(240%);opacity:0.4;} }
.hosting-meter .hm-foot { margin-top:8px; display:flex; align-items:center; gap:7px; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.42); }
.hosting-meter .hm-dot { width:5px; height:5px; border-radius:50%; background:#E5322D; flex:0 0 auto; will-change:opacity,box-shadow; animation:priceLiveDot 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .hosting-meter .hm-flow { animation:none; transform:none; width:100%; opacity:0.5; background:linear-gradient(90deg, rgba(229,50,45,0.45), #E5322D); }
  .hosting-meter .hm-dot { animation:none; box-shadow:0 0 6px rgba(229,50,45,0.7); }
}
```
Reuses the existing `priceLiveDot` keyframe (`index.html:2491`). Meter is `aria-hidden`; figure + caption carry meaning. Ship the meter alone first; the optional text-shimmer is garnish only (and needs an `@supports (-webkit-background-clip:text)` guard if used, else amount can go invisible on old engines).

### 3.5 PERSONA CAROUSEL — true infinite loop, button on every card (req 6) — `AgentCarousel()` @1897, `AGENTS` @1885, `AgentVisual()` @1827, CSS in `index.html`

**Verified ground truth:** `AgentVisual` renders `<video src="/assets/${file}.mp4">`. There are **9 mp4s** on disk. **The Business Director card is shipping a BLACK BOX in production right now** — `AGENTS[8]` has `file:'business-agent'` but `assets/business-agent.mp4` does NOT exist (only `business-director.mp4` does). The 4 personas the founder wants added (Slide Master / Web Creator / Video Producer / Social Conductor) have NO mp4 — that's why they were dropped. `email-manager`/`calendar-agent` have no `PERSONA_DETAILS` entry so their cards have no button. The loop has ~720ms dead air (`setTimeout(snapTo, 720)` @1982/1996; `wrapping.current` blocks input @1975/1990).

**A. Fix the black box + asset gap (Option B — poster fallback, unblocked):**
- Fix `AGENTS[8]` → `file:'business-director'` (fixes the live defect).
- Add a `glyph` prop to `AgentVisual`. When `file` is falsy, render a CSS poster (`.agent-poster` glyph + `segera hadir`) instead of `<video>` — no black box. Guard the IntersectionObserver effect with `if (!file) return;`.
- Replace `AGENTS` (1885) with 13 entries: the 9 video personas (each gains a `glyph`), then 4 poster personas (`file:null`, with `glyph`): `slide-master`, `web-app-builder` (name "Web Creator"), `social-conductor`, `video-producer`. Video cards first so first paint is all-video.
- **Brand critique A4 — honesty parity:** the carousel descs assert `Bitget read-only sync` (Trade Pro, pre-existing) and would add `listing marketplace lokal` (Web Creator). These are the SAME class of claim the IntegrationsSpine audit gates. Flag both to founder; keep `Bitget read-only sync` (pre-existing) but DROP unconfirmed new capability claims from poster descs unless the founder confirms.

**B. Button on every card** (replace `detailSlugMap` @2054):
```js
const detailSlugMap = {
  'app-builder': 'web-app-builder',
  'email-manager': 'email-manager',    // needs new PERSONA_DETAILS entry (founder copy) OR fallback href
  'calendar-agent': 'calendar-agent',  // same
  'business-director': 'business-agent',
};
const candidate = detailSlugMap[a.file] || a.slug || a.file;   // poster cards fall back to a.slug (all in PERSONA_DETAILS)
```
For `email`/`calendar`: either author two `PERSONA_DETAILS` entries (founder copy review) OR fall back to `#pricing` ("Lihat paket"). Keep `onClick={(e)=>e.stopPropagation()}` (@2085).

**C. Kill the dead wait — continuous rAF marquee with click-snap (replaces the paged sentinel design):**
1. Track = `[...AGENTS, ...AGENTS]` (render twice). Remove the single-sentinel map (@2047).
2. One `offset` ref driven by `requestAnimationFrame`: `offset += speed*dt` (~38 px/s, calm; one lap ~45–60s). When `offset >= halfWidth` (= `N * pitch`), subtract `halfWidth` — invisible because copy 2 is pixel-identical. True infinite loop, no transition toggle.
3. Apply via `transform: translate3d(-offset,0,0)` each frame; track has NO CSS `transition` in drift mode.
4. Pause = stop rAF (`onMouseEnter`/`onFocus`), keep `offset`, resume from same offset (no jump).
5. Click-next/prev/dots/keyboard = "snap" mode: temporarily set `transition: transform 520ms cubic-bezier(.22,.61,.36,1)`, animate `offset` ± pitch, on `transitionend` clear transition + resume rAF (re-modulo into `[0, halfWidth)`). No `wrapping` lock → a second click mid-snap just retargets (fixes the input-drop bug).
6. Swipe = Pointer Events (works on desktop mouse-drag too): `pointerdown` capture startX/startOffset + pause; `pointermove` `offset = startOffset - dx`; `pointerup` `|dx|<8` = tap (let button click through), else resume drift. `touch-action: pan-y` on the fade wrapper so vertical page scroll survives on mobile.
7. `prefers-reduced-motion`: do NOT run rAF; render a static strip, keep only click-next/dots (instant jump).

**D. A11y:** keep `role="region"` + `aria-roledescription="carousel"`; set `aria-live="off"` during drift, `"polite"` after a snap settles (or a visually-hidden "Kartu X dari 13: {name}" status node); every non-duplicate card `tabIndex={0}`, copy-2 cards `aria-hidden + tabIndex=-1`; ArrowLeft/Right → snap; keep per-card Enter/Space.

**E. Feel:** desktop gap 18→22px; widen mask feather to 40px; add `box-shadow: inset 0 -40px 60px -30px rgba(229,50,45,0.25)` red wash on `.agent-viz` (unifies video + poster); hover lift (`translateY(-4px)`, red border, glow); `-webkit-line-clamp:2` on desc for uniform card height.

**F. Headline (founder decision, brand critique D4):** `StartSection` headline (@2715) says "Sepuluh spesialis" but the carousel becomes 13 cards. Recommend retitle to **`Spesialis untuk tiap pekerjaan. Satu tim. Satu chat.`** (avoids a hard count). Also update the 3 other hardcoded counts: `pd-eyebrow` "10 persona spesialis" and "Tim 10 spesialis"/"10 agent spesialis" strings if present. **KEEP `id="proses"` on the section** (nav "Kerja" → `#proses`). The `agent-tier-line` (@2119, "3 · 8 · full set") stays accurate.

### 3.6 BIGGER 4-STEP CARDS (req 4) — `FeaturesGrid()` @3508, container @3573, grid @3587

**Recommended: 4-wide row at `max-w-7xl` (NOT 2×2).** Brand critique B4: 2×2 orphans the `how-line` connector (it spans 4 columns) — and this is a *steps* section where the connector communicates sequence. The 4-wide row keeps the connector and the "Empat langkah" narrative.
- Container @3573: `max-w-6xl` → `max-w-7xl` (edit this line ONLY).
- Grid @3587 keeps `lg:grid-cols-4`; `how-line` stays `hidden lg:block`.
- Mock box (~3607–3610): replace inline `height:168, padding:18` with a class → `min-height: 220px; padding: 28px`.
- Inner mock wrapper (~3611): `width:100%; max-height:180px; height:100%`.
- Caption (~3617): `max-w-[28ch]` → `max-w-[34ch]`, body `text-base md:text-[15px]`, `text-white/65`.
- Title (~3616): `text-xl md:text-2xl`. Badge (~3600): `w-14 h-14 text-2xl` → `w-16 h-16 text-3xl`.
- Scale up mock type so it doesn't look lost: `howmock-form` label 7.5→9px / value 9→11px / field padding 5px 9px→8px 12px; `howmock-setup` task 8.5→10.5px / bar 4→6px; `howmock-plan` SVG `strokeWidth` 1.4→1.8; `howmock-chat` bubble 9→11px.
- **Keep `data-i={s.n}`** on each card — the 16s `how-cycle` clock (badge highlight, card-glow, all 4 mock animations) depends on the 0/4/8/12s delays. Layout change doesn't affect timing.
- Mobile: grid already `grid-cols-1`; mock `min-height:200px; padding:20px`; caption `max-w-none md:max-w-[34ch]`.

If founder insists on 2×2: add a vertical/L connector or arrow glyphs between cards — don't just delete the line.

### 3.7 DOMAIN MIGRATION → weuseai.id (req 1)

**In scope = displayed/canonical/OG/SEO only** (static files). Replace `https://weuseai-agent.vercel.app` → `https://weuseai.id` (preserve each path):

| File | Lines | Change |
|---|---|---|
| `index.html` | 8 | canonical → `https://weuseai.id/` |
| `index.html` | 15 | og:url → `https://weuseai.id/` |
| `index.html` | 16 | og:image → `https://weuseai.id/assets/og-image.png` |
| `index.html` | 25 | twitter:image → `https://weuseai.id/assets/og-image.png` |
| `index.html` | 39 | **DELETE** the `<link rel="preload" as="video" href="assets/new-hero.mp4">` (video is gone) |
| `checkout.html` | 8 | → `https://weuseai.id/checkout` |
| `use-cases.html` | 8,15,16,25 | canonical/og:url/og:image/twitter:image → weuseai.id |
| `contact.html` | 8 | → `https://weuseai.id/contact` |
| `privacy.html` | 8 | → `https://weuseai.id/privacy` |
| `terms.html` | 8 | → `https://weuseai.id/terms` |
| `refund-policy.html` | 8 | → `https://weuseai.id/refund-policy` |
| `onboarding.html` | 9 | → `https://weuseai.id/onboarding` |
| `welcome.html` | 9 | → `https://weuseai.id/welcome` |
| `robots.txt` | 13 | Sitemap → `https://weuseai.id/sitemap.xml` |
| `sitemap.xml` | 4,9,14,19,24,29,34 | all `<loc>` apex → `https://weuseai.id` |

**Leave unchanged:** `index.html:12-13,19,23` (brand NAME `weuseai.agent`, no URL); `persona.html`/`chat.html` (no apex); the `weuseai.agent` brand-name strings throughout `app.jsx` (~30×: logo alt, footer ©, support@, cal.com, WhatsApp) — **do NOT blanket-replace `weuseai.agent`**; it's the product name, not the URL.

**DO NOT TOUCH (would break prod/tests):** all `supabase/functions/**` apex refs (PUBLIC_BASE, CORS, email links), `scripts/notify-smoke-failure.mjs`, health-check `SITE_BASE`, and every `tests/**` fixture that pins `weuseai-agent.vercel.app` (smoke/e2e/email/welcome contracts deliberately target the deploy alias). These will still grep-hit after your edits — that is correct, not a miss.

**og-image staleness (completeness D3):** the existing `og-image.png` shows the OLD China-recipe hero. The file swap is mechanical but the image content is now stale relative to the redesigned page. **Flag to founder** that the social-share preview should be regenerated (out of code scope).

### 3.8 CHINA-SECTION REMOVAL (req 5) — `HangzhouEdge()` @4181, render @5243

1. Delete `<HangzhouEdge />` (@5243) from `App()`.
2. Delete the function definition + its comment header (`app.jsx:4177–4225`). `grep "HangzhouEdge"` returns only the def + the render — nothing else references it. It uses only shared helpers (`FadeTop`, `BlurText`, `Mot.div`, `EASE`) that stay. Leave valid JSX (no dangling braces — the compile gate checks this).
3. China copy in the OLD hero (466 pill / 471 headline / 481 sub) dies with the §3.1 Hero rewrite — confirm no `China/Zhejiang/Hangzhou` text survives in the new hero.
4. **Third China ref (easy to miss):** `CtaFooter` @5192 reads `…Resep dari Hangzhou, tim penuh di Telegram kamu, hosting Rp 99rb/bulan.` Rewrite to drop the China phrase: `Tim penuh di Telegram kamu, hosting Rp 99rb/bulan.`
5. **Do NOT** delete the two honesty-gate strings; **do NOT** touch the `Noto Serif SC` font load (harmless, unused — optional later cleanup).

Verify: `grep -n "HangzhouEdge\|Zhejiang\|kampus elite\|Resep dari Hangzhou\|Resep Hangzhou" assets/app.jsx` → ZERO hits.

---

## 4. EXACT RESPONSIVE TARGETS

Usable heights after browser chrome: 14" ≈ **840px** (Chrome default), 13" ≈ **750px**. Width-fit breakpoints key off `min-width`; height-fit off `max-height`.

| Section | 14" (~1512×916, ~840 usable) | 13" (~1280×750) | Mobile (~380px) |
|---|---|---|---|
| **Hero** | top pad 108px; frame ~620px; H1 56–64px; composer above fold | frame **~440px** (NOT 500); H1 48px `line-height:.98`; sub 2 lines/13px/46ch; CTA `mt-4`; composer MUST be above fold (brand B2) | frame stacks under H1+CTA — verify composer reachable; sub clamps; 4-app proof row wraps to 2×2 |
| **IntegrationsSpine** | 4-up grid, horizontal hub, scrolls naturally (NOT pinned) | 4-up grid, horizontal hub | single-col tiles + **vertical hub variant** (NOT hidden — it's the IG asset); hide horizontal hub 768–900px |
| **Pricing** | 5 cards + header all visible, no scroll; featured dominant; chrome compressed @ max-h:940 | all 5 visible ONLY with §3d cuts (scale-cap + persona-hide mandatory); chrome @ max-h:800 | 1-col stack, full default chrome, scroll OK |
| **4-step** | 4-wide row `max-w-7xl`, big cards, connector visible | 4-wide row, connector visible | 1-col, mock `min-height:200px`, connector hidden |
| **Carousel** | continuous drift, neighbors peek, below-fold (looser) | same | swipe via Pointer Events; `touch-action:pan-y`; 1 card + peek |

Acceptance: at 1512×916 and 1280×750 — hero composer above fold; pricing all 5 cards + CTAs visible with no section-induced vertical scrollbar; 4-step cards fill space with connector intact. At 380px — vertical hub renders; carousel swipes; no horizontal overflow.

---

## 5. PHASED BUILD PLAN (numbered; each ends with rebuild + preview)

**Phase 0 — Baseline the gate.** `node scripts/build-landing.mjs` then run the two landing specs on the pristine tree. Confirm green BEFORE any edit, so later reds are unambiguously yours.

**Phase 1 — Domain + China removal (smallest, lowest-risk, pure deletion/string-swap).** Do §3.7 (domain refs + drop video preload) and §3.8 (delete HangzhouEdge def @4177–4225 + render @5243 + de-China CtaFooter @5192). This *shrinks* `app.jsx`, so re-ground all later line numbers once after this. → **Rebuild. `grep` for zero China hits + zero `weuseai-agent.vercel.app` in `*.html`/`robots.txt`/`sitemap.xml`. Preview: page renders, no console error, China section gone, no video network request.**

**Phase 2 — Hero swap (§3.1).** Extract `DashboardFrame`, rewrite `Hero()`, re-order `App()` (Hero → [Integrations slot empty for now] → StartSection), remove `<DashboardDemo />`. Author the canonical `App()` tree here. → **Rebuild. Preview at 1512×916 + 1280×750: dashboard animates at top, composer above fold, no China text, honesty-gate strings still present, nav Beranda→top / Kerja→#proses work.**

**Phase 3 — The 4-integration centerpiece (§3.2).** Add `IntegrationsSpine` + `INTEGRATIONS`, mount after Hero. Default all `status:'segera'`. Add the 4-app proof row to the hero. Add `.is-*` CSS + the reduced-motion override. → **Rebuild. Verify honesty gate (no banned substrings). Preview at 1512/1280/380 — vertical hub on mobile, no animated spokes into segera tiles.**

**Phase 4 — Pricing full-viewport + Rp99k meter (§3.3 + §3.4).** Grid/wrapper/hook classes + the height-keyed media queries (mandatory §3d cuts) + `HostingMeter` + CSS. → **Rebuild. Drift gate green (prices intact). Preview at 1512×916 + 1280×750: all 5 cards visible, no scroll, featured dominant, meter animating + legible, reduced-motion freezes.**

**Phase 5 — Carousel + 4-step cards (§3.5 + §3.6).** Fix the business-director black box, poster fallback, 13-card AGENTS, every-card button, rAF marquee + Pointer swipe + a11y; 4-wide bigger steps. → **Rebuild. Preview: seamless loop (no 720ms wait), buttons on all cards, swipe works, no black box; steps fill space with connector intact.**

**Phase 6 — Integration commit.** ONE final `node scripts/build-landing.mjs` + full `npm test`. Commit `app.jsx` + `index.html` + the regenerated `app.js` + `tw.css` + the static `*.html`/`robots.txt`/`sitemap.xml` together (freshness gate requires artifacts committed alongside source).

---

## 6. TEST + VERIFICATION PLAN

**Automated (run after every phase):**
```bash
node scripts/build-landing.mjs
npx tsx --test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts   # or: npm test
```
- Freshness (byte-for-byte) green → you rebuilt.
- Stack integrity green → no babel/cdn-tailwind/hls/text-babel introduced.
- Compile + bundle green → valid JSX, >50KB, has `createRoot`.
- Honesty gate green → no banned capability strings; `Pagi Briefing — dikirim otomatis` + `Aku tidak mengirim apa pun tanpa kamu setujui` still present.
- Drift gate green → all `setupIdr` literals intact.

**Brand-word / exclamation gate (manual grep + read):**
```bash
grep -nE "basically|literally|revolutionary|disrupt|10x|game-changer|next-level|\bjust\b|honestly" assets/app.jsx   # any NEW hit = fix
```
Scan all new copy for `!` in body (max 1 per caption), `kamu` not `Anda`, and the "would a respected Jakarta operator save this?" filter. Confirm `doang` is NOT used; Gmail tile is future-tense + `menyiapkan` not `mengerjakan`.

**Preview / Playwright check per section** (serve dir; Claude_Preview or Playwright MCP at 1512×916, 1280×750, 380×800):
- Hero: dashboard animates, composer above fold both laptop sizes, no video request, headline not ragged-3-line.
- Integrations: 4 tiles + hub render; segera spokes static dashed (not pulsing); mobile vertical hub present.
- Pricing: all 5 cards + CTAs visible, zero section-induced scrollbar, meter animates.
- Carousel: head meets tail with no perceptible pause; click-next + swipe + keyboard work; every card has a button; no black box.
- 4-step: cards fill width, connector visible at lg.
- Cross-cutting: console clean; nav (#beranda/#proses/#pricing), FAQ, footer, `checkout.html`, `wa.me`, `cal.com` links all resolve; new canonical/og present in served head; reduced-motion (emulate) freezes all animations.

---

## 7. OPEN DECISIONS FOR THE FOUNDER (genuine — get answers before/while building)

1. **⭐ Which of Content / Fitness / Finance are genuinely LIVE today, and what is each app?** Ground truth says NONE are live (`tier-personas.ts:100,126` — `web_app` is a flag only; no app code in repo). **Recommendation:** ship all four `Segera` by default (truthful). The conversion win requires the founder to confirm at least the 3 web apps are live so we can flip them to `Aktif` (3 pulsing + Gmail dashed) — that is the founder's actual #1 bet. If none are live, this section should be a roadmap strip, not the centerpiece. Tile one-liners are placeholder `[CONFIRM]` until the founder gives the real value prop.
2. **Gmail / Sekolah scope + wording.** **Recommendation:** keep `Segera`, future-tense, scope-vague, and `menyiapkan tugas` (prepares) not `mengerjakan` (does). Flag UU-PDP/consent: "reads your email + school portal" is a personal-data promise with no consent infra yet (product is Telegram-only). Use the tease as the viral hook, but don't imply it works today.
3. **Carousel headline + new persona-detail copy.** **Recommendation:** retitle "Sepuluh spesialis" → "Spesialis untuk tiap pekerjaan" (13 cards now). Author short `PERSONA_DETAILS` entries for `email-manager`/`calendar-agent` so their buttons resolve; interim fallback = `#pricing`. Also confirm/strip the `Bitget read-only sync` (pre-existing) and `listing marketplace lokal` (new) capability claims — same honesty bar as the integrations.
4. **Dashboard mockup: keep as static CSS/JS mock, or wire the real `chat.html` dashboard?** **Recommendation:** keep the existing CSS/JS mock as the hero (it's the LCP; a live wired dashboard adds load + auth complexity and worsens LCP on 4G). Per memory, the real customer dashboard uses the Hermes API Server (8642), not the admin GUI — wiring it is a separate project, not a landing change.
5. **Exact hero CTA target.** Primary currently → `checkout.html`. **Recommendation:** keep `checkout.html` (matches existing flow); secondary → `cal.com/weuseai.agent/15min`. Confirm if the founder wants the primary to go to a specific tier anchor (`#pricing`) instead.
6. **4-step layout:** 4-wide row (recommended — keeps the steps connector) vs 2×2 big cards. **Recommendation:** 4-wide row at `max-w-7xl`.
7. **og-image regeneration:** the share preview still shows the old China hero. **Recommendation:** regenerate it to show the new dashboard hero (out of code scope; flag only).

---

## 8. CONSTRAINTS + NON-GOALS

- **Brand voice locked:** Bahasa Indonesia primary, `kamu` (never Anda/lo-gue), calm-premium, zero `!` in body (max 1/caption), no banned words, dark `#0a0a0a` / ink `#f5f5f5` / accent `#E5322D`, Inter + Instrument Serif (serif for hero/section headlines).
- **No price changes** — tier values (4467–4587) and all `setupIdr` literals are frozen; pricing work is layout/animation only (drift gate enforces).
- **Don't break shipped sections** — preserve every section not named "change/delete" in §1, plus nav/FAQ/footer/checkout/og. `index.html` is regression-sensitive.
- **No DNS/deploy claims** — you change only the *displayed/canonical/OG* domain. The Vercel deploy alias (`weuseai-agent.vercel.app`) and all backend infra/test fixtures targeting it are OUT OF SCOPE and must stay untouched.
- **Honesty on integration status** — never label Content/Fitness/Finance/Gmail `Aktif` without founder confirmation; default `Segera`; segera spokes never pulse; no fabricated-capability strings (honesty gate enforces). Re-home the "Ilustrasi pengalaman" hedge near the dashboard mockup.
- **Reduced-motion** — every new animation (hero entrances, integrations hub, hosting meter, carousel drift) must respect `prefers-reduced-motion` (the global strategy is selective, not a blanket kill — ship per-component overrides).
- **Always rebuild** — `node scripts/build-landing.mjs` after every edit; the byte-exact freshness gate makes a stale artifact a guaranteed CI red.

**Verified key paths:** edit `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/assets/app.jsx` (Hero 438; AgentVisual 1827; AgentCarousel 1897; AGENTS 1885; detailSlugMap 2054; StartSection 2698; DashboardDemo 2729; FeaturesGrid 3508/3573/3587; PricingCard 3830/3902; HangzhouEdge 4181; Pricing 4460/4599/4625; App 5230/5234–5249; CtaFooter 5192). CSS in `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/index.html` `<style>` (head meta 8/15/16/25/39; db-frame heights 295/307/309; priceLiveDot @2491). Build `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/scripts/build-landing.mjs`. Gates `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/tests/landing-build.spec.ts` + `tests/landing-pricing-drift.spec.ts`. Domain static files + `robots.txt` + `sitemap.xml` per §3.7. The 4 missing mp4s (`slide-master`, `web-app-builder`, `social-conductor`, `video-producer`) are handled by the poster fallback; `business-agent.mp4` is absent (`business-director.mp4` exists — fix the AGENTS `file`).