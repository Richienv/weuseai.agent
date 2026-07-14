/* Konten redesign landing — system wiring (event-delegation).
   The design (konten.html) renders via the DC runtime and re-renders on state
   changes, which wipes per-node listeners. So we delegate from document (capture
   phase) — one listener that survives every re-render. CRITICAL: pricing CTAs use
   the CANONICAL catalog slugs (solo / voice-starter / library-full / done-for-you);
   the displayed tier NAMES (Starter/Pro/Premium/Ultimate) are marketing labels. */
(function () {
  'use strict';
  var WA = 'https://wa.me/6281113098585'; // design's contact number

  function norm(el) { return (el.textContent || '').replace(/\s+/g, ' ').replace(/↗|\+$/g, '').trim(); }
  function secWith(txt) { var s = document.querySelectorAll('section'); for (var i = 0; i < s.length; i++) if (s[i].textContent.indexOf(txt) >= 0) return s[i]; return null; }
  function ext(href) { window.open(href, '_blank', 'noopener'); }
  function go(href) { window.location.href = href; }
  function toSec(sec) { if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function pricing() { return secWith('Mulai Starter') || secWith('Ambil Premium'); }
  function steps() { return secWith('Empat langkah') || secWith('Cara kerja'); }
  function faq() { return secWith('Punya Pertanyaan') || secWith('Apa bedanya'); }

  // Exact button text -> action.
  var EXACT = {
    'Mulai Starter': function () { go('checkout.html?plan=solo'); },
    'Naik ke Pro': function () { go('checkout.html?plan=voice-starter'); },
    'Ambil Premium': function () { go('checkout.html?plan=library-full'); },
    'Ambil Ultimate': function () { go('checkout.html?plan=done-for-you'); },
    'Hubungi Sales': function () { go('mailto:sales@weuseai.id?subject=Enterprise%20weuseai.agent'); },
    'Konsultasi gratis (15 menit)': function () { ext('https://cal.com/weuseai.agent/15min'); },
    'Lihat cara orang pakai': function () { go('use-cases.html'); },
    'Mulai': function () { toSec(pricing()); },
    'Aktifkan asisten kamu': function () { toSec(pricing()); },
    'Harga': function () { toSec(pricing()); },
    'Kerja': function () { toSec(steps()); },
    'Cara Kerja': function () { toSec(steps()); },
    'FAQ': function () { toSec(faq()); },
    'Beranda': function () { window.scrollTo({ top: 0, behavior: 'smooth' }); },
    'WhatsApp': function () { ext(WA); },
    'Punya Pertanyaan?': function () { ext(WA); },
    'Gabung Discord': function () { ext(WA); }, // until a real Discord URL is supplied
    'halo@weuseai.id': function () { go('mailto:halo@weuseai.id'); },
    'sales@weuseai.id': function () { go('mailto:sales@weuseai.id'); },
    'Privacy Policy': function () { go('privacy.html'); },
    'Terms of Service': function () { go('terms.html'); }
  };
  // Unverified socials ship href="#" — neutralise jump-to-top until real URLs exist.
  var DEAD = { 'Instagram': 1, 'Discord': 1, 'LinkedIn': 1, 'TikTok': 1 };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('button, a') : null;
    if (!el) return;
    var t = norm(el);
    if (EXACT[t]) { e.preventDefault(); e.stopPropagation(); EXACT[t](); return; }
    if (t.indexOf('+62 811') === 0) { e.preventDefault(); e.stopPropagation(); ext(WA); return; }
    if (DEAD[t] && el.getAttribute && el.getAttribute('href') === '#') { e.preventDefault(); }
    // FAQ accordion buttons (question text) are left to the runtime.
  }, true);

  // ── Launch-batch counter — REAL numbers only ────────────────────────────
  // Honesty lock: this band shows the live paid-customer count from
  // /api/public/subscription-count, or it shows NOTHING. It never invents a
  // number and never renders a clock — the price rise is tied to the batch
  // count (1.000), which create-invoice actually enforces (library-full setup
  // flips 799rb → 999rb at paid >= 1000), so the claim on the page is true.
  //
  // The band ships `hidden`. It only un-hides once a real count is in hand.
  // A failed/blocked fetch leaves it hidden forever — the page just omits it.
  var BATCH_LIMIT = 1000;
  // Below this, the band stays hidden. Showing a truthful "2 / 1.000" would
  // advertise that nobody has bought yet — so we say nothing instead. Omitting a
  // counter is honest; inventing one is not. Raise/lower freely; the ONLY rule is
  // that whatever renders must be the real number from the endpoint.
  var MIN_DISPLAY = 25;
  var batchCount = null; // null until a real number arrives

  function paintBatch() {
    var band = document.querySelector('[data-batch]');
    if (!band) return; // the runtime may not have rendered this section yet
    // No real number yet (still loading, or the fetch failed) → the band must be
    // INVISIBLE. Enforce it in JS: the runtime re-renders the template and drops
    // the `hidden` attribute, which would otherwise leave an empty "— / 1.000"
    // scarcity band on screen. Hide via style too, since `hidden` alone loses to
    // the element's own display rule.
    if (batchCount === null || batchCount < MIN_DISPLAY) {
      band.hidden = true;
      band.style.display = 'none';
      return;
    }
    var countEl = band.querySelector('[data-batch-count]');
    var leftEl = band.querySelector('[data-batch-left]');
    var barEl = band.querySelector('[data-batch-bar]');
    var left = Math.max(0, BATCH_LIMIT - batchCount);
    var pct = Math.max(0, Math.min(100, (batchCount / BATCH_LIMIT) * 100));
    if (countEl) countEl.textContent = batchCount.toLocaleString('id-ID');
    if (leftEl) leftEl.textContent = left.toLocaleString('id-ID') + ' slot';
    if (barEl) barEl.style.width = pct + '%';
    band.hidden = false;
    band.style.display = '';
  }

  fetch('/api/public/subscription-count', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var n = j && j.paid_customers;
      if (typeof n !== 'number' || !isFinite(n) || n < 0) return; // stay hidden
      batchCount = Math.floor(n);
      paintBatch();
    })
    .catch(function () { /* stay hidden — never fabricate */ });

  // The DC runtime replaces template DOM on re-render, so re-apply onto whichever
  // node is current. Cheap, and a no-op until a real count exists.
  setInterval(paintBatch, 500);
})();
