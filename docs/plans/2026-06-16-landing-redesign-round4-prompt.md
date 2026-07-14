# weuseai.id Landing — Round 4 Build Prompt (Phases 4–5 + Founder Hero/Pricing Revisions)

> Generated 2026-06-16 via ultracode multi-agent workflow (3 architects + synthesis), grounded against branch `landing/phase-1-domain-china` HEAD. This is the build reference for the next round.

You are a senior front-end engineer working on the **weuseai.id** landing redesign. Phases 1–3 are already on branch `landing/phase-1-domain-china` (PR #271). This prompt is the complete, self-contained spec for the next round. Read real code before asserting; every line number below was verified against the current branch HEAD on 2026-06-16 (corrections to the original spec drafts are flagged inline).

---

## 1. State + goal

### Already done (phases 1–3, current branch)
- **Domain** → `weuseai.id` (index.html canonical/og). China standalone section (`HangzhouEdge`) deleted.
- **Hero swap:** `DashboardDemo()` chat mockup is now the top hero — `<section id="beranda" className="db-section db-section--hero">` at `assets/app.jsx:2729` (component `function DashboardDemo()` at 2614). CTAs + trust line added.
- **Old video hero DELETED** in phase 2. Recoverable from git: `git -C "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah" show ea61acc:assets/app.jsx` (lines ~438–551 of that revision = full `Hero()` with `DottedVideo src="assets/new-hero.mp4"`, the "Resep kampus elite China…" headline, and the 4-stat liquid-glass block).
- **IntegrationsSpine** centerpiece (`function IntegrationsSpine()` at `assets/app.jsx:5084`, `id="integrasi"`) mounted right after the hero in `App()` (`<IntegrationsSpine />` at line 5142).

### This round adds
1. **Hero video bg** — `new-hero.mp4` (the dotted-red `DottedVideo` render) layered behind the dashboard hero, dimmed for legibility.
2. **Restore the old hero as a demoted `OriginSection`** below the dashboard hero (founder-origin/credibility story, not the top hero). Re-introduces the China/Zhejiang copy — **flagged for founder confirmation** (§6).
3. **Pricing** — widen cards (less horizontal padding, wider container, 4-col grid, bigger gap), **drop the Bare Agent card from display** (catalog-safe — keep the object), full-viewport fit on 14"/13", and the **Rp 99rb "utility-meter" wow** animation.
4. **Phase 5** — persona carousel showing all personas with a true continuous infinite loop (head-meets-tail, no perceptible pause, button on every card) + bigger 4-step "Empat langkah" cards.

### Repo facts (verified)
- **Real repo root:** `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah` (the parent `weuseai.agent/` is NOT a git repo). Branch: `landing/phase-1-domain-china`.
- **Source → build:** edit `assets/app.jsx` and/or the single `<style>` block in `index.html`, then run `node scripts/build-landing.mjs` → regenerates `assets/app.js` (esbuild-minified) + `assets/tw.css` (Tailwind, content-scanned from `index.html` + `app.jsx` + `persona-details.js`).
- **Persona data:** `assets/persona-details.js` → `window.PERSONA_DETAILS` (loaded via `<script src>` before the React tree). Confirmed 10 slugs: `the-pro, deep-researcher, slide-master, doc-expert, business-agent, project-conductor, web-app-builder, social-conductor, trade-pro, video-producer`. **`email-manager` and `calendar-agent` have NO entry.**
- **mp4 on disk (verified):** `app-builder, ascii-wave, business-director, calendar-agent, chat-vs-agent-automations, deep-researcher, doc-expert, email-manager, empat-langkah-bg, new-hero, pricing-furnace, project-conductor, the-pro, trade-pro, welcome-success`. There is **no `business-agent.mp4`** (only `business-director.mp4`) → confirmed live black-box defect.

---

## 2. Build mechanics + guardrails

**The build loop (run after EVERY `.jsx` / `index.html` edit):**
```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah"
node scripts/build-landing.mjs                                   # regen app.js + tw.css
npx esbuild assets/app.jsx --loader:.jsx=jsx --jsx=transform --outfile=/dev/null   # JSX syntax gate
node --test tests/landing-build.spec.ts                          # freshness + head-purity + honesty
node --test tests/landing-pricing-drift.spec.ts                  # pricing catalog drift
```

**Gates and exactly what they enforce (verified):**
- **`tests/landing-build.spec.ts`**
  - *Freshness:* re-runs the build in-memory and asserts `assets/app.js` + `assets/tw.css` reproduce **byte-for-byte**. A partial commit fails. Always commit `app.jsx` + `app.js` + `tw.css` + `index.html` together.
  - *Head purity:* `index.html` must reference `/assets/tw.css`, and must NOT contain `babel`, `cdn.tailwindcss.com`, or `type="text/babel"`.
  - *Honesty:* `app.jsx` must NOT contain banned demo strings: `'Sorted'`, `'emails'`, `'GST'`, `'PR #142'`, `'Auto-publish'`, `'Calendar update'`, `'confirmed dalam'`, `'Live di 6 platform'`, `'overnight'`, `'trending apa'`, `'Auto-monitor'`, `'otomatis ke OLX'`, `'kalender di-sync'`, `'Otomatis dibaca'`, `'10×'`. It must still contain `'Pagi Briefing — dikirim otomatis'` and `'Aku tidak mengirim apa pun tanpa kamu setujui'`. None of the new copy collides (Email Manager `desc` says `email per hari`, not `emails`; meter uses no banned token).
- **`tests/landing-pricing-drift.spec.ts`** — reads `TIERS` from `supabase/functions/_shared/tier-personas.ts` and the **raw text** of `app.jsx`. Every check is a substring grep; it never renders React. `SELLABLE_TIERS` includes `'bare'`; asserts `slug: 'bare'` appears, `setupIdr: 99_000`, `priceLabel: 'Rp 99rb'`, `month1Total: 'Rp 198rb'`; asserts `setupIdr: 249_000` and `Rp 348rb` do NOT appear.
  - **Therefore: the bare object MUST stay in the `tiers` array verbatim. Hiding the *card* (filter at `.map()`) is safe; deleting the object breaks the gate.** Do not touch `tier-personas.ts` or any price literal.

**Brand guardrails (non-negotiable):** Bahasa Indonesia, `kamu`, calm-premium, **zero exclamation marks in body**, no banned words (`basically / just / literally / revolutionary / disrupt / 10x / game-changer / next-level`). Palette: dark `#0a0a0a`, section bg `#050505`, ink `#f5f5f5`, accent signal-red `#E5322D`. Inter + Instrument Serif. No price strings change anywhere.

**index.html risk note:** all component CSS lives in ONE `<style>` block (opens ~line 51). It is shipped HTML — add new rules; do not refactor existing ones. Re-verify in a browser preview at desktop + the two laptop sizes after each section.

---

## 3. Component-by-component build spec

### 3a. Hero video background + restore old hero as `OriginSection`

#### (i) Video bg behind the dashboard hero — `DashboardDemo()`

`DottedVideo` (`assets/app.jsx:72`) is an absolute-fill component already used as a section bg in 5 places; signature `DottedVideo({ src, color = '#E5322D', cellSize = 6, threshold = 0.06, className = '', style = {} })`. IntersectionObserver pauses its rAF offscreen.

**Layering gotcha (verified):** `.db-section .db-eyebrow` (index.html:303) sets `display:flex` but **no `position`/`z-index`** → static, falls behind an absolute video. `.db-frame` (index.html:339) is already `position:relative`, needs only a `z-index`. Both lifted in CSS, not JSX.

**JSX** — insert the 3 bg layers as the FIRST children of the hero section (`assets/app.jsx:2729`), before `.db-eyebrow`:
```jsx
<section id="beranda" className="db-section db-section--hero">
  {/* Ambient dotted-red hero video — dimmed behind the dashboard mockup. */}
  <DottedVideo src="/assets/new-hero.mp4" color="#E5322D" cellSize={7} className="db-hero-video" aria-hidden="true" />
  <div className="db-hero-dim" aria-hidden="true" />
  <div className="db-hero-fade" aria-hidden="true" />
```
No inline zIndex — layering lives in CSS. `.db-eyebrow` + `.db-frame` JSX stay as-is.

**CSS** — add after the `.db-section--hero` media rule (~index.html:257):
```css
.db-section--hero .db-hero-video { position:absolute; inset:0; width:100%; height:100%; z-index:0; pointer-events:none; background:#050505; opacity:0.55; }
.db-section--hero .db-hero-dim { position:absolute; inset:0; z-index:1; pointer-events:none;
  background: radial-gradient(ellipse 80% 60% at 50% 32%, rgba(5,5,5,0.55), rgba(5,5,5,0.86) 72%),
              linear-gradient(180deg, rgba(5,5,5,0.80) 0%, rgba(5,5,5,0.66) 42%, rgba(5,5,5,0.88) 100%); }
.db-section--hero .db-hero-fade { position:absolute; left:0; right:0; bottom:0; height:220px; z-index:1; pointer-events:none;
  background: linear-gradient(to bottom, rgba(5,5,5,0), #050505); }
.db-section--hero .db-eyebrow { position:relative; z-index:3; }
.db-section--hero .db-frame   { position:relative; z-index:3; }
@media (prefers-reduced-motion: reduce) { .db-section--hero .db-hero-video { opacity:0.18; } }
```
`.db-frame` already has opaque `rgba(8,8,10,0.92)` bg → mockup stays legible; video shows in margins + behind headline. Tune: more dots → raise opacity toward 0.7 + lighten dim mid-stop; too busy → drop to 0.4.

#### (ii) Restore the old hero as `OriginSection`

Add a new component **after** `IntegrationsSpine()` closes (after `assets/app.jsx:5132`, before `function App()` at 5135) — the recovered `Hero()` body, demoted: `id` → `asal-usul`; entrance `animate=` → `whileInView=` + `viewport={{ once:true, amount:0.4 }}` with compressed delays; headline cap `xl:text-[6.5rem]` → `lg:text-[3.75rem]`; the `min-h-[760px] md:min-h-[920px]` block → content-driven `.origin-section`; overlays re-anchored to `#050505` + top fade; `src` absolute. `Mot/BlurText/CountUp/ArrowUpRight/EASE/liquid-glass` already defined — no new imports. (Full JSX in the workflow output; recover the verbatim body from `git show ea61acc:assets/app.jsx`.)

> **China-copy decision** — the headline / "Resep Hangzhou" / "Zhejiang University, Hangzhou" copy is the founder's verbatim ask but reverses the Phase-1 "remove China" for this copy. Soften option: headline → `"Resep tim kelas dunia. Tenaga satu tim penuh. Aktif dalam 8 menit."`, keep Zhejiang/Hangzhou only in the sub-line. See §6-1.

**Mount in `App()`** — between `<IntegrationsSpine />` (5142) and `<StartSection />` (5143):
```jsx
<IntegrationsSpine />
<OriginSection />        {/* ← rev 1: demoted origin story */}
<StartSection />
```
Order: dashboard hero (*what*) → IntegrationsSpine (*value*) → OriginSection (*why-trust-us*) → StartSection (*meet the team*).

**CSS** — after the `.is-section` media rule (~index.html:261):
```css
.origin-section { position:relative; overflow:hidden; background:#050505; padding:96px 16px 104px; }
@media (min-width:768px){ .origin-section { padding:120px 24px 128px; } }
```
`.hero-grain` reused unchanged. Same `new-hero.mp4` in two places is fine (two independent visibility-gated `<video>`s; never run rAF simultaneously).

---

### 3b. Pricing — widen, drop Bare card, full-viewport, Rp99k wow

#### (i) Drop Bare Agent from DISPLAY (catalog-safe)
`tiers` array at `assets/app.jsx:4315`; bare object ~4316–4338 (`slug:'bare'` @4318, `decoy:true` @4319, `setupIdr:99_000` @4322). **Leave the array untouched.** Add before the component `return` (~after 4435):
```jsx
// Bare Agent (decoy) hidden from the live grid (founder rev 2026-06-16).
// MUST remain in `tiers` — pricing-drift gate greps slug:'bare'/setupIdr:99_000/'Rp 99rb'/'Rp 198rb'.
const visibleTiers = tiers.filter((t) => !t.decoy);
```

#### (ii) Widen cards + 4-col grid — replace grid at `assets/app.jsx:4473`:
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-7 lg:gap-8 items-stretch">
  {visibleTiers.map((t, i) => (
    <PricingCard key={t.name} tier={t} index={i} onShowBreakdown={() => setBreakdownTier(t)} />
  ))}
</div>
```
- Section H-padding @4438: `lg:px-16` → `lg:px-10` (full class `px-5 md:px-6 lg:px-16`).
- Container max-width @4447: `max-w-6xl` → `max-w-7xl`. **Edit THIS line only** (`max-w-6xl` also at 2928/3471/3970/4809 — no replace_all).

Card math: 14" (1512) → `(1280−96)/4 = 296px/card` (+38% vs 5-card 214px); 13" (1280) → `(1200−96)/4 = 276px/card`.

#### (iii) Full-viewport fit (14" 1512×916, 13" 1280×750) — compress chrome, not card internals. Add class hooks: `pc-card`, `pc-price-month1`, `pc-outcomes`, `pc-section-head`, `pc-card-featured`. Add height-keyed media query:
```css
@media (max-height: 820px) and (min-width: 1024px) {
  #pricing .pc-price-month1 { font-size:1.5rem; }
  #pricing .pc-card { padding:1.25rem 1.25rem; }
  #pricing .pc-outcomes li { line-height:1.4; }
  #pricing .pc-section-head h2 { font-size:2.5rem; }
}
```
Also reduce section vertical chrome: `md:py-32` → `md:py-20 lg:py-24`; header `mb-14 md:mb-20` → `md:mb-12`; h2 cap → `lg:text-5xl`. Compression order: section py → header margin → h2 → card padding → Bulan-1 numeral. Outcomes copy never truncates.

#### (iv) Rp 99rb "utility-meter" wow — on the "Bulan 2 dst" recurring row (`assets/app.jsx:3812–3818`, renders `tier.recurringLabel` = `'Rp 99rb/bulan'`):
```jsx
<div className="flex items-baseline justify-between gap-3">
  <span className="text-xs font-body font-light text-white/55">Bulan 2 dst</span>
  <span className="utility-meter" aria-label={`${tier.recurringLabel || 'Rp 99rb/bulan'}, dibayar seperti listrik`}>
    <span className="utility-meter__track" aria-hidden="true"><span className="utility-meter__fill" /></span>
    <span className="utility-meter__label text-sm font-body text-white/90">{tier.recurringLabel || 'Rp 99rb/bulan'}</span>
  </span>
</div>
```
CSS (near `priceGlowPulse`):
```css
.utility-meter { display:inline-flex; flex-direction:column; align-items:flex-end; gap:4px; }
.utility-meter__label { letter-spacing:-0.01em; }
.utility-meter__track { position:relative; display:block; width:88px; height:5px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,0.08); box-shadow:inset 0 0 0 1px rgba(229,50,45,0.18); }
.utility-meter__fill { position:absolute; inset:0; background:linear-gradient(90deg, rgba(229,50,45,0) 0%, rgba(229,50,45,0.55) 40%, #E5322D 70%, rgba(255,170,160,0.95) 85%, #E5322D 100%); transform-origin:left center; animation:utilMeterDraw 2.6s cubic-bezier(0.4,0,0.2,1) infinite; }
.utility-meter__fill::after { content:''; position:absolute; top:0; bottom:0; width:26%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent); animation:utilMeterShimmer 2.6s linear infinite; }
@keyframes utilMeterDraw { 0%{transform:scaleX(0.18);opacity:0.65;} 55%{transform:scaleX(1);opacity:1;} 100%{transform:scaleX(0.18);opacity:0.65;} }
@keyframes utilMeterShimmer { 0%{left:-30%;} 100%{left:110%;} }
#pricing .pc-card-featured .utility-meter__track { box-shadow:inset 0 0 0 1px rgba(229,50,45,0.4); }
@media (prefers-reduced-motion: reduce) { .utility-meter__fill { animation:none; transform:scaleX(0.85); opacity:1; } .utility-meter__fill::after { display:none; } }
```
Price text never moves; only `#E5322D` + white shimmer; reduced-motion → static 85% meter.

---

### 3c. Phase 5 — carousel + bigger 4-step cards

> Verified anchors: `AgentVisual` @1712, `AGENTS` @1770–1779 (**9 cards today**), `AgentCarousel` @1782, `StartSection` @2583 (`id="proses"` @2585, headline @2600), `FeaturesGrid` @3406 (container @3471, grid @3485, how-line @3487, badge @3499, mock inline style @3507).

**Defects:** `AGENTS[8].file='business-agent'` but only `business-director.mp4` exists → black box. `email-manager`+`calendar-agent` have no `PERSONA_DETAILS` entry (mp4s exist → stay video cards, only detail link missing). 4 personas have no mp4 (`slide-master, web-app-builder, social-conductor, video-producer`) → poster cards.

#### (i) Target `AGENTS` (13 cards) — replace 1770–1779. Video cards first (9), poster last (4); each carries `slug, file, name, glyph, detail, desc`. (Full array in workflow output — honesty-cleaned desc copy; dropped unconfirmed `'Bitget read-only sync'` + `'listing marketplace lokal'`.) Detail-href:
```js
const detailSlug = a.detail && PERSONA_DETAILS?.some((p) => p.slug === a.detail) ? a.detail : null;
const detailHref  = detailSlug ? `/persona?slug=${encodeURIComponent(detailSlug)}` : '#pricing';
const detailLabel = detailSlug ? 'Lihat detail' : 'Lihat paket';
```
→ every card has a working button.

#### (ii) Continuous rAF marquee (kills the dead-air loop). Replace the paged/sentinel engine (`displayIndex`, `snapTo`, `wrapping`, sentinel track, `setTimeout(720)`, 13s `setInterval`) with rAF translate over a doubled track `[...AGENTS, ...AGENTS]` (clones `aria-hidden`, not tabbable). Drift `SPEED=38px/s`, no CSS transition; modulo reset at `halfRef` is invisible. Click/dots/keyboard = transitioned "snap" overlay (sets inline `transition` then clears, never locks input). Pause on hover/focus via refs. Pointer-events swipe/drag; `touch-action:pan-y`. Reduced-motion → static strip, instant jumps. (Full engine in workflow output.)

#### (iii) `AgentVisual` poster fallback (`assets/app.jsx:1712`) — guard `if (!file) return` in the IO effect; render `.agent-poster` (`AgentGlyph` + "Segera hadir") when `!file`. Pass `glyph`/`name` from the card map. Fixes the Business Director black box (file → `business-director`).

#### (iv) Carousel CSS: `.agent-track` remove always-on `transition`; `.agent-fade`/`.agent-fade-wrap` add `touch-action:pan-y`; `.agent-card` hover lift; `.agent-desc` 2-line clamp; new `.agent-poster`/`.agent-poster svg`/`.agent-poster-tag`; dots now 13.

#### (v) Headline reconciliation: `StartSection` headline @2600 `"Sepuluh spesialis. Satu tim. Satu chat."` → `"Spesialis untuk tiap pekerjaan. Satu tim. Satu chat."` (number-free). Leave the other "10 persona" mentions (they refer to the canonical library). Keep `id="proses"`.

#### (vi) Bigger 4-step `FeaturesGrid()` @3406 — keep 4-wide row (connector). `app.jsx`: @3471 `max-w-6xl`→`max-w-7xl` (this line only); @3485 grid `gap-10 md:gap-10`→`gap-8 lg:gap-12`; @3499 badge `w-14 h-14 text-2xl`→`w-16 h-16 text-3xl`; @3505–3507 mock box inline → class `how-mockbox`; @3509 inner `maxHeight:140`→`200`, width `88%`→`92%`; @3514 title `text-lg md:text-xl`→`text-xl md:text-2xl`; @3515 caption bigger + `max-w-[34ch]`; keep `data-i` + `liquid-glass card-glow` (16s `how-cycle` clock). `index.html`: new `.how-mockbox{min-height:240px;padding:28px;...}` (+mobile 200/20); `.how-line top:28px→32px`; scale `.howmock-*` internals up proportionally.

---

## 4. Phased build order
Each phase ends with **rebuild → preview check → gate run**; commit `app.jsx`+`app.js`+`tw.css`+`index.html` together.

- **Phase 4a** — hero video bg + restore OriginSection below. Hold for founder sign-off on China copy (§6-1) before merging.
- **Phase 4b** — pricing width + drop Bare + utility-meter (pricing-drift must stay green).
- **Phase 5** — carousel (13 cards, rAF marquee, posters, buttons) + headline + bigger 4-step cards.

## 5. Test + verification
Gates per §2 at each phase. Responsive at 1512×916 (14") + 1280×750 (13"). Honesty re-grep. Pricing-drift after 4b. Preview each section.

## 6. Open decisions for the founder
1. **China copy framing (BLOCKS 4a merge):** keep verbatim vs soften headline (recommend: keep origin story, soften headline, keep Zhejiang/Hangzhou in sub-line as provenance).
2. **OriginSection placement:** recommend hero → IntegrationsSpine → OriginSection → StartSection; no new nav entry.
3. **Honesty parity:** dropped `'Bitget read-only sync'` + `'listing marketplace lokal'` from carousel; confirm if Bitget read-only is wired / marketplace claim real (else strip from `persona-details.js:221`).
4. **email-manager/calendar-agent detail pages:** interim `#pricing`; author 2 `PERSONA_DETAILS` entries with founder copy.
5. **App Builder vs Web Creator:** both resolve to `web-app-builder` page; acceptable for launch.
6. **Poster glyphs vs shipping 4 missing videos:** if founder produces the 4 mp4s, ship those; else glyph posters + "Segera hadir".

## 7. Constraints + non-goals
Brand voice; no price changes; catalog-safe Bare removal; don't break shipped sections (`id="beranda"`/`id="proses"`/`id="pricing"` intact); honesty banlist; non-goals: no new tiers, no nav restructure, no domain/SEO changes, no Phase 6+.

**Files touched:** `assets/app.jsx`, `index.html` (`<style>` block), optionally `assets/persona-details.js`. Regenerated: `assets/app.js` + `assets/tw.css`. Old-hero source: `git show ea61acc:assets/app.jsx` (~438–551).
