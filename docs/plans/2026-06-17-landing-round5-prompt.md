# ROUND 5 BUILD PROMPT — weuseai.id landing + checkout payment fix (PR #271 branch)

> Execute against the **current** code on branch `landing/phase-1-domain-china` (PR #271). Repo root: `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah`. The parent `weuseai.agent/` is NOT a git repo. Read REAL code before asserting; cite `file:line`.

---

## 1. State + goal

### What's already shipped (phases 1–5c, on PR #271)
- **HERO** (`assets/app.jsx:2814`, `section id="beranda" class "db-section db-section--hero"`) = the `DashboardDemo` "Satu super-agent" mockup, with an ambient `DottedVideo src="/assets/new-hero.mp4"` background (`app.jsx:2817`) behind a heavy `.db-hero-dim` scrim.
- **ORIGIN** (`assets/app.jsx:5238`, `function OriginSection`, `section id="asal-usul" class "origin-section"`) = the restored ex-hero "Resep kampus elite China" story. It **currently shares the same `new-hero.mp4`** (`app.jsx:5242`) as the hero.
- **INTEGRATIONS** (`assets/app.jsx:5184`, `function IntegrationsSpine`, `section id="integrasi"`) = "Dia kerja di app beneran." 4-tile grid: R2 Content / R2 Fit / R2 Finance = `Aktif`; Gmail / Sekolah = `Segera`. Each tile today is a 4-bar CSS viz + name + chip + one-line + micro stat (`app.jsx:5207-5226`).
- `DottedVideo` (`app.jsx:72`) signature: `DottedVideo({src, color='#E5322D', cellSize=6, threshold=0.06, className, style})`.

### What round 5 adds (4 requests)
- **(A)** Make the hero's red halftone **noticeable** (founder: "I see it but not noticeable, too dim").
- **(B)** Give the **origin** section a **distinct** background so it stops being a twin of the hero.
- **(C)** Rebuild each IntegrationsSpine tile into a **two-row layout**: ROW 1 = an agent chat bubble; ROW 2 = an **iPhone portrait device frame** holding a placeholder app screen (structured so a real `<img>`/`<video>` swaps in cleanly later).
- **(D)** Fix the **checkout payment CORS failure** — the founder cannot pay on the Vercel preview.

### PRIORITY: (D) Payment is the priority — it is revenue-blocking.
Do **(D) first.** Scope of the breakage (evidence below):
- **Vercel git-branch previews** (e.g. `weuseai-agent-git-landing-…-richies-projects-6f212435.vercel.app`) → **broken**: the founder's own checkout test fails here.
- **`velorah-nu.vercel.app`** (the other auto-tracking apex) → **broken**: its origin is not in the deployed allowlist.
- **`weuseai-agent.vercel.app` (canonical prod)** → **probably fine**: the fail-closed fallback returns exactly this origin, so even a stale deploy keeps prod-origin checkout working.
- Xendit is in **TEST mode**, so no live revenue is lost *yet* — but this blocks the founder's own end-to-end validation and the `velorah-nu` apex. Root cause is a **stale/manual edge-function deploy**, not a regex typo. The repo `cors.ts` is already (mostly) correct; the real unblock is a **redeploy** (founder action), plus a hardening change so this can't recur.

---

## 2. Build mechanics + guardrails

### Landing rebuild loop (mandatory after ANY `app.jsx` / `index.html` edit)
```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah" \
  && node scripts/build-landing.mjs \
  && npx playwright test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts
```
- **Source of truth** = `assets/app.jsx` (React via global UMD, JSX, Tailwind classes) + the ONE `<style>` block in `index.html`. The build compiles to `assets/app.js` + `assets/tw.css`.
- **Freshness gate** (`tests/landing-build.spec.ts`) is **byte-for-byte**: it re-runs a fresh build and diffs `assets/app.js` / `assets/tw.css`. **You MUST re-run `build-landing.mjs` after every edit or this gate fails.** It also asserts `index.html` does NOT contain `babel` / `cdn.tailwindcss.com` / `type="text/babel"`.
- **Honesty banlist** (same spec, `landing-build.spec.ts:64-78`) bans these 14 demo substrings: `Sorted`, `emails`, `GST`, `PR #142`, `Auto-publish`, `Calendar update`, `confirmed dalam`, `Live di 6 platform`, `overnight`, `trending apa`, `Auto-monitor`, `otomatis ke OLX`, `kalender di-sync`, `Otomatis dibaca`, `10×`. **Use `email` (singular), never `emails`.**
- **Pricing-drift gate** (`tests/landing-pricing-drift.spec.ts`): do not touch the `.is-foot` "Rp 99rb/bulan" line or any price string.

### Brand guardrails (apply to all copy)
- Bahasa Indonesia, `kamu`, calm-premium. **ZERO exclamation marks** in body. No banned words: `basically/just/literally/honestly/revolutionary/disrupt/10x/game-changer/next-level`.
- Palette: dark `#0a0a0a` / section `#050505` / ink `#f5f5f5` / accent signal-red `#E5322D`. Fonts: Inter + Instrument Serif (+ JetBrains Mono for mono labels).

### Edge-function deploy note (for request D)
- Supabase Edge Functions are a **single global deployment per project ref** (`gtjgsligllbjcisiyrah`). They are **NOT redeployed per Vercel preview**, and Vercel preview pushes never trigger `supabase functions deploy`.
- The PR #271 branch does **not** touch `supabase/functions/` — so editing `cors.ts` is inert until the founder (or CI with secrets) deploys. **The redeploy is the actual unblock.** The sandbox has no Supabase secrets (`scripts/deploy-all.sh:1-18`).

### `index.html` shipped-risk
`index.html` is the live page — it ships the `<style>` block directly. A malformed CSS edit ships immediately. Keep the `<style>` block valid; the freshness gate validates the compiled JS/CSS but does **not** lint the inline `<style>`.

### Re-verify in a browser preview
After each phase, open the built page and visually confirm. For (D), verify the actual CORS preflight clears on the preview deploy (see §5).

---

## 3. Component-by-component spec

> All four are independent edits. (A) and (B) live in the same hero/origin region; (C) is the integrations tile; (D) is backend-only (no landing rebuild). Verified current line numbers are cited; if they've drifted, match on the quoted strings.

---

### (A) Hero background noticeability — `index.html`

Two CSS deltas inside the existing `.db-section--hero` block, plus the reduced-motion bump. The `.db-frame` dashboard mockup is opaque (`rgba(8,8,10,0.92)`) at `z-index:3`, so raising bg brightness **cannot** hurt mockup legibility — only the eyebrow pill and headline need protection, which the radial-darkest-at-center handles.

**A1 — raise video opacity** (`index.html:305`, inside `.db-section--hero .db-hero-video`). Replace:
```css
      opacity: 0.55;
```
with the **recommended "noticeable"** value:
```css
      opacity: 0.72;
```
Tuning ladder (pick one; `0.72` recommended): `0.55` = current ("not noticeable"); **`0.72` = dots read clearly in the margins, headline stays calm**; `0.85` = bold, dots dominate — only if `0.72` still reads dim on the founder's screen.

**A2 — lighten the dim scrim** (`index.html:307-311`, the `background:` of `.db-hero-dim`). Replace:
```css
      background:
        radial-gradient(ellipse 80% 60% at 50% 32%, rgba(5,5,5,0.55), rgba(5,5,5,0.86) 72%),
        linear-gradient(180deg, rgba(5,5,5,0.80) 0%, rgba(5,5,5,0.66) 42%, rgba(5,5,5,0.88) 100%);
```
with (**recommended**):
```css
      background:
        radial-gradient(ellipse 86% 64% at 50% 30%, rgba(5,5,5,0.30), rgba(5,5,5,0.66) 74%),
        linear-gradient(180deg, rgba(5,5,5,0.52) 0%, rgba(5,5,5,0.30) 44%, rgba(5,5,5,0.80) 100%);
```
Why: radial center `0.55→0.30` / outer `0.86→0.66` lets dots show through mid/edges while keeping a soft dark pool under eyebrow+headline (`at 50% 30%`) for text contrast. Linear top `0.80→0.52` / mid `0.66→0.30` is the biggest win — the old upper-band wash was killing the red. Bottom kept heavy (`0.88→0.80`) so the `.db-hero-fade` seam into the next section stays clean.

> If A1 is taken to bold (`0.85`), pair with stronger text safety: radial center `0.38`, outer `0.70`; linear `0.58 / 0.36 / 0.82`.

**A3 — reduced-motion frozen frame** (`index.html:321`). Replace:
```css
      .db-section--hero .db-hero-video { opacity: 0.18; }
```
with:
```css
      .db-section--hero .db-hero-video { opacity: 0.32; }
```
(Static frame, no animation — safe under `prefers-reduced-motion`; `0.18→0.32` just means reduced-motion users also see the treatment.)

**No JSX change for the hero.** `cellSize={7}` stays (coarser dots than origin — a deliberate differentiator for (B)).

---

### (B) Distinct background for the Origin section — `assets/app.jsx`

Keep the **same halftone technique** (founder wants the hero to keep dotted-red) but change **source motion + dot density + hue + light map** so the two sections read as different rooms.

**Source:** `trade-pro.mp4` (`assets/trade-pro.mp4`, on disk, unused as any section bg — verified the only mp4s already used as section bgs are `ascii-wave`, `new-hero`, `empat-langkah-bg`, `chat-vs-agent-automations`, `pricing-furnace`). Second choice if it reads too busy once dotted: `deep-researcher.mp4` (also unused). Avoid `ascii-wave.mp4` (already bg of StartSection + CtaFooter).

**B1 — swap the DottedVideo** (`assets/app.jsx:5241-5247`). Replace:
```jsx
          <DottedVideo
            src="/assets/new-hero.mp4"
            color="#E5322D"
            cellSize={6}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0, background: '#000' }}
          />
```
with:
```jsx
          <DottedVideo
            src="/assets/trade-pro.mp4"
            color="#B81F1B"
            cellSize={5}
            threshold={0.05}
            className="absolute inset-0 w-full h-full pointer-events-none origin-dots"
            style={{ zIndex: 0, background: '#000', opacity: 0.6 }}
          />
```
Levers: **different source** (`trade-pro` vs `new-hero`); **finer/denser dots** (`cellSize={5}` vs hero's `7`); **within-brand hue shift** to deeper oxblood `#B81F1B` (still signal-red family — hero stays bright `#E5322D`); `threshold={0.05}` lights slightly darker pixels for a denser field; inline `opacity: 0.6` keeps the origin a quieter room than the hero's `0.72`. `origin-dots` is just a future styling hook (no CSS required to function).

**B2 — re-grade the origin scrim to a low-anchored vignette** (`assets/app.jsx:5249-5251`, the inline overlay div — the inverse light map of the hero's center-radial). Replace:
```jsx
          <div className="absolute inset-0 z-[1] pointer-events-none" style={{
            background: 'linear-gradient(180deg, rgba(5,5,5,0.45) 0%, rgba(5,5,5,0.35) 45%, rgba(5,5,5,0.70) 100%)'
          }} />
```
with:
```jsx
          <div className="absolute inset-0 z-[1] pointer-events-none" style={{
            background: 'radial-gradient(ellipse 90% 70% at 50% 78%, rgba(5,5,5,0.18), rgba(5,5,5,0.62) 72%), linear-gradient(180deg, rgba(5,5,5,0.62) 0%, rgba(5,5,5,0.34) 50%, rgba(5,5,5,0.66) 100%)'
          }} />
```
Why: radial anchored low (`at 50% 78%`) → dots brightest in the lower-center band (where the stats card/CTA sit); type up top sits over a darker wash. Inverse emphasis of the hero → reads different at a glance. The `.hero-grain` overlay (`app.jsx:5248`) and top/bottom fades (`app.jsx:5252-5255`) stay as-is. No reduced-motion rule needed (already lower-opacity, not the LCP element).

**Net A+B differentiation:**
| | Hero `#beranda` | Origin `#asal-usul` |
|---|---|---|
| Source | `new-hero.mp4` (unchanged) | `trade-pro.mp4` |
| Color | `#E5322D` bright | `#B81F1B` deep oxblood |
| `cellSize` | 7 (coarse) | 5 (fine/dense) |
| Video opacity | 0.72 | 0.6 |
| Scrim | center-dark radial, thin top → dots at edges | low-anchored vignette → dots in lower band |

---

### (C) IntegrationsSpine 2-row iPhone-mockup tiles — `assets/app.jsx` + `index.html`

Keep the section eyebrow/headline/sub/hub/foot (`app.jsx:5202-5205, 5228`) **verbatim** — only the inner tile changes. Reuse the DashboardDemo bubble *visual language* but with **scoped `.is-msg-*` classes** so the tile doesn't couple to the hero-only `db-*` CSS.

**C1 — new data array** (`assets/app.jsx:5185-5198`). Adds `msg` (agent bubble copy) + `shot` (future asset path + placeholder screen caption/metric). Replace the whole `apps` array with:
```jsx
      const apps = [
        { key: 'content', name: 'R2 Content', status: 'live',
          line: 'Agen kamu menyusun dan menjadwalkan konten di R2 Content — dari kalender posting sampai draf caption.',
          micro: '7 post terjadwal minggu ini',
          msg: 'Sudah aku susun 7 post minggu ini di R2 Content, lengkap dengan draf caption gaya kamu.',
          shot: { src: '/assets/r2-content.png', title: 'R2 Content', caption: 'Kalender konten', metric: '7 post · 3 pilar' } },
        { key: 'fit', name: 'R2 Fit', status: 'live',
          line: 'Agen kamu menata program latihan dan mencatat progres di R2 Fit, jadi kamu tinggal jalan.',
          micro: 'Streak 12 hari berjalan',
          msg: 'Program latihan kamu aku tata di R2 Fit, dan progres hari ini sudah tercatat.',
          shot: { src: '/assets/r2-fit.png', title: 'R2 Fit', caption: 'Program & progres', metric: 'Streak 12 hari' } },
        { key: 'finance', name: 'R2 Finance', status: 'live',
          line: 'Agen kamu merapikan pemasukan dan pengeluaran di R2 Finance, lalu kasih ringkasan yang kamu mengerti.',
          micro: 'Ringkasan cashflow tiap minggu',
          msg: 'Pemasukan dan pengeluaran kamu aku rapikan di R2 Finance — ini ringkasan minggu ini.',
          shot: { src: '/assets/r2-finance.png', title: 'R2 Finance', caption: 'Ringkasan cashflow', metric: 'Mingguan · rapi' } },
        { key: 'school', name: 'Gmail / Sekolah', status: 'segera',
          line: 'Agen kamu baca email dan portal sekolah kamu, rangkum yang penting, lalu siapkan tugas sebelum tenggat.',
          micro: 'Email · portal · tenggat',
          msg: 'Sebentar lagi aku bisa baca email dan portal sekolah kamu, lalu siapkan tugas sebelum tenggat.',
          shot: { src: '/assets/r2-school.png', title: 'Gmail / Sekolah', caption: 'Email · portal · tenggat', metric: 'Segera hadir' } },
      ];
```
> Honesty: the three live `msg` lines are present/past-tense about R2 apps we actually drive; the Segera line is explicitly future-tense ("Sebentar lagi aku bisa…") and never claims it reads email today. Uses `email` (singular), not banned `emails`. None of the 14 banned demo substrings appear.

**C2 — new tile JSX** (`assets/app.jsx:5214-5224`). Keep the `Mot.div` wrapper (`:5208-5213`) and its `className={\`is-tile is-tile--${a.status}\`}` exactly. Replace **only the children** — the old `.is-viz` + head + line + micro — with:
```jsx
                  {/* ROW 1 — agent chat message (visual language mirrors DashboardDemo
                      renderBubble at app.jsx:2805-2810; scoped is-msg-* classes so the
                      tile owns its styling and doesn't couple to the hero-only db-* CSS) */}
                  <div className="is-msg-row">
                    <div className="is-msg-avatar" aria-hidden="true">●</div>
                    <div className="is-msg-bubble">{a.msg}</div>
                  </div>

                  {/* Tile head: app name + Aktif/Segera chip (unchanged semantics) */}
                  <div className="is-tile-head">
                    <span className="is-tile-name">{a.name}</span>
                    <span className={`is-chip is-chip--${a.status}`}>
                      {a.status === 'live' ? <><span className="is-chip-dot" />Aktif</> : 'Segera'}
                    </span>
                  </div>
                  <p className="is-tile-line">{a.line}</p>

                  {/* ROW 2 — iPhone portrait frame. SWAP POINT: replace the <div className="is-shot">…</div>
                      below with <img className="is-shot-media" src={a.shot.src} alt="" /> (or a <video
                      className="is-shot-media" muted loop playsInline>) when a real screen-record exists.
                      .is-shot-media is pre-styled object-fit:cover at 100%×100% → ZERO layout change. */}
                  <div className="is-phone" aria-hidden="true">
                    <div className="is-phone-island" />
                    <div className="is-phone-screen">
                      {/* PLACEHOLDER — illustrative, not a captured screenshot. */}
                      <div className={`is-shot is-shot--${a.key}`}>
                        <div className="is-shot-top">
                          <span className="is-shot-app">{a.shot.title}</span>
                          <span className="is-shot-tag">{a.status === 'live' ? 'Pratinjau app' : 'Segera hadir'}</span>
                        </div>
                        <div className="is-shot-body">
                          <span className="is-shot-bar" /><span className="is-shot-bar" />
                          <span className="is-shot-bar" /><span className="is-shot-bar" />
                        </div>
                        <div className="is-shot-foot">
                          <span className="is-shot-cap">{a.shot.caption}</span>
                          <span className="is-shot-metric">{a.shot.metric}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="is-tile-micro">{a.micro}</div>
```
Tile order: **message → head(name+chip) → line → iPhone → micro**. The old `.is-viz` 4-bar block is removed (its "this is live/animated" job is now carried by the phone's animated bar + the unchanged `.is-tile--live::before` top flow bar).

**C3 — CSS** (`index.html`):

*(a)* **Remove the dead `.is-viz` rules** at `index.html:346-351` (the `.is-viz`, `.is-viz span`, the two `:nth-child` lines, `.is-tile--live .is-viz span` + delays, and `.is-tile--segera .is-viz span`). Verified these are the only `.is-viz` references; removing them is safe once the JSX no longer renders `.is-viz`.

*(b)* **Give the tile a column flex** so rows stack. Replace the `.is-tile` rule at `index.html:339`:
```css
    .is-tile { position: relative; display: flex; flex-direction: column; text-align: left; background: rgba(18,18,18,0.6); border: 1px solid rgba(255,255,255,0.10); border-radius: 18px; padding: 18px; overflow: hidden; transition: border-color 220ms ease, transform 220ms ease; }
```

*(c)* **Add this block immediately after `.is-tile-micro`** (`index.html:359`), before `.is-foot`:
```css
    /* ── ROW 1: agent message bubble (mirrors DashboardDemo .db-bubble/.db-avatar) ── */
    .is-msg-row { display: flex; gap: 9px; align-items: flex-start; margin-bottom: 16px; }
    .is-msg-avatar {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #E5322D, #8B1410);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 10px; line-height: 1; margin-top: 1px;
    }
    .is-msg-bubble {
      flex: 1; padding: 9px 12px; border-radius: 4px 13px 13px 13px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
      font-family: 'Inter', sans-serif; font-weight: 300; font-size: 12.5px; line-height: 1.45;
      color: rgba(255,255,255,0.9);
    }
    .is-tile--segera .is-msg-avatar { background: linear-gradient(135deg, rgba(255,255,255,0.30), rgba(255,255,255,0.12)); }
    .is-tile--segera .is-msg-bubble { color: rgba(245,245,245,0.62); }

    /* ── ROW 2: CSS-drawn iPhone portrait frame ── */
    .is-phone {
      position: relative; width: 100%; max-width: 172px; margin: 16px auto 0;
      aspect-ratio: 9 / 19.5; border-radius: 30px; padding: 7px;
      background: linear-gradient(160deg, #1c1c1e, #050505);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 14px 40px -22px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.04);
    }
    .is-phone-island {
      position: absolute; top: 13px; left: 50%; transform: translateX(-50%);
      width: 34%; height: 12px; border-radius: 999px;
      background: #000; border: 1px solid rgba(255,255,255,0.10); z-index: 2;
    }
    .is-phone-screen {
      position: relative; width: 100%; height: 100%; border-radius: 24px;
      overflow: hidden; background: #0a0a0a;
    }
    /* SWAP TARGET — real <img>/<video> drops in here, no geometry change. */
    .is-shot-media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

    /* Placeholder app "screen" (illustrative — not a captured screenshot) */
    .is-shot {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      padding: 26px 12px 14px; gap: 10px;
      background:
        radial-gradient(120% 60% at 50% -10%, rgba(229,50,45,0.22), transparent 60%),
        linear-gradient(180deg, #131313, #0a0a0a);
    }
    .is-shot-top { display: flex; flex-direction: column; gap: 4px; }
    .is-shot-app { font-family: 'Instrument Serif', serif; font-size: 15px; color: #f5f5f5; letter-spacing: -0.01em; }
    .is-shot-tag {
      align-self: flex-start; font-family: 'JetBrains Mono', monospace; font-size: 7.5px;
      letter-spacing: 0.14em; text-transform: uppercase; padding: 2px 6px; border-radius: 999px;
      color: #ff8a86; background: rgba(229,50,45,0.14); border: 1px solid rgba(229,50,45,0.4);
    }
    .is-shot-body { flex: 1; display: flex; flex-direction: column; gap: 7px; justify-content: center; }
    .is-shot-bar { height: 9px; border-radius: 4px; background: rgba(255,255,255,0.10); }
    .is-shot-bar:nth-child(1) { width: 86%; background: rgba(229,50,45,0.55); }
    .is-shot-bar:nth-child(2) { width: 64%; }
    .is-shot-bar:nth-child(3) { width: 92%; }
    .is-shot-bar:nth-child(4) { width: 48%; }
    .is-tile--live .is-shot-bar:nth-child(1) { animation: isBar 2.8s ease-in-out infinite; }
    .is-shot-foot { display: flex; flex-direction: column; gap: 3px; }
    .is-shot-cap { font-family: 'Inter', sans-serif; font-weight: 300; font-size: 9.5px; color: rgba(245,245,245,0.62); }
    .is-shot-metric { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: rgba(245,245,245,0.4); }

    /* Segera: dimmed + dashed phone, coming-soon screen — honest, no captured-data claim */
    .is-tile--segera .is-phone { border-style: dashed; border-color: rgba(255,255,255,0.18); opacity: 0.9; }
    .is-tile--segera .is-shot { background: linear-gradient(180deg, #101010, #070707); }
    .is-tile--segera .is-shot-tag { color: rgba(245,245,245,0.55); background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.14); }
    .is-tile--segera .is-shot-bar { background: rgba(255,255,255,0.07); }
    .is-tile--segera .is-shot-bar:nth-child(1) { background: rgba(255,255,255,0.16); animation: none; }

    /* Phone size cap on mobile so a 1-up tile doesn't get a giant phone */
    @media (max-width: 639px) { .is-phone { max-width: 150px; } }
```

*(d)* **Reduced-motion guard** (`index.html:365-367`). Since `.is-viz` is removed, replace the guard body so it freezes the new placeholder bar instead:
```css
    @media (prefers-reduced-motion: reduce) {
      .is-tile--live::before, .is-tile--live .is-shot-bar, .is-chip-dot { animation: none; }
    }
```

**C4 — the documented swap point (for the founder, later).** When real captures exist, in `assets/app.jsx` replace the placeholder block `<div className={\`is-shot is-shot--${a.key}\`}> … </div>` with one element:
```jsx
<img className="is-shot-media" src={a.shot.src} alt="" />
{/* or: <video className="is-shot-media" src={a.shot.src} muted loop playsInline autoPlay /> */}
```
`a.shot.src` already names each future asset (`/assets/r2-content.png`, `/assets/r2-fit.png`, `/assets/r2-finance.png`, `/assets/r2-school.png`). `.is-shot-media` is pre-styled `inset:0; object-fit:cover` → iPhone geometry never moves. Live tiles get the real screen; the Segera tile keeps the placeholder until that integration ships. **Then re-run `build-landing.mjs`.**

> Pre-existing, out of scope: the `live-dot` spans inside `.is-eyebrow` (`app.jsx:5202`) and `.is-hub` (`:5205`) have no matching CSS (the only `.live-dot` rule is scoped to `.db-section .db-eyebrow-pill`), so they render unstyled today. Do not "fix" it in this change.

---

### (D) Payment CORS fix — `supabase/functions/_shared/cors.ts` + redeploy (no landing rebuild)

**Root cause (one line):** Edge Functions deploy globally and manually, never on Vercel preview pushes; the live `create-invoice` is a stale build whose CORS allowlist predates preview-origin support (and never included `velorah-nu`), so preview/`velorah-nu` origins get **no** `Access-Control-Allow-Origin` → preflight fails → no invoice → no payment. Fix = **harden `cors.ts` AND redeploy** the browser-callable functions.

**Evidence the repo code isn't the bug, the deploy is:** the founder's console says "*No `Access-Control-Allow-Origin` header is present*" (total absence), not "*origin X is not allowed*". A function running the current `cors.ts` always emits *some* `Access-Control-Allow-Origin` (echoed origin or the prod fallback). Total absence ⇒ the deployed function predates `PROJECT_ORIGIN_RE` (commit `79c9a91`, 2026-05-06) or errors before headers attach. `create-invoice` has `verify_jwt=false` (`supabase/config.toml:24-25`), ruling out a gateway-auth cause.

**How checkout calls it:** `checkout.html:1092-1093` (`SUPABASE_FUNCTIONS_URL = '…gtjgsligllbjcisiyrah.supabase.co/functions/v1'`, anon JWT) → `checkout.html:1424-1449` POSTs to `${…}/create-invoice` with `content-type: application/json` + `authorization: Bearer …`. The non-simple headers force a **preflight OPTIONS**; both OPTIONS and POST must echo the origin. No cookies/credentials are sent (no `credentials`/`withCredentials` anywhere), so the design echoes a tight allowlist rather than `*`.

**Server path:** `create-invoice/index.ts:162-173` → `handleCors(req)` (OPTIONS) and `withCors(res, req)` (POST), both → `browserCorsHeaders(req)` → `pickAllowedOrigin` in `_shared/cors.ts`. Preflight and response are symmetric, so editing only `pickAllowedOrigin` is sufficient.

**D1 — harden the allowlist.** In `supabase/functions/_shared/cors.ts` (currently `:28-42`):

**BEFORE:**
```ts
const PROJECT_ORIGIN_RE =
  /^https:\/\/weuseai-agent(?:-[a-z0-9]+(?:-[a-z0-9-]+)?)?\.vercel\.app$/i

function pickAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (PROJECT_ORIGIN_RE.test(origin)) return origin
  return 'https://weuseai-agent.vercel.app'
}
```
**AFTER:**
```ts
// Exact production/custom-domain origins (extend when a custom domain lands).
const ALLOWED_EXACT_ORIGINS = new Set<string>([
  'https://weuseai-agent.vercel.app',
  'https://velorah-nu.vercel.app',
])

// Vercel preview deploys for THIS project + scope only. Vercel preview hosts
// are <project>-<...>-<scope-slug>.vercel.app. We require the project prefix
// AND the trusted scope suffix so a third party can't register
// "weuseai-agent-evil.vercel.app" under THEIR account and pass.
//   scope slug for team_kkzsbca3s7jSJaiwFL5ZTK37 = "richies-projects-6f212435"
const PREVIEW_PREFIX = 'https://weuseai-agent-'
const PREVIEW_SUFFIX = '-richies-projects-6f212435.vercel.app'

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_EXACT_ORIGINS.has(origin)) return true
  if (origin.startsWith(PREVIEW_PREFIX) && origin.endsWith(PREVIEW_SUFFIX)) {
    // Reject embedded whitespace / control chars defensively.
    return !/[\s/]/.test(origin.slice(PREVIEW_PREFIX.length, -PREVIEW_SUFFIX.length))
  }
  return false
}

function pickAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (isAllowedOrigin(origin)) return origin
  // Fail closed: echo the canonical prod origin so unknown origins are
  // rejected by the browser rather than silently allowed.
  return 'https://weuseai-agent.vercel.app'
}
```
Why this is both a fix and a hardening: it pins the **scope suffix** so only previews under the founder's own Vercel team match (the old greedy regex would also have matched `weuseai-agent-anything-attacker.vercel.app`); it adds `velorah-nu.vercel.app` (currently rejected → currently broken); and it stays **fail-closed** (never `*`). No change to `handleCors`/`withCors`/`index.ts` — symmetry is automatic.

> Before shipping, **confirm the scope slug** is `richies-projects-6f212435` (from the failing origin string + `.vercel/project.json`). If Vercel changes it, update `PREVIEW_SUFFIX`.

**D2 — redeploy (FOUNDER ACTION — this is the actual unblock).** The sandbox has no secrets. The founder (or CI) runs:
```bash
supabase functions deploy create-invoice --project-ref gtjgsligllbjcisiyrah
```
or `scripts/deploy-all.sh`. Even deploying the *current* repo `cors.ts` unmodified unblocks git-branch previews; D1 additionally fixes `velorah-nu` and hardens the allowlist.

**D3 — shared-helper blast radius.** `cors.ts` is imported by ~38 functions; editing it once fixes the logic for all, but **each must be redeployed** (`supabase functions deploy` bundles the shared file per-function — no shared runtime module). Browser-callable ones to redeploy in the same pass: `create-invoice`, `complete-onboarding`, `customer-progress-proxy`, `customer-readiness`, `rotate-pairing-code`, `validate-bot-token`, `save-onboarding-profile`, `reset-bot-pairing`, `genesis-distill`, `agent-chat-relay`. Note `scripts/deploy-all.sh:31-33` only loops a subset (`create-invoice complete-onboarding xendit-webhook …`) — `customer-progress-proxy`, `customer-readiness`, `rotate-pairing-code`, `validate-bot-token`, `save-onboarding-profile`, `genesis-distill`, `agent-chat-relay` are **not** in that loop and would keep serving stale CORS. **Recommend extending the deploy loop to include them.**

**D4 — `cdn.tailwindcss.com` warning (NOT the payment blocker, flag-and-defer).** `checkout.html:18` loads `<script src="https://cdn.tailwindcss.com"></script>` → the "should not be used in production" console warning (the "checkout:64" line is just where the runtime surfaces it; source is line 18). Cosmetic — does **not** affect CORS or payment. To address later: compile Tailwind to a static stylesheet the way the landing already does (`build-landing.mjs` → `tw.css`) and swap the CDN `<script>` for a `<link>`. Out of scope for the payment fix.

---

## 4. Phased build order

Each landing phase ends with: rebuild → gates → browser preview check. Phase D ends with: edit → (founder) deploy → real CORS check.

**Phase 0 — branch hygiene.** Confirm you're on `landing/phase-1-domain-china`. No commit/push unless the founder asks.

**Phase D (FIRST — revenue-blocking).**
1. Apply **D1** to `supabase/functions/_shared/cors.ts`. (No landing rebuild — backend only.)
2. Confirm the **scope slug** with the founder (Open decision §6).
3. **Founder action:** redeploy `create-invoice` + the browser-callable functions in **D3**; recommend extending `scripts/deploy-all.sh`.
4. **Verify:** on the preview deploy, retry checkout — the CORS error should clear and an Xendit invoice URL should return. Run the explicit preflight check in §5.

**Phase A+B — backgrounds (do together; same region).**
1. Apply **A1/A2/A3** (`index.html`) and **B1/B2** (`assets/app.jsx`).
2. Rebuild + run `landing-build.spec.ts` + `landing-pricing-drift.spec.ts`.
3. Browser check: hero red dots clearly visible behind the dashboard mockup (mockup still legible); origin visibly distinct from hero (different motion/density/hue/light map).

**Phase C — iPhone-mockup tiles.**
1. Apply **C1** (data), **C2** (JSX), **C3** (CSS a–d).
2. Rebuild + run both gates (honesty banlist must pass; pricing untouched).
3. Browser check: each tile shows message bubble → name+chip → line → iPhone (with placeholder screen) → micro; Segera tile reads coming-soon honestly; iPhone caps at 172px desktop / 150px mobile.

> Phases are independent; D can land and deploy while A/B/C are still in progress. Recommended sequence keeps the revenue fix first.

---

## 5. Test + verification

**Gates (after every landing edit):**
```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah" \
  && node scripts/build-landing.mjs \
  && npx playwright test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts
```
- Freshness (byte-for-byte `app.js`/`tw.css`); honesty banlist (14 demo substrings — verify `email` not `emails`, no `Auto-publish`/`kalender di-sync`/`overnight`); `index.html` has no `babel`/`cdn.tailwindcss.com`/`type="text/babel"`; pricing "Rp 99rb/bulan" unchanged. Also confirm zero `!` and no brand-banned words in any new copy.

**Per-section browser checks:**
- **Hero (A):** red dots read clearly in the margins/headline band; dashboard mockup fully legible; bottom seam into the next section clean.
- **Origin (B):** plays `trade-pro.mp4`, deeper oxblood, finer dots, lower-band brightness — unmistakably not the hero.
- **Integrations (C):** all four tiles render the two rows; live tiles full-color with animated bar + flow line; Segera tile dimmed/dashed with "Segera hadir"; no banned copy.

**Payment preflight/CORS check (D)** — after redeploy, from the preview-deploy origin:
```bash
curl -i -X OPTIONS \
  'https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/create-invoice' \
  -H 'Origin: https://weuseai-agent-git-landing-phase-1-domain-china-richies-projects-6f212435.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```
Expect `200` + `Access-Control-Allow-Origin:` echoing that exact origin. Repeat with `Origin: https://velorah-nu.vercel.app` (expect it echoed) and a junk origin (expect the fallback `https://weuseai-agent.vercel.app`, i.e. browser-rejected). Then do a real end-to-end checkout on the preview (Xendit TEST mode) and confirm an invoice URL returns.

**Responsive (test at 14" / 13" / mobile ~375px):**
- iPhone mockups must **not** blow up on mobile — confirm the `max-width: 150px` cap holds in a 1-up tile at ~375px, and 172px at desktop.
- Grid steps 1-up → 2-up (`640px`) → 4-up (`1024px`) cleanly; phones stay centered in each tile.
- Hero/origin scrims hold text contrast at all three widths.

---

## 6. Open decisions / founder asks

1. **Real R2 app screenshots/screen-records** for the iPhone frames. The centerpiece ships with branded placeholders today; the structure (`a.shot.src` + `.is-shot-media` swap point, C4) is ready. **Ask:** drop `r2-content.png`, `r2-fit.png`, `r2-finance.png` (and later `r2-school.png`) into `assets/`, then swap per C4 and rebuild. **Recommendation:** ship placeholders now, swap reals as they arrive — no layout change.
2. **Vercel scope slug** for `PREVIEW_SUFFIX`. Evidence says `richies-projects-6f212435`. **Ask:** confirm against `.vercel/project.json` / the failing origin. **Recommendation:** confirm before deploy; it's the one value that, if wrong, leaves previews broken.
3. **Redeploy + which functions.** **Ask:** run the redeploy for the browser-callable set (D3) and extend `scripts/deploy-all.sh` to include the 7 currently-missing functions. **Recommendation:** do both in one pass so this class of staleness can't recur.
4. **Test on prod vs preview.** Xendit is in TEST mode. **Recommendation:** validate on the preview deploy first (no real money), then confirm prod `weuseai-agent.vercel.app` and `velorah-nu.vercel.app` both checkout after deploy.
5. **Confirm the deployed `create-invoice` version** (Supabase dashboard → Edge Functions → last-deployed timestamp). **Recommendation:** check it; if it predates 2026-05-06 it confirms the staleness root cause outright.
6. **Hero brightness level.** Default `opacity: 0.72`. **Recommendation:** ship `0.72`; only go `0.85` (with the paired stronger radial) if it still reads dim on the founder's screen.
7. **Origin source fallback.** If `trade-pro.mp4` reads too busy once dotted, fall back to `deep-researcher.mp4`. **Recommendation:** try `trade-pro` first; it's the most on-brand for the origin story and a small file.

---

## 7. Constraints + non-goals

- **Brand voice:** Bahasa Indonesia, `kamu`, calm-premium. Zero `!` in body. No banned words (`basically/just/literally/honestly/revolutionary/disrupt/10x/game-changer/next-level`).
- **Honesty:** the iPhone screens are **placeholders** (`Pratinjau app` / `Segera hadir`), never asserted as captured screenshots. No fabricated screenshots. The Segera tile must read coming-soon honestly (future-tense `msg`, dashed/dimmed phone, `Segera hadir`). Keep clear of all 14 banned demo substrings (`email` not `emails`).
- **Secure CORS:** never open to `*`. Keep the **fail-closed** fallback and the **scope-pinned** preview allowlist. Adding `velorah-nu` is allowed; broadening to arbitrary `vercel.app` is not.
- **No price changes:** `.is-foot` "Rp 99rb/bulan" and all price strings untouched (pricing-drift gate).
- **Don't break shipped sections:** keep the IntegrationsSpine eyebrow/headline/sub/hub/foot verbatim; keep the hero `DashboardDemo` mockup and its `cellSize={7}`; keep the origin grain + top/bottom fades. Do not "fix" the pre-existing unstyled `live-dot` spans.
- **Build discipline:** every `app.jsx`/`index.html` edit MUST be followed by `node scripts/build-landing.mjs` before the freshness gate, or it fails. `index.html` ships live — keep the inline `<style>` valid.
- **Backend scope:** the `cors.ts` edit is inert until the founder deploys; the redeploy (not the code) is the payment unblock. Sandbox cannot deploy.

---

**Files touched (all absolute):**
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/index.html` — hero CSS A1/A2/A3 (`:305, :307-311, :321`); `.is-tile` flex (`:339`); remove dead `.is-viz` (`:346-351`); add `.is-msg-*`/`.is-phone*`/`.is-shot*` block after `:359`; reduced-motion guard (`:365-367`).
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/assets/app.jsx` — origin `DottedVideo` + scrim B1/B2 (`:5241-5251`); integrations `apps[]` C1 (`:5185-5198`) + tile children C2 (`:5214-5224`).
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/supabase/functions/_shared/cors.ts` — `pickAllowedOrigin` hardening D1 (`:28-42`).
- `/Volumes/Extreme SSD/Projects/weuseai.agent/velorah/scripts/deploy-all.sh` — (recommended) extend the deploy loop to the 7 missing browser-callable functions.
- Regenerated by build (do not hand-edit): `assets/app.js`, `assets/tw.css`.