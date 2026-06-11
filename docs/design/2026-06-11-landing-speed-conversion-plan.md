# Landing speed + conversion plan (Higgsfield case study)

**Date:** 2026-06-11 · **Status:** analysis + brainstorm for founder review.
Nothing here is shipped — landing copy is brand surface, and PR2 / held PR
#231 still own the conflict window on index.html/checkout.html.

---

## 1. Architecture: why the page is slow (hard numbers)

Measured on current main:

| Item | Weight | Problem |
|---|---|---|
| `index.html` | **406KB, 9,114 lines** | ~350KB of JSX is compiled **in the browser** by `@babel/standalone` (~2.7MB script) on every visit. Nothing paints until React + Babel download AND Babel transpiles 9k lines on the main thread. On the mid-range Android + 4G our average-Joe customer uses, that is realistically **5-10s to first content**. |
| Tailwind CDN JIT | ~110KB + runtime CSS generation | Tailwind's own docs: not for production. Adds main-thread work before style exists. |
| framer-motion UMD | ~120KB gz | Loaded eagerly; used widely (41 refs) but not needed before first paint. |
| hls.js | ~80KB gz | Used by one video path — loadable on demand. |
| `assets/` | **20MB**, 14 mp4s, hero 2.6MB | Per-card videos are IO-lazy with `preload="metadata"` (good); the hero mp4 + lib stack still dominate. |
| unicornStudio WebGL | lazy-loaded | Fine as-is. |

**The single highest-conversion lever on this page is speed, and the fix
changes zero pixels:** introduce a build step that precompiles the SAME
JSX once (esbuild, ~30 lines of script + CI hook), emits one static JS
bundle + one compiled Tailwind stylesheet, self-hosts the three fonts, and
lazy-loads framer-motion/hls. Expected: first paint < 1.5s, interactive
< 2.5s on 4G — same page, same animations, same tests. Babel-standalone,
React UMD and Tailwind-CDN all leave the critical path.

Asset pass (also look-preserving): poster images for every video,
re-encode mp4s (CRF 28-32 + WebM/AV1 source where supported) — 20MB → ~6-8MB;
hero capped at ~1MB with a static poster painted instantly.

**Decision needed (founder):** adding the build step is an architecture
change to the "static HTML on Vercel" stack — recommended hard, but it is
a stack-lock amendment. Without it, the copy work below is pushing a heavy
page uphill.

## 2. The Higgsfield conversion playbook, applied honestly

What Higgsfield's landing actually does: the product OUTPUT is the hero
(autoplaying result, zero reading required), price is ≤2 scrolls away, one
verb per CTA, and the gap between "I want this" and "paid" is seconds.
None of that requires trickery — and our honesty lock stays absolute: real
counter (already built, PR #231), no fake deadlines, no "harga naik"
claims, no fake stock. Honest urgency we already truthfully own:

- **Real speed**: "Bot kamu aktif ±8 menit setelah bayar — jam berapa pun."
  (Phase F measured ~6.7 min; round up, stay honest.)
- **Real counter**: the #231 subscription-count badge.
- **Real anchor**: the 999rb strikethrough on Library Lengkap only.

### Per-section recommendations (current order → proposed)

Current: Hero → Start → DashboardDemo → FeaturesChess → Velvet →
FeaturesGrid → ChatVsAgent → CostComparison → **Pricing (#9 of 13)** →
Community → FAQ → Stats → Testimonials → CtaFooter. ~32k word-tokens.

1. **Hero — show the product texting FIRST.** Today's headline ("Enable AI
   Agent dalam hidup kamu, sekarang.") is abstract. The Higgsfield moment
   we own: *the agent messages you before you ask* (Pagi Briefing). Hero =
   phone frame playing a 6-8s loop of a real Telegram thread where the
   agent sends the morning briefing unprompted. Headline drafts (founder
   picks; all lock-compliant):
   - "Asisten yang nge-chat kamu duluan, tiap pagi jam 7."
   - "Bukan chatbot. Asisten pribadi di Telegram kamu, aktif 8 menit dari sekarang."
   - "Kerjaan harian kamu, dikerjain duluan."
   Under the CTA, one microcopy line that kills the three biggest
   hesitations at once: **"Setup 5 menit · bayar pakai QRIS · mulai Rp 99rb."**
2. **Pricing to position #3-4.** Keep one proof section between hero and
   price, not seven. Long-tail sections (FeaturesChess, Velvet, Community,
   Stats) move below Pricing — they convince the undecided without taxing
   the decided.
3. **Sticky mini-CTA** after the hero scrolls away: tier price + "Mulai" —
   a 20-line component, the cheapest conversion add on the page.
4. **Merge ChatVsAgent + CostComparison** into one before/after with two
   numbers. Two sections making one argument is reading tax.
5. **Checkout**: already strong post-#231 (QRIS default, server-priced).
   Add: inline plan switcher (no back-navigation to change tier), a trust
   row near the pay button (Xendit mark · refund-policy link · "server
   kamu sendiri"), and the ±8-menit promise repeated at the moment of
   payment. Email-only first step is already the right "guest checkout"
   shape — keep it.
6. **FAQ**: cut to the five questions that block payment (aman? bisa
   berhenti? datanya di mana? kalau gak puas? perlu jago teknologi?).

## 3. Asset brainstorm — Higgsfield connection (live: **130.66 credits, Plus plan**)

Best models available to us: **Seedance 2.0** (text/image-ref video,
480p-1080p, 4-15s), **Kling 3.0** (motion, `sound: off` saves credits),
**Grok Imagine 1.5** (image→video from a designed still).

Honest take first: for the HERO, a real screen-capture of the actual
Telegram thread (recordable during the Persona Genesis demo-VPS session)
will out-convert any AI-generated abstraction — it is the product, and it
is free. Use Higgsfield where generation beats filming:

| Asset | Model | Prompt direction | Spec |
|---|---|---|---|
| Hero ambient layer (behind the phone frame) | Seedance 2.0, 21:9, 720p, `sound n/a`, 6s loop | "Slow drifting dark charcoal field, thin signal-red light threads pulsing like message routes across a city at night, calm premium, no text, seamless loop, subtle grain" | replaces 2.6MB hero mp4 with ~600KB loop |
| "Agent texts first" stylized loop (socials + hero fallback) | Grok Imagine 1.5 (animate a designed phone-UI still) | start image: clean dark phone mock of the Pagi Briefing thread; prompt: "messages slide in one by one, soft glow on arrival, camera slowly pushes in, ambient morning light shift" | 9:16, 8s — doubles as TikTok/IG ad unit |
| 10 persona-card loops (replace the 14 heavy mp4s over time) | Seedance 2.0 `fast`, 480p, 4s | per-persona visual metaphor, consistent dark+red system, no text | each ~300-500KB |
| Checkout success moment | Kling 3.0 `sound: off`, 1:1, 4s | "a red signal dot travels a dark map from Jakarta to a server rack that lights up, calm, premium" | replaces welcome-success.mp4 |

Budget: at typical Plus-plan video costs, the 130 credits cover roughly
6-12 generations — enough for the hero ambient + the texts-first loop +
2-3 persona tests this round. **No generations run yet** (brand-facing
output + real credits): say the word and I'll run the first batch of three
and send the results for your pick.

## 4. Suggested sequence

1. Founder picks hero headline + approves build-step amendment.
2. Build step + asset re-encode PR (zero visual change, measurable LCP win).
3. After PR2 + #231 land: section reorder + hero swap + sticky CTA PR.
4. Higgsfield batch #1 (3 generations) → pick → integrate.
5. Measure: Vercel analytics LCP + checkout-start rate per section order.
