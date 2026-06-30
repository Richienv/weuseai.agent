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
})();
