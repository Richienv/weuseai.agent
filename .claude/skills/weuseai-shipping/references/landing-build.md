# Landing build — precompiled-React pipeline

The marketing landing (`index.html` + `assets/app.jsx`) is a React-via-CDN page
that is **compiled at COMMIT time**, not in the visitor's browser. Vercel stays a
pure static host (no build step — a build step froze production once, PR #236). If
you touch the landing, you regenerate the committed artifacts yourself and commit
them alongside the source, or the freshness gate fails the suite.

This file tells you exactly how to edit, rebuild, gate, and verify it in one shot.

---

## What the pipeline is

`scripts/build-landing.mjs` does two jobs once, here, and writes two committed
artifacts:

1. **`assets/app.jsx` → `assets/app.js`** via esbuild:
   `--loader:.jsx=jsx --jsx=transform --minify --target=es2018 --charset=utf8 --legal-comments=none`.
   `--jsx=transform` means classic `React.createElement` against the UMD React
   globals loaded in `index.html` — **no ESM `import` statements survive** (the gate
   asserts none do). The compiled bundle keeps `createRoot` as its render entry.

2. **Tailwind classes → `assets/tw.css`** via pinned `tailwindcss@3.4.17` (pinned
   for determinism so the byte-diff gate is reproducible). The script writes a
   throwaway `build/tw.config.cjs` whose `content` scans **`./index.html`,
   `./assets/app.jsx`, and `./assets/persona-details.js`** — those three files are
   the universe of classes. A class used anywhere else will NOT be emitted. The
   config also mirrors the former inline `tailwind.config` (font families
   `heading`/`body`/`mono`/`hanzi`, custom `foreground`/`muted-foreground`/`border`
   colors) — if you add a themed token you extend it here, not in `index.html`.

`index.html` references the artifacts and carries exactly ONE inline `<style>`
block (hand-authored CSS, line ~51). The build script does **not** extract or
rewrite that `<style>` — it is committed by hand. The freshness gate only re-runs
the script and byte-compares `app.js`/`tw.css`; it does not touch `index.html`
content beyond the head-purity structural check.

`index.html` head must contain (gated, exact strings):
- `<script src="/assets/app.js" defer></script>`
- `<link rel="stylesheet" href="/assets/tw.css">`

---

## The three gates (read them; do not fight them)

### 1. Freshness — byte-for-byte (`tests/landing-build.spec.ts`)

The first test reads `assets/app.js` + `assets/tw.css`, **re-runs
`node scripts/build-landing.mjs`**, then asserts the bytes are unchanged. Any edit
to `app.jsx` (or to a page class that changes the emitted CSS) without rerunning the
script fails with:
> `assets/app.js is stale — rerun \`node scripts/build-landing.mjs\` and commit it`

**Implication:** ALWAYS rebuild and commit `app.jsx` + `app.js` + `tw.css` +
`index.html` together as one unit. Never hand-edit `app.js`/`tw.css`. Never commit
an `app.jsx` change without the regenerated artifacts. Because the gate literally
shells out to the same esbuild + tailwind on the runner, the only way to pass is to
have actually run the script with the same pinned tool versions.

### 2. Head purity (`tests/landing-build.spec.ts`)

The page must ship the **compiled** stack and NEVER the runtime compilers (each
re-adds seconds on the mid-range Android + 4G our customers use). The gate asserts
`index.html` does NOT contain any of these substrings:
- `babel` — Babel-standalone (~2.6MB) must never return
- `cdn.tailwindcss.com` — Tailwind runtime JIT must never return
- `hls.min.js` — hls.js is lazy-loaded from inside `app.js`, never the head
- `type="text/babel"` — no in-browser JSX `<script>` blocks

A separate test also re-validates `app.jsx` syntax by compiling it to `/dev/null`,
and asserts the bundle is `> 50_000` bytes (catches a truncated/empty build) and
contains `createRoot` and no `import `.

### 3. Demo honesty banlist (`tests/landing-build.spec.ts`)

The chat-demo copy in `app.jsx` must not claim capabilities we don't have
(calendar invites, multi-platform auto-posting, live trend scraping, overnight chat
handling, email triage). The gate fails if `app.jsx` contains ANY of these **exact**
banned substrings:

```
'Sorted', 'emails', 'GST', 'PR #142', 'Auto-publish',
'Calendar update', 'confirmed dalam', 'Live di 6 platform', 'overnight', 'trending apa',
'Auto-monitor', 'otomatis ke OLX', 'kalender di-sync', 'Otomatis dibaca', '10×'
```

And it REQUIRES these two exact strings to be present:
- `Pagi Briefing — dikirim otomatis` (the honest demo script)
- `Aku tidak mengirim apa pun tanpa kamu setujui` (the approval-gate line)

So when you rewrite demo copy: keep it future-honest, keep the approval-gate line,
and don't reintroduce a banned phrase (note `'emails'` and `'overnight'` are broad —
avoid them even incidentally).

### 4. Pricing drift (`tests/landing-pricing-drift.spec.ts`)

`tier-personas.ts` (`supabase/functions/_shared/tier-personas.ts`, the `TIERS`
object) is **canonical**; `app.jsx` must mirror it. The page can't import the Deno-
style TS module, so the pricing cards inline their own setup-fee numeric literals.
This gate **source-greps `app.jsx` as text** and pins, for every sellable tier
(`bare`, `solo`, `voice-starter`, `library-full`, `done-for-you`), the literal
`setupIdr: <fee>` in underscore-grouped form (e.g. `setupIdr: 99_000`) computed from
`TIERS[tier].setup_fee_idr`. It also pins:
- Regression literals that must be ABSENT: `setupIdr: 249_000`, `Rp 348rb` (old wrong
  Bare fee).
- Bare must show `setupIdr: 99_000`, `priceLabel: 'Rp 99rb'`, `month1Total: 'Rp 198rb'`.
- Solo must be present: `name: 'Solo Starter'`, `slug: 'solo'`, `setupIdr: 399_000`,
  `priceLabel: 'Rp 399rb'`.
- Every sellable slug appears as `slug: '<tier>'`.
- Round-trip `toLocaleString('id-ID')` strings stay stable (`99.000` / `399.000` /
  `599.000` / `799.000` / `999.000` anchor / `1.299.000`).

**Because it greps the SOURCE, not the rendered page:** hiding a card behind a
runtime filter is SAFE (the literal still exists in `app.jsx`), but **deleting the
catalog object / card from `app.jsx` breaks the gate** even if the page still looks
right. If you change a fee, change it in `tier-personas.ts` first (canonical), then
mirror the literal into `app.jsx`. `enterprise` is contact-only and excluded.

---

## Copy-paste: rebuild + gate + verify

Run from the repo root. This is the full one-shot loop — it rebuilds, syntax-checks
`app.jsx` independently, and runs both landing gates:

```bash
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah" && \
  node scripts/build-landing.mjs && \
  npx esbuild assets/app.jsx --loader:.jsx=jsx --jsx=transform --outfile=/dev/null && \
  node --test tests/landing-build.spec.ts tests/landing-pricing-drift.spec.ts
```

If pricing changed, run that gate's source-of-truth (`tier-personas.ts`) first.
Then commit `assets/app.jsx`, `assets/app.js`, `assets/tw.css`, and `index.html`
together in one commit.

### Visual verification with Playwright (the part that bites)

The built-in Vercel preview server 404s every asset path because `vercel.json` sets
`cleanUrls: true` + `trailingSlash: false` — it rewrites `/assets/app.js`-style
paths and breaks local serving. **Do not use it for verification.** Instead serve
the raw repo over a plain static server and drive Playwright (already installed at
`/opt/homebrew/lib/node_modules/playwright`) directly:

```bash
# 1. Serve the repo root on a private port (pick 88xx to avoid collisions)
cd "/Volumes/Extreme SSD/Projects/weuseai.agent/velorah" && \
  python3 -m http.server 8801 >/tmp/landing-http.log 2>&1 &

# 2. Drive Playwright via the global install path, screenshot + assert
node --input-type=module <<'EOF'
import { chromium } from 'file:///opt/homebrew/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto('http://localhost:8801/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500); // let BlurText IntersectionObserver fire
await p.screenshot({ path: '/tmp/landing-full.png', fullPage: true });
// Assert via the DOM, not innerText (see gotcha re: BlurText)
const hasPricing = await p.evaluate(() => document.body.innerText.includes('Rp 99rb'));
console.log('pricing visible:', hasPricing);
await b.close();
EOF
```

Then `Read /tmp/landing-full.png` to eyeball it. Kill the server when done
(`kill %1` or `pkill -f "http.server 8801"`).

---

## Brand / honesty rules for landing copy

All customer-facing copy on this page obeys the repo brand voice (CLAUDE.md):

- **Bahasa Indonesia** primary; English only for dev terms (npm, Docker, API).
- Address the reader as **`kamu`** — never `Anda`, never `lo/gue`.
- **ZERO exclamation marks** in body copy (max 1 per short caption).
- **Banned words — never use:** `basically`, `just`, `literally`, `honestly`,
  `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`,
  `next-level`. Calm-premium register: not Duolingo, not tech-bro neon, not hustle.
- One idea per sentence; two-sentence paragraphs preferred.
- **Palette:** bg `#0a0a0a` / deep `#050505`, ink `#f5f5f5`, accent signal-red
  `#E5322D`. Fonts: **Inter** (body) + **Instrument Serif** (hero/headings, the
  `heading` family). Liquid-glass cards, max 1 emoji per section.
- **Honesty:** no fabricated capabilities, no fake screenshots, no claimed
  integrations we don't run. Anything not yet live is written in **future tense**
  ("nanti bisa…"), never as a present capability. The demo-honesty gate enforces a
  slice of this; the rest is on you.
- **Pricing is honesty-locked:** the `library-full` 999k is a display-only
  strikethrough anchor that is NEVER charged. The launch FOMO (15-min timer, "first
  100" badge) is session-urgency/anchoring ONLY — never write "harga naik setelah
  <date>" (prices don't rise) and the 100-counter must read a real subscription
  count.

Filter before shipping copy: *"Would someone I respect in Jakarta save this, or
scroll past?"*

> Touching `index.html` / the landing substantively is a flagged regression risk in
> CLAUDE.md. Copy/visual redesigns are fine to proceed on, but anything that changes
> pricing logic or marketing CLAIMS is founder-gated — stop and ask.

---

## Common gotchas

- **Line numbers drift.** `app.jsx` is ~5000+ lines and shifts every edit. When
  editing or asserting, match on quoted string content (e.g. the `setupIdr:` literal
  or a headline), never on a line number.
- **BlurText breaks `innerText.includes()`.** `BlurText` (defined ~line 376) splits
  every headline into **per-word or per-char `<span>`s** (`text.split(' ')` for
  `by='word'`, `text.split('')` for `by='char'`), each its own animated
  `motion.span`. So a headline rendered via `BlurText` is NOT one contiguous text
  node — a naive `innerText.includes('full headline')` can falsely fail, and before
  the IntersectionObserver fires (opacity 0) it may not be "visible" at all. **Verify
  headlines via screenshot**, or assert on body-level `innerText` for non-BlurText
  copy (like the pricing `Rp` labels) after a `waitForTimeout`.
- **Preview server 404s everything** — `cleanUrls`/`trailingSlash` in `vercel.json`.
  Always spin your own `python3 -m http.server 88xx` from the repo root and hit
  `/index.html` explicitly. Don't trust the built-in preview for asset loading.
- **Tailwind only sees three files.** A class added in any file other than
  `index.html`, `assets/app.jsx`, or `assets/persona-details.js` won't be emitted to
  `tw.css` and will render unstyled. Put landing markup in those files, or extend the
  `content` array in `build-landing.mjs`.
- **Don't hand-edit `app.js` / `tw.css`.** They're generated; the freshness gate
  will overwrite-and-diff them. Edit the source, rerun the script.
- **Pin versions are load-bearing.** The freshness gate is byte-exact, so it depends
  on `esbuild` (repo-local) and `tailwindcss@3.4.17` resolving identically. If a gate
  fails purely on bytes after a clean rebuild, suspect a tooling-version mismatch
  before suspecting your edit.
