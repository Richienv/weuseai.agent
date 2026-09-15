/* Karakter panel — verified real-person identities on BytePlus ModelArk.
 *
 * Vanilla JS, no build step. Mounts into the first element with
 * [data-karakter-panel] and talks only to /api/admin/customer-action with the
 * ai_video_identity_* actions (cookie-gated, proxied to the ai-video-identity
 * Edge Function with owner_kind founder).
 *
 * Flow: Tambah karakter -> start -> show the verification link (open on the
 * person's phone; the callback page confirms by itself) -> poll status ->
 * upload full_body / close_up / voice (upload_sign -> PUT -> register) ->
 * poll status until each asset is active -> Hapus revokes the group.
 */
(function () {
  'use strict';

  var ACTION_URL = '/api/admin/customer-action';
  var POLL_MS = 10000;
  var ASSET_LIMIT = 50;
  var ASSET_ALERT_AT = 40;
  var LINK_STORE_KEY = 'karakter_h5_links';

  var SLOTS = [
    { id: 'full_body', label: 'Foto seluruh badan', hint: 'Satu orang, menghadap kamera, 300 sampai 6000 px.', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif', assetType: 'Image', maxBytes: 30 * 1024 * 1024 },
    { id: 'close_up', label: 'Foto close-up', hint: 'Wajah netral, tanpa kacamata hitam, satu orang saja.', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif', assetType: 'Image', maxBytes: 30 * 1024 * 1024 },
    { id: 'voice', label: 'Suara', hint: 'MP3 atau WAV, di bawah 15 MB, suara sendiri.', accept: 'audio/mpeg,audio/wav,audio/x-wav', assetType: 'Audio', maxBytes: 15 * 1024 * 1024 },
  ];

  var STATUS_LABEL = {
    pending: 'Menunggu verifikasi',
    verified: 'Terverifikasi',
    failed: 'Verifikasi gagal',
    expired: 'Tautan kedaluwarsa',
  };
  var ASSET_LABEL = { processing: 'Diproses', active: 'Aktif', failed: 'Gagal' };
  var REASON_LABEL = {
    face_mismatch: 'Wajah tidak cocok dengan hasil verifikasi.',
    multiple_faces: 'Terdeteksi lebih dari satu wajah.',
    asset_failed: 'Aset ditolak BytePlus.',
  };
  var ERROR_LABEL = {
    identity_asset_cap: 'Batas aset untuk karakter ini sudah tercapai.',
    ark_rate_limited: 'Terlalu cepat. Tunggu satu menit, lalu coba lagi.',
    ark_quota_exceeded: 'Kuota aset BytePlus penuh. Hapus karakter yang tidak dipakai dulu.',
    ark_unconfigured: 'Kredensial BytePlus belum diatur di Supabase.',
    ark_unauthorized: 'BytePlus menolak kredensial. Cek AK/SK dan hak ArkFullAccess.',
    ark_unavailable: 'BytePlus tidak merespons. Coba lagi sebentar.',
    encryption_unconfigured: 'INTEGRATION_ENCRYPTION_KEY belum diatur di Supabase.',
    slot_occupied: 'Slot ini sudah terisi. Hapus karakter untuk mengganti aset aktif.',
    identity_not_verified: 'Karakter belum terverifikasi.',
    identity_not_restartable: 'Verifikasi masih berjalan. Tunggu sampai tautan kedaluwarsa.',
    file_too_large: 'File terlalu besar.',
    invalid_content_type: 'Format file tidak didukung.',
    upload_not_found: 'Unggahan tidak ditemukan. Coba unggah ulang.',
    upload_failed: 'Unggahan gagal. Cek koneksi lalu coba lagi.',
    image_too_small: 'Sisi terpendek foto minimal 300 px.',
    image_too_large: 'Sisi terpanjang foto maksimal 6000 px.',
    image_aspect: 'Rasio foto harus antara 0,4 dan 2,5.',
    misconfigured: 'SUPABASE_FUNCTIONS_URL belum diatur di Vercel.',
    identity_unavailable: 'Fungsi identity tidak terjangkau.',
    invalid_display_name: 'Nama karakter 1 sampai 80 karakter.',
    liveness_billing_blocked: 'Verifikasi ditutup. Flag AI_VIDEO_IDENTITY_LIVENESS_BILLING aktif karena BytePlus menagih liveness.',
  };

  var state = {
    identities: [],
    quota: null,
    loading: true,
    error: '',
    notice: '',
    busy: {},
    links: readLinks(),
    newName: '',
  };
  var root = null;
  var pollTimer = 0;

  // ─── API ─────────────────────────────────────────────────────────────

  function post(action, body) {
    return fetch(ACTION_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, body || {})),
    }).then(function (response) {
      if (response.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('unauthorized');
      }
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || payload.ok === false) throw new Error(payload.error || ('http_' + response.status));
        return payload;
      });
    });
  }

  function describe(error) {
    var code = error && error.message ? error.message : String(error || 'gagal');
    return ERROR_LABEL[code] || ('Gagal: ' + code);
  }

  // ─── state helpers ───────────────────────────────────────────────────

  function readLinks() {
    try {
      var raw = window.sessionStorage.getItem(LINK_STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function saveLinks() {
    try { window.sessionStorage.setItem(LINK_STORE_KEY, JSON.stringify(state.links)); } catch (e) { /* ignore */ }
  }

  function rememberLink(identityId, link, expiresAt) {
    state.links[identityId] = { link: link, expires_at: expiresAt };
    saveLinks();
  }

  function forgetLink(identityId) {
    delete state.links[identityId];
    saveLinks();
  }

  function linkFor(identity) {
    var entry = state.links[identity.id];
    if (!entry) return null;
    if (identity.verification_status !== 'pending') { forgetLink(identity.id); return null; }
    if (entry.expires_at && Date.parse(entry.expires_at) < Date.now()) { forgetLink(identity.id); return null; }
    return entry;
  }

  function setBusy(key, on) {
    if (on) state.busy[key] = true; else delete state.busy[key];
    render();
  }

  function isBusy(key) { return Boolean(state.busy[key]); }

  function upsertIdentity(identity) {
    if (!identity || !identity.id) return;
    var index = -1;
    for (var i = 0; i < state.identities.length; i++) if (state.identities[i].id === identity.id) index = i;
    if (identity.revoked_at) {
      if (index >= 0) state.identities.splice(index, 1);
      return;
    }
    if (index >= 0) state.identities[index] = identity; else state.identities.unshift(identity);
  }

  function sessionOpen(identity) {
    return identity.verification_status === 'pending'
      && identity.session_expires_at
      && Date.parse(identity.session_expires_at) > Date.now();
  }

  function restartable(identity) {
    return identity.verification_status === 'failed'
      || identity.verification_status === 'expired'
      || (identity.verification_status === 'pending' && !sessionOpen(identity));
  }

  function inFlight(identity) {
    if (sessionOpen(identity)) return true;
    return (identity.assets || []).some(function (asset) { return asset.status === 'processing'; });
  }

  function assetFor(identity, slotId) {
    var assets = identity.assets || [];
    for (var i = assets.length - 1; i >= 0; i--) if (assets[i].slot === slotId) return assets[i];
    return null;
  }

  // ─── actions ─────────────────────────────────────────────────────────

  function load(silent) {
    if (!silent) { state.loading = true; render(); }
    return post('ai_video_identity_list', {}).then(function (payload) {
      state.identities = Array.isArray(payload.identities) ? payload.identities : [];
      state.quota = payload.quota || null;
      state.error = '';
    }).catch(function (error) {
      if (error.message !== 'unauthorized') state.error = describe(error);
    }).then(function () {
      state.loading = false;
      render();
      schedulePoll();
    });
  }

  function schedulePoll() {
    window.clearTimeout(pollTimer);
    var pending = state.identities.filter(inFlight);
    if (pending.length === 0) return;
    pollTimer = window.setTimeout(function () {
      Promise.all(pending.map(function (identity) {
        return post('ai_video_identity_status', { identity_id: identity.id })
          .then(function (payload) { upsertIdentity(payload.identity); })
          .catch(function () { /* keep the last known state */ });
      })).then(function () {
        return post('ai_video_identity_quota', {}).then(function (payload) {
          if (payload.quota) state.quota = payload.quota;
        }).catch(function () { /* quota is cosmetic */ });
      }).then(function () {
        render();
        schedulePoll();
      });
    }, POLL_MS);
  }

  function addCharacter(event) {
    event.preventDefault();
    var name = state.newName.replace(/\s+/g, ' ').trim();
    if (!name) { state.error = ERROR_LABEL.invalid_display_name; render(); return; }
    setBusy('new', true);
    post('ai_video_identity_start', { display_name: name, consent_version: 'v1' }).then(function (payload) {
      rememberLink(payload.identity_id, payload.h5_link, payload.expires_at);
      state.newName = '';
      state.error = '';
      state.notice = 'Karakter ' + name + ' dibuat. Buka tautan verifikasi di ponsel ' + name + '.';
      return load(true);
    }).catch(function (error) {
      state.error = describe(error);
    }).then(function () { setBusy('new', false); });
  }

  function restart(identity) {
    setBusy(identity.id, true);
    post('ai_video_identity_restart', { identity_id: identity.id }).then(function (payload) {
      rememberLink(identity.id, payload.h5_link, payload.expires_at);
      state.error = '';
      state.notice = 'Tautan verifikasi baru untuk ' + identity.display_name + ' siap.';
      return load(true);
    }).catch(function (error) {
      state.error = describe(error);
    }).then(function () { setBusy(identity.id, false); });
  }

  function revoke(identity) {
    var ok = window.confirm('Hapus karakter ' + identity.display_name + '? Grup dan semua asetnya dihapus dari BytePlus. Tidak bisa dibatalkan.');
    if (!ok) return;
    setBusy(identity.id, true);
    post('ai_video_identity_revoke', { identity_id: identity.id }).then(function () {
      forgetLink(identity.id);
      state.error = '';
      state.notice = 'Karakter ' + identity.display_name + ' dihapus.';
      return load(true);
    }).catch(function (error) {
      state.error = describe(error);
    }).then(function () { setBusy(identity.id, false); });
  }

  function refresh(identity) {
    setBusy(identity.id, true);
    post('ai_video_identity_status', { identity_id: identity.id }).then(function (payload) {
      upsertIdentity(payload.identity);
      state.error = '';
    }).catch(function (error) {
      state.error = describe(error);
    }).then(function () { setBusy(identity.id, false); schedulePoll(); });
  }

  function upload(identity, slot, file) {
    if (!file) return;
    var key = identity.id + ':' + slot.id;
    var type = (file.type || '').toLowerCase();
    if (slot.accept.split(',').indexOf(type) < 0) { state.error = ERROR_LABEL.invalid_content_type; render(); return; }
    if (file.size > slot.maxBytes) { state.error = ERROR_LABEL.file_too_large; render(); return; }
    setBusy(key, true);
    checkImage(file, slot).then(function () {
      return post('ai_video_identity_upload_sign', { identity_id: identity.id, slot: slot.id, content_type: type, bytes: file.size });
    }).then(function (signed) {
      return putFile(signed.upload_url, signed.headers || {}, file).then(function () { return signed.path; });
    }).then(function (path) {
      return post('ai_video_identity_register', { identity_id: identity.id, path: path, asset_type: slot.assetType, slot: slot.id });
    }).then(function () {
      state.error = '';
      state.notice = slot.label + ' untuk ' + identity.display_name + ' terdaftar. BytePlus memprosesnya, biasanya 1 sampai 10 menit.';
      return post('ai_video_identity_status', { identity_id: identity.id }).then(function (payload) { upsertIdentity(payload.identity); });
    }).catch(function (error) {
      state.error = describe(error);
    }).then(function () { setBusy(key, false); schedulePoll(); });
  }

  function putFile(url, headers, file) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.timeout = 120000;
      Object.keys(headers).forEach(function (name) { xhr.setRequestHeader(name, headers[name]); });
      xhr.onload = function () { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('upload_failed')); };
      xhr.onerror = function () { reject(new Error('upload_failed')); };
      xhr.ontimeout = function () { reject(new Error('upload_failed')); };
      xhr.send(file);
    });
  }

  // BytePlus photo rules: 300 to 6000 px on each side, aspect 0.4 to 2.5.
  // HEIC does not decode in most desktop browsers; skip the check there.
  function checkImage(file, slot) {
    if (slot.assetType !== 'Image' || /heic|heif/.test(file.type)) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        var w = image.naturalWidth, h = image.naturalHeight;
        if (Math.min(w, h) < 300) return reject(new Error('image_too_small'));
        if (Math.max(w, h) > 6000) return reject(new Error('image_too_large'));
        var aspect = w / h;
        if (aspect < 0.4 || aspect > 2.5) return reject(new Error('image_aspect'));
        resolve();
      };
      image.onerror = function () { URL.revokeObjectURL(url); resolve(); };
      image.src = url;
    });
  }

  function copyText(text, button) {
    var done = function () {
      var label = button.textContent;
      button.textContent = 'Tersalin';
      window.setTimeout(function () { button.textContent = label; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { state.error = 'Clipboard tidak tersedia. Salin manual dari kotak tautan.'; render(); });
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { state.error = 'Clipboard tidak tersedia. Salin manual dari kotak tautan.'; render(); }
    document.body.removeChild(area);
  }

  // ─── render ──────────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(iso)) + ' WIB';
    } catch (e) { return String(iso); }
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
    } catch (e) { return String(iso); }
  }

  function renderQuota() {
    var quota = state.quota || {};
    var used = Number(quota.active_assets) || 0;
    var limit = Number(quota.asset_limit) || ASSET_LIMIT;
    var groups = Number(quota.groups) || 0;
    var groupLimit = Number(quota.group_limit) || ASSET_LIMIT;
    var warn = used >= ASSET_ALERT_AT || groups >= ASSET_ALERT_AT || quota.alert === true;
    var percent = Math.min(100, Math.round((used / limit) * 100));
    return el('div', { className: 'card karakter-quota' + (warn ? ' is-warn' : '') }, [
      el('div', { className: 'bar-row' }, [
        el('span', { text: 'Aset BytePlus' }),
        el('div', { className: 'bar-track' }, [el('div', { className: 'bar-fill' + (warn ? ' warn' : ''), style: { width: percent + '%' } })]),
        el('span', { className: 'num', text: used + ' / ' + limit }),
      ]),
      el('p', { className: 'muted karakter-quota-note', text: warn
        ? 'Mendekati batas paket Entry (' + limit + ' aset, ' + groupLimit + ' grup). Hapus karakter yang tidak dipakai sebelum menambah. Grup terpakai: ' + groups + '.'
        : 'Paket Entry BytePlus: ' + limit + ' aset dan ' + groupLimit + ' grup untuk seluruh akun. Grup terpakai: ' + groups + '. Pelanggan maksimal 2 aset per karakter, founder 6.' }),
    ]);
  }

  function renderNewForm() {
    var input = el('input', {
      type: 'text', maxlength: '80', placeholder: 'Nama karakter, misalnya Richie', value: state.newName, required: true,
      oninput: function (event) { state.newName = event.target.value; },
    });
    return el('form', { className: 'card karakter-new', onsubmit: addCharacter }, [
      el('label', { className: 'field' }, [el('span', { text: 'Karakter baru' }), input,
        el('span', { className: 'hint', text: 'Setelah ditambah, buka tautan verifikasi di ponsel orang yang bersangkutan. BytePlus (ByteDance) memproses wajahnya, sekitar satu menit.' })]),
      el('div', { className: 'toolbar' }, [
        el('button', { type: 'submit', className: 'btn', disabled: isBusy('new') }, [isBusy('new') ? 'Membuat...' : 'Tambah karakter']),
      ]),
    ]);
  }

  function renderLinkBlock(identity) {
    var entry = linkFor(identity);
    if (!entry) {
      if (sessionOpen(identity)) {
        return el('p', { className: 'muted', text: 'Tautan verifikasi masih berlaku sampai ' + formatTime(identity.session_expires_at) + ' tetapi tidak tersimpan di browser ini. Tunggu kedaluwarsa, lalu mulai ulang.' });
      }
      return null;
    }
    var code = el('code', { className: 'karakter-link', text: entry.link });
    var copyButton = el('button', { type: 'button', className: 'action-btn primary' }, ['Salin tautan']);
    copyButton.addEventListener('click', function () { copyText(entry.link, copyButton); });
    return el('div', { className: 'karakter-session' }, [
      el('p', { text: 'Buka tautan ini di ponsel ' + identity.display_name + '. Berlaku sampai ' + formatTime(entry.expires_at) + '. Setelah selesai, status di sini berubah sendiri.' }),
      code,
      el('div', { className: 'toolbar' }, [
        copyButton,
        el('a', { className: 'action-btn', href: entry.link, target: '_blank', rel: 'noopener noreferrer', text: 'Buka di perangkat ini' }),
      ]),
    ]);
  }

  function renderSlot(identity, slot) {
    var asset = assetFor(identity, slot.id);
    var key = identity.id + ':' + slot.id;
    var busy = isBusy(key);
    var children = [
      el('div', { className: 'karakter-slot-head' }, [
        el('strong', { text: slot.label }),
        asset ? el('span', { className: 'tag karakter-asset-' + asset.status, text: ASSET_LABEL[asset.status] || asset.status }) : el('span', { className: 'tag', text: 'Kosong' }),
      ]),
    ];
    if (asset && asset.status === 'failed') {
      children.push(el('p', { className: 'karakter-reason', text: REASON_LABEL[asset.reason_code] || REASON_LABEL.asset_failed }));
      if (asset.failed_reason) children.push(el('p', { className: 'muted karakter-raw', text: 'BytePlus: ' + asset.failed_reason }));
    }
    if (asset && asset.status === 'processing') {
      children.push(el('p', { className: 'muted', text: 'BytePlus mencocokkan dengan hasil verifikasi. Biasanya 1 sampai 10 menit.' }));
    }
    if (asset && asset.status === 'active') {
      children.push(el('p', { className: 'muted karakter-raw', text: 'asset://' + asset.asset_id }));
    }
    if (!asset || asset.status === 'failed') {
      var input = el('input', { type: 'file', accept: slot.accept, disabled: busy, className: 'karakter-file' });
      input.addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        upload(identity, slot, file);
        event.target.value = '';
      });
      children.push(el('label', { className: 'karakter-upload' + (busy ? ' is-busy' : '') }, [
        el('span', { className: 'action-btn', text: busy ? 'Mengunggah...' : (asset ? 'Ganti file' : 'Unggah') }),
        input,
      ]));
      children.push(el('p', { className: 'hint', text: slot.hint }));
    }
    return el('div', { className: 'karakter-slot' }, children);
  }

  function renderIdentity(identity) {
    var busy = isBusy(identity.id);
    var status = identity.verification_status;
    var header = el('div', { className: 'karakter-card-head' }, [
      el('div', {}, [
        el('h3', { text: identity.display_name }),
        el('div', { className: 'muted karakter-meta', text: (identity.owner_kind === 'founder' ? 'Founder' : 'Pelanggan') + ' · dibuat ' + formatDate(identity.created_at) }),
      ]),
      el('span', { className: 'tag karakter-status-' + status, text: STATUS_LABEL[status] || status }),
    ]);
    var body = [];
    if (status === 'pending') body.push(renderLinkBlock(identity));
    if (status === 'failed') body.push(el('p', { className: 'karakter-reason', text: 'BytePlus tidak bisa memverifikasi wajah ini. Mulai ulang untuk tautan baru.' }));
    if (status === 'expired') body.push(el('p', { className: 'muted', text: 'Tautan 30 menit sudah lewat. Mulai ulang untuk tautan baru.' }));
    if (identity.group_ready) {
      body.push(el('div', { className: 'karakter-slots' }, SLOTS.map(function (slot) { return renderSlot(identity, slot); })));
    }
    var actions = [];
    if (restartable(identity)) actions.push(el('button', { type: 'button', className: 'action-btn primary', disabled: busy, onclick: function () { restart(identity); } }, ['Mulai ulang verifikasi']));
    if (inFlight(identity)) actions.push(el('button', { type: 'button', className: 'action-btn', disabled: busy, onclick: function () { refresh(identity); } }, ['Periksa status']));
    actions.push(el('button', { type: 'button', className: 'action-btn karakter-danger', disabled: busy, onclick: function () { revoke(identity); } }, ['Hapus']));
    return el('article', { className: 'card karakter-card', 'data-identity': identity.id }, [header].concat(body, [el('div', { className: 'toolbar karakter-actions' }, actions)]));
  }

  function render() {
    if (!root) return;
    var children = [
      el('div', { className: 'section-head' }, [
        el('h2', { id: 'karakter-title', text: 'Karakter' }),
        el('span', { className: 'meta', text: 'Wajah asli yang diverifikasi BytePlus, dipakai Studio sebagai referensi asset://' }),
      ]),
      renderQuota(),
      renderNewForm(),
    ];
    if (state.loading) children.push(el('div', { className: 'alert info', text: 'Memuat...' }));
    if (state.error) children.push(el('div', { className: 'alert error', text: state.error }));
    else if (state.notice) children.push(el('div', { className: 'alert success', text: state.notice }));
    if (!state.loading && state.identities.length === 0) {
      children.push(el('div', { className: 'table-empty', text: 'Belum ada karakter. Tambah satu, lalu verifikasi di ponsel.' }));
    }
    children.push(el('div', { className: 'karakter-grid' }, state.identities.map(renderIdentity)));

    var active = document.activeElement;
    var keepFocus = active && active.tagName === 'INPUT' && active.type === 'text' && root.contains(active);
    var selection = keepFocus ? [active.selectionStart, active.selectionEnd] : null;
    root.innerHTML = '';
    children.forEach(function (child) { root.appendChild(child); });
    if (keepFocus) {
      var input = root.querySelector('input[type="text"]');
      if (input) {
        input.focus();
        try { input.setSelectionRange(selection[0], selection[1]); } catch (e) { /* ignore */ }
      }
    }
  }

  function mount() {
    root = document.querySelector('[data-karakter-panel]');
    if (!root) return;
    root.classList.add('section', 'karakter-panel');
    render();
    load(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.WeUseKarakter = { reload: function () { return load(true); } };
})();
