# Landing Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship two landing changes in one branch — (a) community use case section after Pricing per the 2026-05-05 design doc, (b) pricing section redesign with Booking.com-style price breakdown modal per founder's verbatim spec in chat.

**Architecture:** Single static `liren-v3.html` (React-via-CDN). Two new section/component functions inserted into the existing component declaration block. Pricing's existing `PricingCard` + `Pricing` get rewritten in-place. New `PriceBreakdownModal` + `ConnectedAppsPreview` components added. New `CommunitySection` added between Pricing and FAQ.

**Tech Stack:** React 18 (CDN), Babel-in-browser, Tailwind via CDN, Framer Motion, custom CSS (`liquid-glass`, fonts), brand red `#E5322D`.

**Branch:** `feat/landing-vs-comparison` (will rename if it gets unwieldy; for now both new sections land on this branch alongside the already-shipped vs-chat section).

**Visual verification:** Each task that changes rendered output → push → Vercel auto-rebuilds preview → use Playwright to screenshot the changed section → eyeball + DOM-query check. There are no unit tests for the React-via-CDN landing.

---

## Phase 1 — Community section (smaller, lower risk; ship first)

### Task 1: Add `CommunitySection` function

**Files:**
- Modify: `liren-v3.html` — insert new function declaration right BEFORE `function FAQ()` (currently around line ~3300 after the recent comparison-section additions)

**Step 1.1: Locate insertion point**

Run: `grep -n "function FAQ\|function ChatVsAgentSection\|function Pricing" liren-v3.html`

Expected: shows current order — `ChatVsAgentSection` → `Pricing` → `FAQ`. Insert `CommunitySection` between `Pricing` and `FAQ`.

**Step 1.2: Insert the function** (verbatim copy from design doc card content; cards array per design)

Insert immediately before `function FAQ()`:

```jsx
// ─────────────────────── COMMUNITY ───────────────────────
function CommunitySection() {
  // Two panels:
  //   A — sample skills we ship; agent voice (no personal pronouns)
  //   B — real public posts from the agent runtime ecosystem
  // Cards locked from docs/plans/2026-05-05-community-section-design.md.
  const skillCards = [
    {
      handle: '@weuseaibot',
      tagline: 'agen lo',
      timestamp: 'jam 7:00 WIB',
      body: [
        'Selamat pagi.',
        '5 berita teratas dari detik, kompas, cnbcindonesia',
        'sudah diringkas. Top brief masuk chat ini sekarang.',
      ],
      footer: 'skill: daily-news-briefing-bahasa',
      shipped: true,
    },
    {
      handle: '@weuseaibot',
      tagline: 'agen lo',
      timestamp: 'jam 23:14 WIB',
      body: [
        'Semalam: 50 lowongan dari Glints, LinkedIn, Kalibrr dipantau.',
        '8 fit kriteria gaji + remote + WFA.',
        'Daftar sudah masuk Notion, siap sortir ulang besok pagi.',
      ],
      footer: 'skill: lowongan-scout · roadmap',
      shipped: false,
    },
    {
      handle: '@weuseaibot',
      tagline: 'agen lo',
      timestamp: 'jam 4 sore',
      body: [
        'Topik "cara mulai bisnis F&B" diolah dari 12 sumber.',
        '3 draft caption Instagram + 1 thread X siap di-review.',
        'Tone otomatis mengikuti persona di SOUL.md.',
      ],
      footer: 'skill: content-drafter · roadmap',
      shipped: false,
    },
    {
      handle: '@weuseaibot',
      tagline: 'agen lo',
      timestamp: 'semalam',
      body: [
        '50 hotel di Bali dipantau. 12 dengan rating 4.5+ tapi foto listing buruk.',
        'Foto interior diambil dari Maps, redraft jadi IG post matched ke brand hotel masing-masing.',
        'Postcard dengan QR preview siap dikirim.',
      ],
      footer: 'skill: outreach-postcard · roadmap',
      shipped: false,
    },
  ];

  const communityCards = [
    {
      handle: '@hermes_agent',
      timestamp: '3d ago',
      body: [
        '"Hermes Agent now has multi-agent via the Kanban, new in v0.12.0. Agents claim tasks from a board, work in parallel, and hand off when blocked. You watch progress and unblock from one easy view instead of juggling terminals."',
      ],
      sourceLabel: 'github.com/NousResearch/hermes-agent',
      sourceUrl: 'https://github.com/NousResearch/hermes-agent',
    },
    {
      handle: '@Tiny_Fish',
      timestamp: '16h ago',
      body: [
        '"Starting today, TinyFish Web Search and Fetch are free. For every dev and agent. Across the galaxy. No credit card. Generous rate limits."',
      ],
      sourceLabel: 'x.com/Tiny_Fish',
      sourceUrl: 'https://x.com/Tiny_Fish',
    },
    {
      handle: '@everestchris6',
      timestamp: '10h ago',
      body: [
        '"This OpenClaw bot finds hotels with ugly listing photos, redrafts them as IG posts, and mails the owner a postcard — on autopilot. Scrapes every hotel in a city in real time."',
      ],
      sourceLabel: 'x.com/everestchris6',
      sourceUrl: 'https://x.com/everestchris6',
    },
  ];

  const Avatar = ({ handle }) => {
    // First non-@ char as monogram; pure abstract — no real logos lifted.
    const letter = (handle.replace(/^@/, '')[0] || 'a').toUpperCase();
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 text-[10px] font-mono font-semibold"
        style={{ background: 'rgba(229,50,45,0.18)', color: '#E5322D' }}
      >
        {letter}
      </span>
    );
  };

  const Card = ({ card, isCommunity }) => (
    <Mot.div
      role="article"
      aria-label={`${card.handle} — ${isCommunity ? card.sourceLabel : card.footer}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="liquid-glass rounded-2xl p-5 md:p-6 flex flex-col"
    >
      <div className="flex items-center gap-2 text-[12px] font-mono text-white/65">
        <Avatar handle={card.handle} />
        <span className="text-white/85">{card.handle}</span>
        {card.tagline && <span className="text-white/40">· {card.tagline}</span>}
        <span className="text-white/40">· {card.timestamp}</span>
      </div>
      <div className="mt-3 text-sm text-white/85 font-body font-light leading-relaxed space-y-1">
        {card.body.map((line, li) => (
          <p key={li}>{line}</p>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/[0.07] text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">
        {isCommunity ? (
          <a
            href={card.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline hover:underline text-white/55"
          >
            source: {card.sourceLabel}
          </a>
        ) : (
          card.footer
        )}
      </div>
    </Mot.div>
  );

  return (
    <section id="community" className="relative py-20 md:py-32 px-5 md:px-6 lg:px-16 bg-black">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center mb-14 md:mb-20">
          <div
            className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90"
            style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}
          >
            Dari komunitas
          </div>
          <BlurText
            as="h2"
            text="Yang sudah jalan, di luar sana."
            className="mt-5 md:mt-6 text-3xl md:text-5xl lg:text-6xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-3xl"
            style={{ letterSpacing: '-0.04em' }}
            delay={70}
          />
          <p className="mt-5 md:mt-6 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
            Skill bawaan yang sudah hidup di agent kamu hari pertama. Plus apa yang lagi dikerjain agent lain di komunitas.
          </p>
        </div>

        {/* Panel A — sample skills we ship */}
        <div className="mb-12 md:mb-16">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/45 mb-4 md:mb-6">
            Skill bawaan
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {skillCards.map((c, i) => (
              <Card key={`s${i}`} card={c} isCommunity={false} />
            ))}
          </div>
        </div>

        {/* Panel B — real community quotes */}
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/45 mb-4 md:mb-6">
            Dari komunitas agent
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {communityCards.map((c, i) => (
              <Card key={`c${i}`} card={c} isCommunity={true} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Step 1.3: Verify the function compiles (no JSX syntax errors)**

Push to branch → Vercel preview → check console for "SyntaxError" / "Adjacent JSX elements".

If error: read Babel error message in browser console, fix in place.

### Task 2: Mount `<CommunitySection />` in App's render order

**Files:**
- Modify: `liren-v3.html` — App() function (~line 3680 after recent edits)

**Step 2.1:** Locate the App render block:

Run: `grep -n "<Pricing />\|<FAQ />" liren-v3.html`

**Step 2.2:** Insert `<CommunitySection />` between `<Pricing />` and `<FAQ />`:

```diff
              <Pricing />
+             <CommunitySection />
              <FAQ />
```

### Task 3: Push, verify, screenshot

**Step 3.1:** Commit + push:

```bash
git add liren-v3.html
git commit -m "[landing] Add community use case section (#community)"
git push
```

**Step 3.2:** Wait ~30s for Vercel preview rebuild.

Run: `vercel ls --scope=team_kkzsbca3s7jSJaiwFL5ZTK37 weuseai-agent | head -5`

Grab the newest Preview URL.

**Step 3.3:** Playwright sanity check:

```js
await page.goto(`${PREVIEW_URL}/#community`);
const sec = await page.$('#community');
const headline = await page.$eval('#community h2', el => el.textContent);
const cards = await page.$$('#community [role="article"]');
console.log({ found: !!sec, headline, cardCount: cards.length });
// Expect: found:true, headline:"Yang sudah jalan, di luar sana.", cardCount:7
```

**Step 3.4:** Screenshot desktop + mobile (375×667), eyeball:
- Pill, headline, subheadline render
- Both panel sub-headers ("Skill bawaan", "Dari komunitas agent") show
- 4-card grid + 3-card row on desktop; all stacked on mobile
- Avatar monograms visible, source links clickable
- No banned words sneak in via real quotes (audit panel B verbatim text)

---

## Phase 2 — Pricing redesign

Spec (verbatim from founder, 2026-05-05 chat):

- Remove from card body: hosting Rp 99k box, Always-On Rp 49k toggle, "Total bulanan" text
- New card structure: tier name + italic tagline + price (display serif, BIG) + "Untuk siapa" persona + "Yang kamu dapat" 4–5 outcomes + connected apps preview + full-width CTA + "Lihat rincian biaya →" link
- New `PriceBreakdownModal` component (Booking.com flight-ticket style)
- New `ConnectedAppsPreview` component (small text-pill row + "+N" overflow)
- Modal: aria-modal, focus trap, ESC + backdrop click closes, body scroll lock, return focus to trigger
- Don't change: prices, "PALING DIMINATI" tag, tier order, brand colors

### Task 4: Read existing Pricing block

**Step 4.1:** Snapshot the current `Pricing` + `PricingCard` to understand what's being replaced:

Run: `grep -n "function PricingCard\|function Pricing\|function LimitedSeats" liren-v3.html`

Read those line ranges fully — note the props shape, current styling, current CTA target.

### Task 5: Add `PriceBreakdownModal` component

**Files:** Modify `liren-v3.html` — insert new function declaration BEFORE `PricingCard`.

**Step 5.1:** Component contract:

```jsx
function PriceBreakdownModal({ open, onClose, tier }) {
  // Booking.com-style line-item breakdown.
  // Closed when open=false. Returns null if no tier or !open.
  // a11y:
  //   - role="dialog", aria-modal="true", aria-labelledby on header
  //   - focus trap inside modal
  //   - ESC closes
  //   - backdrop click closes
  //   - body scroll lock while open
  //   - return focus to trigger on close (caller manages)
  // ...
}
```

**Step 5.2:** Implementation (paste verbatim):

```jsx
function PriceBreakdownModal({ open, onClose, tier }) {
  const dialogRef = React.useRef(null);
  const titleId = React.useId();

  // ESC + body scroll lock
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus trap: focus the close button on open
    requestAnimationFrame(() => {
      const closeBtn = dialogRef.current?.querySelector('[data-close]');
      closeBtn?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !tier) return null;

  // Tier-specific numeric breakdown (kept inline; we only have 3 tiers)
  const setupRupiah = tier.setupIdr;        // e.g. 1_200_000
  const fmt = (n) => 'Rp ' + n.toLocaleString('id-ID');
  const yearWithout = setupRupiah + 99000 * 12;
  const yearWith    = setupRupiah + (99000 + 49000) * 12;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        animation: 'modalFadeIn 200ms ease',
      }}
    >
      <div
        ref={dialogRef}
        className="liquid-glass-strong rounded-2xl p-6 md:p-7 w-full max-w-[480px] max-h-[90vh] overflow-y-auto"
        style={{ background: '#0a0a0a', borderColor: 'rgba(229,50,45,0.35)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id={titleId} className="text-lg md:text-xl font-heading text-white" style={{ letterSpacing: '-0.02em' }}>
            {tier.name} — Rincian Biaya
          </h3>
          <button
            data-close
            onClick={onClose}
            aria-label="Tutup rincian biaya"
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none"
            style={{ border: '1px solid rgba(255,255,255,0.18)' }}
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-5 font-body text-sm text-white/85">
          {/* Setup */}
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-white/85">Biaya setup</div>
              <div className="text-xs text-white/45 mt-0.5">sekali bayar</div>
            </div>
            <div className="text-white font-medium whitespace-nowrap">{fmt(setupRupiah)}</div>
          </div>

          <div className="border-t border-white/[0.08]" />

          {/* Hosting */}
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-white/85">Hosting bulanan</div>
              <div className="text-white font-medium whitespace-nowrap">+{fmt(99000)}/bulan</div>
            </div>
            <ul className="mt-2 text-xs text-white/55 space-y-1 list-none">
              <li>· Auto-pause kalau tidak aktif 30 hari</li>
              <li>· Stop kapan saja, tanpa penalti</li>
            </ul>
          </div>

          {/* Always-On */}
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-white/85">Always-On <span className="text-white/45 text-xs">(opsional)</span></div>
              <div className="text-white font-medium whitespace-nowrap">+{fmt(49000)}/bulan</div>
            </div>
            <ul className="mt-2 text-xs text-white/55 space-y-1 list-none">
              <li>· VPS aktif 24/7, skip auto-suspend</li>
              <li>· Untuk yang pakai agent setiap hari</li>
            </ul>
          </div>

          <div className="border-t border-white/[0.08]" />

          {/* Year-1 totals */}
          <div className="space-y-1.5">
            <div className="text-xs text-white/55 uppercase tracking-wider mb-2">Estimasi tahun pertama</div>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-white/75">Tanpa Always-On</div>
              <div className="text-white whitespace-nowrap">{fmt(yearWithout)}</div>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-white/75">Dengan Always-On</div>
              <div className="text-white whitespace-nowrap">{fmt(yearWith)}</div>
            </div>
          </div>

          <p className="mt-4 text-xs italic text-white/40 leading-relaxed">
            Tidak ada biaya tersembunyi. Pause dan stop kapan saja.
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 5.3:** Add fade-in keyframe to inline `<style>` block at top of file:

```css
@keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
```

### Task 6: Add `ConnectedAppsPreview` component

**Step 6.1:** Insert before `PricingCard`:

```jsx
function ConnectedAppsPreview({ apps, totalCount }) {
  // Small horizontal text-pill row. Abstract representation only — no
  // real logos (avoids trademark concerns; matches design doc constraint).
  const visible = apps.slice(0, 5);
  const hidden = Math.max(0, totalCount - visible.length);
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      {visible.map((name) => (
        <span
          key={name}
          aria-label={`Terhubung ke ${name}`}
          className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-[0.06em] text-white/65"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {name}
        </span>
      ))}
      {hidden > 0 && (
        <span
          aria-label={`Plus ${hidden} aplikasi lain`}
          className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-mono text-white/55"
          style={{ background: 'rgba(229,50,45,0.10)', border: '1px solid rgba(229,50,45,0.25)', color: '#E5322D' }}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}
```

### Task 7: Rewrite `Pricing` tier data

**Step 7.1:** Replace the existing `tiers = [...]` array inside `Pricing()` with the new shape (per founder spec):

```jsx
function Pricing() {
  const [breakdownTier, setBreakdownTier] = React.useState(null);

  const tiers = [
    {
      name: 'Starter',
      tagline: 'Pendamping pertama kamu.',
      priceLabel: 'Rp 299rb',
      setupIdr: 299_000,
      setupAside: 'biaya setup sekali bayar',
      persona: 'Untuk kamu yang baru ingin merasakan rasanya didampingi agent — tanpa komitmen besar.',
      outcomes: [
        'Briefing pagi setiap hari, tepat jam 7 WIB',
        'Agent yang mengingat semua percakapan',
        'Akses Telegram, Discord, dan 40+ kemampuan bawaan',
        '50–100 pesan AI sudah termasuk',
      ],
      apps: ['Telegram', 'Discord', 'Web'],
      appsTotal: 41,
      cta: 'Mulai Starter',
      ctaHref: '/checkout.html?plan=starter',
      featured: false,
    },
    {
      name: 'Pro',
      tagline: 'Agent yang berpikir seperti kamu.',
      priceLabel: 'Rp 1,2jt',
      setupIdr: 1_200_000,
      setupAside: 'biaya setup sekali bayar',
      persona: 'Untuk freelancer, founder, dan content creator yang butuh agent yang tetap kerja saat kamu tidur.',
      outcomes: [
        'Fine-tune ke gaya kamu — agen menulis seperti kamu menulis',
        'Terhubung ke Notion, Gmail, Drive, kalender, dan 36 aplikasi lain',
        'Otomasi apa pun yang berulang dalam hidup kamu',
        'Tim kami bantu setup WhatsApp pribadi',
        'Prioritas respon — antrean kamu paling depan',
      ],
      apps: ['Notion', 'Gmail', 'Drive', 'Kalender', 'Slack'],
      appsTotal: 40,
      cta: 'Ambil Pro',
      ctaHref: '/checkout.html?plan=pro',
      featured: true,
    },
    {
      name: 'Studio',
      tagline: 'Komando hidup digital kamu.',
      priceLabel: 'Rp 4,9jt',
      setupIdr: 4_900_000,
      setupAside: 'biaya setup sekali bayar',
      persona: 'Untuk eksekutif, founder, dan profesional yang menjalankan hidup di banyak platform sekaligus.',
      outcomes: [
        '10 platform terhubung: kesehatan, keuangan, kalender, email, code, task',
        'Pesan unlimited 30 hari pertama',
        'Onboarding privat dengan tim kami — kami yang setup',
        'Dashboard real-time pantau semua aktivitas',
        'Memori bersama lintas device kamu',
        'Custom integration sesuai kebutuhan',
      ],
      apps: ['Apple Health', 'Stripe', 'GitHub', 'Notion', 'Linear'],
      appsTotal: 55,
      cta: 'Hubungi tim',
      ctaHref: '/checkout.html?plan=studio',
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="relative py-20 md:py-32 px-5 md:px-6 lg:px-16 bg-black">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center mb-14 md:mb-20">
          <div
            className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium font-body text-white/90"
            style={{ borderColor: 'rgba(229, 50, 45, 0.45)' }}
          >
            Harga
          </div>
          <BlurText
            as="h2"
            text="Pilih ukuran agent yang cocok dengan hidup kamu."
            className="mt-5 md:mt-6 text-3xl md:text-5xl lg:text-6xl font-heading text-white tracking-tight leading-[1.0] md:leading-[0.95] max-w-3xl"
            style={{ letterSpacing: '-0.04em' }}
            delay={70}
          />
          <p className="mt-5 md:mt-6 max-w-xl text-white/55 font-body font-light text-sm md:text-base leading-relaxed">
            Bayar setup sekali. Hosting transparan, bisa pause kapan saja.
          </p>
        </div>

        <LimitedSeats />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-stretch">
          {tiers.map((t, i) => (
            <PricingCard
              key={t.name}
              tier={t}
              index={i}
              onShowBreakdown={() => setBreakdownTier(t)}
            />
          ))}
        </div>
      </div>

      <PriceBreakdownModal
        open={!!breakdownTier}
        onClose={() => setBreakdownTier(null)}
        tier={breakdownTier}
      />
    </section>
  );
}
```

### Task 8: Rewrite `PricingCard`

**Step 8.1:** Replace `PricingCard` body with the new structure (no inline hosting/always-on; new outcomes + apps preview + breakdown link):

```jsx
function PricingCard({ tier, index, onShowBreakdown }) {
  const isFeatured = !!tier.featured;
  return (
    <Mot.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.05 * index }}
      className="liquid-glass rounded-2xl p-6 md:p-7 flex flex-col relative"
      style={
        isFeatured
          ? {
              borderColor: 'rgba(229, 50, 45, 0.65)',
              boxShadow: '0 0 0 1px rgba(229,50,45,0.45), 0 18px 60px -25px rgba(229,50,45,0.55), 0 0 80px -30px rgba(229,50,45,0.35)',
            }
          : undefined
      }
    >
      {isFeatured && (
        <div
          className="absolute top-0 right-5 -translate-y-1/2 px-2.5 py-0.5 rounded-full text-[9.5px] font-mono uppercase tracking-[0.18em] text-white"
          style={{ background: '#E5322D' }}
        >
          Paling diminati
        </div>
      )}

      {/* 1. Tier name + tagline */}
      <div>
        <h3 className="text-lg md:text-xl font-heading text-white" style={{ letterSpacing: '-0.02em' }}>
          {tier.name}
        </h3>
        <p className="mt-1 text-sm italic text-white/65 font-body font-light leading-snug">
          {tier.tagline}
        </p>
      </div>

      {/* 2. Price */}
      <div className="mt-5">
        <div className="serif text-4xl md:text-5xl text-white" style={{ letterSpacing: '-0.02em', lineHeight: 1 }}>
          {tier.priceLabel}
        </div>
        <div className="mt-1.5 text-xs text-white/50 font-body font-light">
          {tier.setupAside}
        </div>
      </div>

      {/* 3. Untuk siapa */}
      <div className="mt-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45 mb-2">
          Untuk siapa
        </div>
        <p className="text-sm text-white/75 font-body font-light leading-relaxed">
          {tier.persona}
        </p>
      </div>

      {/* 4. Yang kamu dapat (outcomes) */}
      <div className="mt-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45 mb-2">
          Yang kamu dapat
        </div>
        <ul className="space-y-2.5 list-none">
          {tier.outcomes.map((o, oi) => (
            <li key={oi} className="flex items-start gap-2.5 text-sm font-body font-light leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-[7px] block w-1 h-1 flex-shrink-0 rounded-full"
                style={{ background: isFeatured ? '#E5322D' : 'rgba(255,255,255,0.4)' }}
              />
              <span className="text-white/85">{o}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 5. Connected apps preview */}
      <div className="mt-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45 mb-2">
          Terhubung ke
        </div>
        <ConnectedAppsPreview apps={tier.apps} totalCount={tier.appsTotal} />
      </div>

      <div className="flex-1" />

      {/* 6. CTA + 7. breakdown link */}
      <a
        href={tier.ctaHref}
        className="mt-7 md:mt-8 rounded-full px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 no-underline"
        style={
          isFeatured
            ? { background: '#E5322D', color: '#fff', border: '1px solid #E5322D' }
            : { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.28)' }
        }
      >
        {tier.cta} <ArrowUpRight size={14} stroke={2.2} />
      </a>

      <button
        type="button"
        onClick={onShowBreakdown}
        aria-haspopup="dialog"
        className="mt-3 text-xs font-body text-white/55 hover:text-white/85 underline-offset-4 hover:underline self-center bg-transparent border-0 cursor-pointer"
      >
        Lihat rincian biaya →
      </button>
    </Mot.div>
  );
}
```

### Task 9: Push, verify, screenshot

**Step 9.1:** Commit + push:

```bash
git add liren-v3.html
git commit -m "[landing] Pricing redesign: outcome-led cards + Booking-style breakdown modal"
git push
```

**Step 9.2:** Wait ~30s, grab newest preview URL from `vercel ls`.

**Step 9.3:** Playwright modal interaction test:

```js
await page.goto(`${PREVIEW_URL}/#pricing`);
// Click "Lihat rincian biaya →" on Pro card
const proButton = await page.locator('text="Lihat rincian biaya"').nth(1);
await proButton.click();
const dialog = await page.$('[role="dialog"]');
console.log('modal opens:', !!dialog);
// ESC closes
await page.keyboard.press('Escape');
const dialogAfter = await page.$('[role="dialog"]');
console.log('ESC closes:', !dialogAfter);
// Backdrop click closes
await proButton.click();
await page.locator('[role="dialog"]').click({ position: { x: 5, y: 5 } });
// (clicks the outermost div which is the backdrop)
```

**Step 9.4:** Screenshot all 3 cards at desktop (1440×900) + mobile (375×812). Eyeball:
- No more "Hosting Rp 99k" inline box on cards
- Tagline italic, persona paragraph, 4–5 outcomes with bullets, app pills + "+N" overflow
- Pro card has red border + "Paling diminati" tag
- "Lihat rincian biaya →" link below CTA
- Modal opens centered, dark backdrop, blurred background
- Close (×, ESC, backdrop) all work
- Body scroll locks while open
- Focus returns to the trigger button on close (manual eyeball — Tab should land on Lihat rincian biaya, not on body)

---

## Phase 3 — Final review

### Task 10: Audit voice + brand on full diff

**Step 10.1:** Run grep against banned words on the new sections:

```bash
sed -n '<community-start>,<community-end>p; <pricing-start>,<pricing-end>p' liren-v3.html | \
  python3 -c "
import sys, re
s = sys.stdin.read()
banned = ['basically','just','literally','honestly','kind of','pretty much','revolutionary','disrupt','10x','game-changer','next-level','Anda']
hits = [(w, len(re.findall(rf'\\b{re.escape(w)}\\b', s, re.I))) for w in banned]
hits = [h for h in hits if h[1] > 0]
print('Banned hits:', hits or 'NONE')
ex_in_copy = sum(1 for line in s.split('\\n') if '!' in line and 'function' not in line and '!!' not in line)
print('Likely customer-copy ! marks:', ex_in_copy)
"
```

Expected: zero banned hits. The `!` marks should all be `!!` boolean coercions or framer-motion props (not customer copy).

### Task 11: Send preview URL + screenshots to founder

**Step 11.1:** Get final preview URL from `vercel ls`.

**Step 11.2:** Take final screenshots:
- `community-section-desktop.png`
- `community-section-mobile.png`
- `pricing-redesign-desktop.png`
- `pricing-modal-desktop.png` (with breakdown open)
- `pricing-redesign-mobile.png`

**Step 11.3:** Send a single review message containing:
- Preview URL
- All 5 screenshots
- Voice audit summary (zero banned words confirmed)
- Confirmation that breakdown modal works end-to-end (open via button, close via ESC + backdrop + ×)

---

## Out of scope for this plan (deferred)

- Implementing the actual `lowongan-scout`, `content-drafter`, `outreach-postcard` skills cited in the community section (they're tagged `roadmap` honestly in the footer; real implementation is a Phase 2B+ job)
- Replacing `Stats` and `Testimonials` sections (still placeholder; populate when first 5 paying customers exist)
- Changing prices or tier ordering (founder explicitly excluded)
- Real-logo SVGs for `ConnectedAppsPreview` (using text pills for now to avoid trademark issues)

---

Plan complete and saved to `docs/plans/2026-05-05-landing-overhaul.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
