/* Shared admin React components — loaded via /admin/assets/admin-shared.js
 * after React/ReactDOM/Babel are loaded. Each admin page mounts its own
 * <App/> and may use these helpers.
 *
 * Globals exposed on window.WeUseAdmin:
 *   - Sidebar({ activeHref })   — left-nav with 5 tabs + logout
 *   - useFetch(url)             — { data, err, loading } hook
 *   - statusDot(status)         — JSX status indicator span
 *   - formatDate(iso)           — Indonesian-formatted timestamp
 *   - formatIdr(n)              — "Rp 1.234.000"
 *   - PERSONA_OPTIONS           — 10-persona list for manual-provision form
 */

(function () {
  'use strict';

  const NAV = [
    { href: '/admin/manual-provision', label: 'Manual Provision' },
    { href: '/admin/customers',        label: 'Customer List' },
    { href: '/admin/fleet',            label: 'Fleet Summary' },
    { href: '/admin/cost',             label: 'Cost Monitoring' },
    { href: '/admin/templates',        label: 'Template no-match' },
  ];

  const PERSONA_OPTIONS = [
    { slug: 'the-pro',           name: 'The Pro',           tier: 'starter' },
    { slug: 'doc-expert',        name: 'Doc Expert',        tier: 'starter' },
    { slug: 'slide-master',      name: 'Slide Master',      tier: 'starter' },
    { slug: 'deep-researcher',   name: 'Deep Researcher',   tier: 'pro'     },
    { slug: 'trade-pro',         name: 'Trade Pro',         tier: 'pro'     },
    { slug: 'project-conductor', name: 'Project Conductor', tier: 'pro'     },
    { slug: 'video-producer',    name: 'Video Producer',    tier: 'pro'     },
    { slug: 'social-conductor',  name: 'Social Conductor',  tier: 'pro'     },
    { slug: 'web-app-builder',   name: 'Web Creator',       tier: 'studio'  },
    { slug: 'business-agent',    name: 'Business Director', tier: 'studio'  },
  ];

  // Tier catalog mirrors supabase/functions/_shared/tier-personas.ts +
  // api/_shared/tier-catalog.ts (Phase A restructure 2026-05-28). Locked
  // composition per tier — operator cannot change the persona set, only
  // the tier. The bundle-fetch security gate enforces the same set
  // server-side. Drift gate: tests/admin-tier-catalog-drift.spec.ts.
  //
  // `enterprise` is contact-only — no fixed personas, no fixed fee — and
  // is NOT provisionable via the manual-provision form (the form disables
  // submit + shows a sales-flow notice; the API rejects it too).
  // `features` (voice / web_app / custom_build) are Phase B/C FLAGS only;
  // middleware ships later within these same tier slugs.
  const TIER_CATALOG = {
    'bare': {
      label: 'Bare Agent',
      setup_fee_idr: 99000,
      monthly_fee_idr: 99000,
      personas: [],
      features: { voice: false, web_app: false, custom_build: false },
      contact_required: false,
    },
    'solo': {
      label: 'Solo Starter',
      setup_fee_idr: 399000,
      monthly_fee_idr: 99000,
      personas: ['the-pro', 'doc-expert', 'slide-master'],
      features: { voice: false, web_app: false, custom_build: false },
      contact_required: false,
    },
    'voice-starter': {
      label: 'Voice Starter',
      setup_fee_idr: 599000,
      monthly_fee_idr: 99000,
      personas: ['the-pro', 'doc-expert', 'slide-master'],
      features: { voice: true, web_app: false, custom_build: false },
      contact_required: false,
    },
    'library-full': {
      label: 'Library Lengkap',
      setup_fee_idr: 799000,
      monthly_fee_idr: 99000,
      personas: [
        'the-pro', 'doc-expert', 'slide-master',
        'deep-researcher', 'trade-pro', 'project-conductor',
        'video-producer', 'social-conductor',
        'web-app-builder', 'business-agent',
      ],
      features: { voice: true, web_app: false, custom_build: false },
      contact_required: false,
    },
    'done-for-you': {
      label: 'Siap Pakai',
      setup_fee_idr: 1299000,
      monthly_fee_idr: 99000,
      personas: [
        'the-pro', 'doc-expert', 'slide-master',
        'deep-researcher', 'trade-pro', 'project-conductor',
        'video-producer', 'social-conductor',
      ],
      features: { voice: true, web_app: true, custom_build: false },
      contact_required: false,
    },
    enterprise: {
      label: 'Enterprise',
      setup_fee_idr: null,
      monthly_fee_idr: null,
      personas: null,
      features: { voice: true, web_app: true, custom_build: true },
      contact_required: true,
    },
  };

  function Sidebar(props) {
    const activeHref = props.activeHref || '';
    async function onLogout(e) {
      e.preventDefault();
      try {
        await fetch('/api/admin/session', { method: 'DELETE', credentials: 'same-origin' });
      } catch (err) { /* swallow */ }
      window.location.href = '/admin/login';
    }
    return React.createElement('aside', { className: 'sidebar' },
      React.createElement('div', { className: 'sidebar-brand' },
        'weuseai',
        React.createElement('span', { className: 'dot' }, '.'),
        'agent',
        React.createElement('div', { className: 'sidebar-brand-sub' }, 'admin'),
      ),
      React.createElement('nav', { className: 'sidebar-nav' },
        NAV.map(function (item) {
          const isActive = activeHref === item.href || activeHref.indexOf(item.href + '/') === 0;
          return React.createElement('a', {
            key: item.href,
            href: item.href,
            className: 'sidebar-link' + (isActive ? ' is-active' : ''),
          }, item.label);
        }),
      ),
      React.createElement('div', { className: 'sidebar-foot' },
        React.createElement('a', {
          href: '/admin/login',
          onClick: onLogout,
          className: 'sidebar-link sidebar-link-muted',
        }, 'Keluar'),
      ),
    );
  }

  function useFetch(url) {
    const { useState, useEffect } = React;
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(function () {
      let cancelled = false;
      setLoading(true);
      fetch(url, { credentials: 'same-origin' })
        .then(function (r) {
          if (r.status === 401) {
            window.location.href = '/admin/login';
            return null;
          }
          return r.json().then(function (j) { return { status: r.status, body: j }; });
        })
        .then(function (res) {
          if (cancelled || !res) return;
          if (res.status >= 200 && res.status < 300) {
            setData(res.body);
            setErr(null);
          } else {
            setErr((res.body && (res.body.error || res.body.detail)) || ('http_' + res.status));
          }
        })
        .catch(function (e) { if (!cancelled) setErr(e && e.message ? e.message : String(e)); })
        .finally(function () { if (!cancelled) setLoading(false); });
      return function () { cancelled = true; };
    }, [url]);
    return { data: data, err: err, loading: loading };
  }

  function statusDot(s) {
    const cls = 'status-dot s-' + (s || 'pending');
    return React.createElement('span', { className: cls });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return String(iso); }
  }

  function formatIdr(n) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);
  }

  function statusLabel(s) {
    if (!s) return '—';
    if (s === 'active') return 'Aktif';
    if (s === 'pending') return 'Pending';
    if (s === 'paused') return 'Paused';
    if (s === 'canceled') return 'Canceled';
    if (s === 'failed') return 'Error';
    if (s === 'refunded') return 'Refunded';
    return s;
  }

  window.WeUseAdmin = {
    Sidebar: Sidebar,
    useFetch: useFetch,
    statusDot: statusDot,
    statusLabel: statusLabel,
    formatDate: formatDate,
    formatIdr: formatIdr,
    PERSONA_OPTIONS: PERSONA_OPTIONS,
    TIER_CATALOG: TIER_CATALOG,
    NAV: NAV,
  };
})();
