import { jobState, isActiveJob, mayCancelJob, elapsedTime, JOB_STEPS, historyLabel } from './studio-job-state.js';
import { referenceTagPrefix, missingReferenceTags, bindReferenceTags, SIMPLE_MODEL, SIMPLE_MODELS, SIMPLE_PROMPT_LIMIT, simpleModelSettings, simpleReferenceError, compileSimplePrompt, simplePromptText, simpleEstimate } from '../../api/_shared/ai-video-operator.ts';
import { ReferencePrompt } from './studio-reference-editor.jsx';
import { PHOTO_ACCEPT, AUDIO_ACCEPT, VIDEO_ACCEPT, mediaKind, prepareMedia, uploadMedia, acceptForKind, looksLikeSheet, withLastFrameSentence, captureVideoFrame } from './studio-media.js';
import { bindVisualViewport, scrollIntoVisual } from './studio-phone-viewport.js';
import { writePending, readPending, clearPending, writeJobSnapshot, readJobSnapshot } from './studio-phone-persist.js';
import { rafProgress, bindPageLifecycle, markUploadingFailed } from './studio-phone-upload.js';
import { saveVideoFile, teardownVideo, playerProps } from './studio-phone-save.js';

const { useEffect, useRef, useState } = React;
const DRAFT_KEY = 'weuseai.studio.draft';
const REFS_KEY = 'weuseai.studio.refs';
const RATIOS = ['9:16', '16:9', '1:1', '21:9'];
const DURATIONS = [4, 6, 8, 10, 15, 30];
const RESOLUTIONS = ['720p', '1080p'];
// Verified Karakter assets live in the BytePlus library as asset://<id>; the
// Studio never has pixels for them, so every asset ref shows this avatar.
const ASSET_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#23262d"/><circle cx="32" cy="25" r="10" fill="#4d5566"/><path d="M14 54a18 18 0 0 1 36 0z" fill="#4d5566"/></svg>');
const money = (value) => '$' + Number(value || 0).toFixed(2);
function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function imageRole(role) { return role === 'first_frame' ? 'first_frame' : 'reference_image'; }
function isAssetPath(path) { return /^asset:\/\//.test(path || ''); }
function isRemotePath(path) { return /^(https:|asset:)/.test(path || ''); }
function assetKind(assetType) { return assetType === 'Audio' ? 'audio' : assetType === 'Video' ? 'video' : 'image'; }
function assetLabel(identity, asset) { return identity.display_name + ' · ' + asset.slot; }
function errorText(code, model = SIMPLE_MODEL) {
  const settings = simpleModelSettings(model);
  const clipRange = settings.minClipSeconds + '–' + settings.maxClipSeconds;
  const messages = {
    photo_size: 'Foto maksimal 20 MB.', photo_decode: 'Foto tidak terbaca. Coba JPG atau PNG.',
    photo_dimensions: 'Foto minimal 240 piksel per sisi dan tidak terlalu memanjang.',
    audio_size: 'Audio maksimal 15 MB.', audio_decode: 'Audio tidak terbaca. Coba MP3 atau WAV.',
    audio_duration: 'Gunakan audio berdurasi ' + clipRange + ' detik.', audio_total: 'Total audio maksimal ' + settings.maxClipSeconds + ' detik.',
    video_size: 'Video maksimal 50 MB.', video_decode: 'Video tidak terbaca. Coba MP4.',
    video_format: 'Wan hanya menerima MP4 atau MOV.',
    video_duration: 'Gunakan referensi video berdurasi ' + clipRange + ' detik.', video_total: 'Total referensi video maksimal ' + settings.maxClipSeconds + ' detik.',
    media_total: 'Total referensi audio dan video maksimal 15 detik.', video_output_total: 'Durasi video dan referensi videonya maksimal 30 detik jika dijumlahkan.',
    unsupported_media: 'Pilih foto, video, atau audio.', photo_limit: 'Maksimal ' + settings.photoLimit + ' foto.', audio_limit: 'Maksimal ' + settings.audioLimit + ' audio.', video_limit: 'Maksimal ' + settings.videoLimit + ' referensi video.',
    upload_failed: 'Upload gagal. Coba lagi.', upload_timeout: 'Upload terlalu lama. Coba lagi.',
    monid_privacy: 'Provider menolak referensi wajah ini. Ganti referensinya.',
    monid_rejected: 'Prompt atau referensi ditolak. Periksa lalu ubah.',
    monid_blocked: 'Saldo atau batas pemakaian tidak mencukupi.', monid_unauthorized: 'Koneksi ke layanan video perlu diperbaiki.',
    monid_key_missing: 'Kunci layanan video belum dipasang di server ini. Hubungi admin.',
    monid_prompt_limit: 'Prompt terlalu panjang setelah referensi ditambahkan. Ringkas sedikit.',
    invalid_operator_prompt: 'Tulis prompt minimal 3 karakter.', invalid_skill_idea: 'Tulis prompt minimal 3 karakter.',
    operator_probe_required: 'Layanan generate belum aktif.', operator_inflight_cap: 'Masih ada video diproses. Tunggu selesai.',
    operator_reference_unavailable: 'Referensi tidak tersedia. Upload ulang file tersebut.',
    operator_sync_timeout: 'Status belum terkonfirmasi. Cek lagi.', operator_result_store_failed: 'Video belum tersimpan. Coba simpan ulang.',
    monid_submission_unknown: 'Pengiriman belum terkonfirmasi. Periksa status sebelum membuat ulang.',
    submission_unknown: 'Pengiriman belum terkonfirmasi. Periksa status sebelum membuat ulang.',
    network_unavailable: 'Koneksi terputus. Coba lagi.', invalid_operator_media_duration: 'Periksa referensi: tiap klip ' + clipRange + ' detik, total maksimal ' + settings.maxClipSeconds + ' detik.',
    invalid_operator_reference_tag: 'Ada tag yang belum terhubung. Pilih referensinya lagi.',
    invalid_operator_reference_binding: 'Tag referensi bermasalah. Hapus dan upload ulang referensinya.',
    invalid_operator_audio_format: 'Upload ulang audio agar formatnya sesuai.',
    invalid_operator_ref_combination: 'Referensi ini tidak bisa digabung. Frame awal Wan harus sendirian.',
    download_failed: 'Unduhan gagal. Coba lagi atau buka videonya.',
    identity_asset_not_active: 'Karakter ini belum aktif atau bukan milik pesanan ini. Lepas Karakter lalu coba lagi.',
    invalid_operator_ref_url: 'Karakter hanya bisa dipakai dengan Seedance 2.5.',
    invalid_operator_resolution: '1080p hanya tersedia saat Karakter terpasang.',
    modelark_not_configured: 'Jalur BytePlus belum aktif. Hubungi admin.',
    modelark_moderation_rejected: 'Prompt atau referensi ditolak BytePlus. Periksa lalu ubah.',
    modelark_unauthorized: 'Koneksi ke BytePlus perlu diperbaiki.', modelark_rate_limited: 'BytePlus sedang penuh. Coba beberapa menit lagi.',
    modelark_prompt_limit: 'Prompt terlalu panjang untuk BytePlus. Ringkas sedikit.',
    modelark_generation_failed: 'BytePlus belum berhasil merender. Ubah prompt lalu coba lagi.',
    modelark_submission_unknown: 'Pengiriman ke BytePlus belum terkonfirmasi. Periksa status sebelum membuat ulang.',
  };
  return messages[code] || 'Video belum berhasil dibuat. Periksa prompt dan referensi lalu coba lagi.';
}
function Icon({ name, size = 20, className = '' }) {
  const paths = {
    photo: <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></>,
    audio: <><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    edit: <><path d="m15 5 4 4M5 19l4-1L20 7l-4-4L5 14z"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    settings: <><path d="M4 7h4m5 0h7M4 17h9m5 0h2"/><circle cx="10.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/></>,
    history: <><path d="M3 5v5h5M3.5 10a9 9 0 1 1 1.7 8"/><path d="M12 7v5l3 2"/></>,
    arrow: <path d="m13 5-7 7 7 7M6 12h14"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></>,
    play: <path d="m9 5 10 7-10 7z"/>,
    film: <><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 9 5 3-5 3z"/></>,
    warning: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    spin: <path d="M21 12a9 9 0 1 1-9-9"/>,
    person: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg className={className + (name === 'spin' ? ' sv-spin' : '')} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.film}</svg>;
}
function Sheet({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const cancel = (event) => { event.preventDefault(); close(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); };
  }, []);
  return <dialog className="sv-sheet" ref={ref} aria-label={title} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="sv-sheet-content"><div className="sv-sheet-head"><h2>{title}</h2><button className="sv-icon-button" type="button" aria-label="Tutup" onClick={close}><Icon name="close"/></button></div>{children}</div>
  </dialog>;
}
function taggedReferences(rows) {
  const used = new Set(rows.map((row) => row.tag).filter(Boolean));
  const counts = {};
  return rows.map((row) => {
    if (row.tag) return row;
    const prefix = referenceTagPrefix(row.role);
    do { counts[prefix] = (counts[prefix] || 0) + 1; } while (used.has('@' + prefix + counts[prefix]));
    const tag = '@' + prefix + counts[prefix]; used.add(tag);
    return { ...row, tag };
  });
}
function jobPrompt(row) { return simplePromptText(row.source_prompt ?? row.prompt ?? ''); }
// Karakter name for an asset:// path, when the picker list is loaded.
function assetName(path, identities) {
  const id = String(path || '').replace(/^asset:\/\//, '');
  for (const identity of identities || []) {
    const asset = (identity.assets || []).find((item) => item.asset_id === id);
    if (asset) return assetLabel(identity, asset);
  }
  return 'Karakter';
}
function refsFromJob(job, identities) {
  const values = [...(job.ref_urls || []), ...(job.ref_paths || [])];
  return taggedReferences(values.map((path, i) => {
    const media = (job.reference_media || []).find((item) => item.path === path);
    const old = readLocal(REFS_KEY, []).find((item) => item.path === path);
    const role = job.ref_roles?.[i] || 'reference_image';
    const kind = role === 'reference_audio' ? 'audio' : role === 'reference_video' ? 'video' : 'image';
    const asset = isAssetPath(path);
    const lastFrame = kind === 'image' && new RegExp((job.ref_tags?.[i] || '') + ' is the last frame', 'i').test(jobPrompt(job));
    const name = asset ? (old?.name || assetName(path, identities)) : path.split('/').pop().split('?')[0];
    return { id: crypto.randomUUID(), tag: job.ref_tags?.[i], path, name, kind, role: kind === 'image' ? imageRole(role) : role, lastFrame, asset, seconds: job.ref_durations?.[i] || old?.seconds || 0, width: old?.width || 0, height: old?.height || 0, preview: asset ? null : media?.url || old?.thumb || (/^https:/.test(path) ? path : ''), thumb: asset ? ASSET_AVATAR : old?.thumb || '', status: 'ready', percent: 100 };
  }));
}
function restoreRef(row) {
  const kind = row.kind || (row.role === 'reference_audio' ? 'audio' : row.role === 'reference_video' ? 'video' : 'image');
  const role = kind === 'audio' || row.role === 'reference_audio' ? 'reference_audio' : kind === 'video' || row.role === 'reference_video' ? 'reference_video' : imageRole(row.role);
  const asset = isAssetPath(row.path);
  return { ...row, id: crypto.randomUUID(), kind, role, asset, lastFrame: row.lastFrame === true, width: row.width || 0, height: row.height || 0, status: row.status === 'failed' || !row.path || /^pending:/.test(row.path) ? 'failed' : 'ready', error: row.error || 'Upload belum selesai. Hapus dan pilih ulang file.', preview: asset ? null : row.thumb || '', thumb: asset ? ASSET_AVATAR : row.thumb };
}
function StudioApp() {
  const [initial] = useState(() => readLocal(DRAFT_KEY, {}));
  const [snapshot] = useState(() => readJobSnapshot());
  const [prompt, setPrompt] = useState(() => simplePromptText(String(initial.prompt || '')));
  const [model, setModel] = useState(SIMPLE_MODELS.includes(initial.selectedModel) ? initial.selectedModel : SIMPLE_MODEL);
  const modelRef = useRef(model);
  modelRef.current = model;
  const modelSettings = simpleModelSettings(model);
  const [ratio, setRatio] = useState(RATIOS.includes(initial.ratio) ? initial.ratio : '9:16');
  const [duration, setDuration] = useState(Number(initial.duration) >= 4 && Number(initial.duration) <= 30 ? Number(initial.duration) : 6);
  const [generateAudio, setGenerateAudio] = useState(initial.generateAudio !== false);
  const [resolution, setResolution] = useState(RESOLUTIONS.includes(initial.resolution) ? initial.resolution : '720p');
  const [refs, setRefs] = useState(() => taggedReferences(readLocal(REFS_KEY, []).filter((row) => row && (row.path || row.name)).map(restoreRef)));
  // Verified Karakter list for the picker; null until the first fetch settles.
  const [identities, setIdentities] = useState(null);
  // Saved character sheets (Monid-native, plain reference images — NOT the
  // BytePlus asset:// lane). These render on Seedance 2.5 today.
  const [characters, setCharacters] = useState([]);
  const [savingCharacter, setSavingCharacter] = useState('');
  const [characterName, setCharacterName] = useState('');
  const firstFrameOn = refs.some((row) => row.role === 'first_frame');
  // Any asset:// ref routes the job through BytePlus, which is the only lane with 1080p.
  const hasCharacter = refs.some((row) => row.asset);
  const sentResolution = hasCharacter ? resolution : '720p';
  const formatOptions = model === 'wan3.0' || firstFrameOn ? RATIOS.filter((item) => item !== '21:9') : RATIOS;
  // Derived fresh from the rows on screen, NOT carried across sessions. As a
  // monotonic persisted counter this labelled the ONLY attached photo @Image2
  // (or @Image7) whenever Studio had been used before, or a photo was attached,
  // removed and re-attached — while the hint below the prompt still told the
  // founder to write @Image1. That typed tag then failed to bind and Generate
  // stayed greyed out with "Tag @Image1 belum terhubung". Every row is created
  // carrying its own tag, so max-of-current-rows is the correct next ordinal,
  // and bindReferenceTags renumbers to submit order server-side anyway.
  const tagSequence = useRef({});
  const derivedTagSequence = {};
  for (const tag of refs.map((row) => row.tag)) {
    const match = /^@(Image|Audio|Video)([1-9]\d{0,5})$/.exec(tag || '');
    if (match) derivedTagSequence[match[1]] = Math.max(Number(derivedTagSequence[match[1]]) || 0, Number(match[2]));
  }
  tagSequence.current = derivedTagSequence;
  const [pendingId, setPendingId] = useState(() => readPending() || initial.pendingRequestId || '');
  const [selectedId, setSelectedId] = useState(() => {
    if (readPending() || initial.pendingRequestId) return '';
    return new URLSearchParams(location.search).get('job_id') || snapshot?.id || initial.jobId || '';
  });
  const [view, setView] = useState(() => {
    if (readPending() || initial.pendingRequestId) return 'create';
    if (snapshot?.view === 'create' || snapshot?.view === 'result') return snapshot.view;
    return (new URLSearchParams(location.search).get('job_id') || snapshot?.id || initial.jobId) ? 'result' : 'create';
  });
  const [studio, setStudio] = useState(null);
  const [job, setJob] = useState(null);
  const [connection, setConnection] = useState('loading');
  const [error, setError] = useState(() => (readPending() || initial.pendingRequestId) ? 'submission_unknown' : '');
  const [persistNotice, setPersistNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState('');
  const [working, setWorking] = useState('');
  const [checkedRun, setCheckedRun] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const [downloadState, setDownloadState] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [dropOver, setDropOver] = useState(false);
  const photoInput = useRef(null), videoInput = useRef(null), audioInput = useRef(null), promptInput = useRef(null), replaceInput = useRef(null), replaceTarget = useRef(null), player = useRef(null);
  const submittingRef = useRef(false), pendingRef = useRef(pendingId), selectedRef = useRef(selectedId), preflightRef = useRef(false);
  const refsRef = useRef(refs), cache = useRef(new Map()), uploads = useRef(new Map()), payloadDrafts = useRef(new Map());
  const loadRef = useRef(null), pollRef = useRef(null), failures = useRef(0), serial = useRef(0), alive = useRef(true);
  const viewRef = useRef(view), jobRef = useRef(job);
  const tid = new URLSearchParams(location.search).get('tid') || '';
  selectedRef.current = selectedId; refsRef.current = refs; viewRef.current = view; jobRef.current = job;
  function rememberRequest(id) {
    pendingRef.current = id; setPendingId(id);
    if (id) { if (writePending(id) === false) setPersistNotice(true); }
    else clearPending();
    writeLocal(DRAFT_KEY, { ...readLocal(DRAFT_KEY, {}), pendingRequestId: id });
  }
  function clearSelectedJob() {
    selectedRef.current = ''; setSelectedId('');
    const url = new URL(location.href);
    url.searchParams.delete('job_id');
    history.replaceState({}, '', url.pathname + url.search);
  }
  function showCreate() {
    teardownVideo(player.current);
    setView('create');
    requestAnimationFrame(() => scrollIntoVisual(document.getElementById('studio-prompt')));
  }
  function chooseJob(row) { selectedRef.current = row.id; setSelectedId(row.id); setJob(row); setView('result'); setSheet(''); setError(''); setDownloadState(''); }
  function changeModel(next) {
    setModel(next);
    if ((next === 'wan3.0' || firstFrameOn) && ratio === '21:9') setRatio('16:9');
  }
  useEffect(() => {
    if ((model === 'wan3.0' || firstFrameOn) && ratio === '21:9') setRatio('16:9');
  }, [model, firstFrameOn, ratio]);
  useEffect(() => {
    writeLocal(DRAFT_KEY, { ...readLocal(DRAFT_KEY, {}), prompt, selectedModel: model, ratio, duration, generateAudio, resolution, jobId: selectedId, tid, pendingRequestId: pendingRef.current, version: 5 });
    const url = new URL(location.href);
    selectedId ? url.searchParams.set('job_id', selectedId) : url.searchParams.delete('job_id');
    history.replaceState({}, '', url.pathname + url.search);
  }, [prompt, model, ratio, duration, generateAudio, resolution, selectedId]);
  useEffect(() => {
    writeLocal(REFS_KEY, refs.map(({ path, name, kind, role, tag, seconds, thumb, status, lastFrame, width, height, character }) => ({ path, name, kind, role, tag, seconds, thumb, lastFrame: lastFrame === true, character: character === true, width: width || 0, height: height || 0, status: status === 'ready' ? 'ready' : 'failed' })));
  }, [refs]);
  // Karakter forces Seedance 2.5; Wan cannot read asset:// refs.
  useEffect(() => { if (hasCharacter && model !== 'seedance-2.5') setModel('seedance-2.5'); }, [hasCharacter, model]);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/admin/customer-data?resource=ai-video-identities&tid=' + encodeURIComponent(tid), { credentials: 'same-origin', signal: controller.signal });
        if (response.status === 401) { location.assign('/admin/login'); return; }
        const body = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setIdentities(Array.isArray(body?.identities) ? body.identities : []);
      } catch { if (!controller.signal.aborted) setIdentities([]); }
    })();
    return () => controller.abort();
  }, [tid]);
  // Saved character sheets. Fetched explicitly (include_characters=1), never on
  // the 5s poll — each row costs a signed URL server-side.
  async function loadCharacters(signal) {
    try {
      const response = await fetch('/api/admin/customer-data?resource=ai-video-generate&simple=1&include_characters=1', { credentials: 'same-origin', signal: signal || AbortSignal.timeout(20000) });
      if (response.status === 401) { location.assign('/admin/login'); return; }
      const body = response.ok ? await response.json() : null;
      if (alive.current) setCharacters(Array.isArray(body?.characters) ? body.characters : []);
    } catch { /* keep whatever we already have; the sheet still opens */ }
  }
  useEffect(() => {
    const controller = new AbortController();
    loadCharacters(controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!job?.id) return;
    const next = jobState(job);
    writeJobSnapshot({ ...job, view, label: next.label, phase: next.phase });
  }, [job, view, job?.id, job?.status, job?.updated_at, job?.error_code]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { alive.current = false; uploads.current.forEach((controller) => controller.abort()); refsRef.current.forEach((row) => { if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview); }); }, []);
  useEffect(() => { setPlaybackError(false); setDownloadState(''); }, [job?.id, job?.result_url]);
  useEffect(() => { preflightRef.current = false; }, [refs]);
  useEffect(() => bindVisualViewport(), []);
  useEffect(() => bindPageLifecycle({
    onHide: () => {
      markUploadingFailed(refsRef.current, patchRef);
      const current = jobRef.current;
      if (current?.id) writeJobSnapshot({ ...current, view: viewRef.current, label: jobState(current).label, phase: jobState(current).phase });
    },
    onShow: () => { loadRef.current?.(); },
  }), []);
  async function post(action, extra = {}, signal) {
    let response;
    try {
      response = await fetch('/api/admin/customer-action', { method: 'POST', credentials: 'same-origin', signal: signal || AbortSignal.timeout(45000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    } catch { throw Object.assign(new Error(action === 'ai_video_generate_start' ? 'submission_unknown' : 'network_unavailable'), { uncertain: action === 'ai_video_generate_start' }); }
    if (response.status === 401) { location.assign('/admin/login'); throw new Error('network_unavailable'); }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error) {
      const uncertain = action === 'ai_video_generate_start' && (response.status >= 500 || !body);
      throw Object.assign(new Error(uncertain ? 'submission_unknown' : body?.error || 'network_unavailable'), { uncertain });
    }
    return body;
  }
  async function loadStudio() {
    const selected = selectedRef.current;
    const ticket = ++serial.current;
    try {
      const response = await fetch('/api/admin/customer-data?resource=ai-video-generate&simple=1&tid=' + encodeURIComponent(tid) + '&job_id=' + encodeURIComponent(selected), { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { location.assign('/admin/login'); return; }
      if (!response.ok) throw new Error('network_unavailable');
      const body = await response.json();
      if (!body.ok || !Array.isArray(body.jobs)) throw new Error('network_unavailable');
      if (!alive.current || selected !== selectedRef.current || ticket !== serial.current) return;
      const stable = (row) => {
        if (!row?.result_path || !row.result_url) return row;
        const key = row.id + ':' + row.result_path, old = cache.current.get(key);
        if (old && Date.now() - old.at < 45 * 60 * 1000) return { ...row, result_url: old.url };
        cache.current.set(key, { url: row.result_url, at: Date.now() }); return row;
      };
      body.jobs = body.jobs.map(stable); body.job = stable(body.job);
      failures.current = 0; setConnection(body.worker_warning ? 'delayed' : 'online'); setStudio(body);
      const confirmed = pendingRef.current && body.jobs.find((row) => row.client_request_id === pendingRef.current);
      if (confirmed) { rememberRequest(''); setError(''); chooseJob(confirmed); }
      else if (submittingRef.current) { return; }
      else if (pendingRef.current) {
        const found = selected && (body.job?.id === selected ? body.job : body.jobs.find((row) => row.id === selected));
        if (found && found.client_request_id === pendingRef.current) { rememberRequest(''); setError(''); chooseJob(found); }
      } else if (selected) {
        const found = body.job?.id === selected ? body.job : body.jobs.find((row) => row.id === selected);
        if (found) setJob(found);
        else if (!submittingRef.current) { setJob(null); setView('create'); }
      } else if (!submittingRef.current) {
        const active = body.jobs.find(isActiveJob);
        if (active) chooseJob(active);
      }
    } catch {
      if (!alive.current || ticket !== serial.current) return;
      failures.current++; setConnection('offline');
    }
  }
  loadRef.current = loadStudio;
  useEffect(() => {
    let timer, stopped = false, running = false;
    const run = async () => {
      if (stopped || running) return;
      clearTimeout(timer); running = true; await loadRef.current(); running = false;
      if (!stopped) timer = setTimeout(run, failures.current ? Math.min(30000, 5000 * 2 ** (failures.current - 1)) : document.hidden ? 30000 : 5000);
    };
    const wake = () => { if (!document.hidden) run(); };
    pollRef.current = run; run();
    addEventListener('online', wake);
    return () => { stopped = true; clearTimeout(timer); removeEventListener('online', wake); };
  }, []);
  useEffect(() => { loadRef.current(); }, [selectedId]);
  function patchRef(id, patch) { setRefs((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function assetRef(asset) { return refsRef.current.find((row) => row.path === 'asset://' + asset.asset_id); }
  // One reference row per Karakter asset. Same photo/audio/video caps as uploads;
  // no upload happens, the path is the BytePlus asset id and the row is ready at once.
  function toggleAsset(identity, asset) {
    if (submittingRef.current) return;
    const existing = assetRef(asset);
    if (existing) { removeRef(existing); return; }
    setError('');
    const kind = assetKind(asset.asset_type);
    const count = refsRef.current.filter((row) => row.kind === kind).length;
    const limit = kind === 'image' ? modelSettings.photoLimit : kind === 'audio' ? modelSettings.audioLimit : modelSettings.videoLimit;
    if (count >= limit) { setError(kind === 'image' ? 'photo_limit' : kind + '_limit'); return; }
    if (kind !== 'image') {
      const ready = refsRef.current.filter((row) => row.status === 'ready');
      const referenceError = simpleReferenceError('seedance-2.5', ready.concat({ role: 'reference_' + kind, asset: true }), duration);
      if (referenceError) { setError(referenceError); return; }
    }
    const prefix = referenceTagPrefix('reference_' + kind);
    tagSequence.current[prefix] = (Number(tagSequence.current[prefix]) || 0) + 1;
    const row = { id: crypto.randomUUID(), tag: '@' + prefix + tagSequence.current[prefix], name: assetLabel(identity, asset), kind, role: 'reference_' + kind, lastFrame: false, asset: true, status: 'ready', percent: 100, seconds: 0, width: 0, height: 0, preview: null, thumb: ASSET_AVATAR, path: 'asset://' + asset.asset_id };
    refsRef.current = refsRef.current.concat(row); setRefs(refsRef.current);
  }
  // Attach a saved character sheet as an ordinary reference image. Its
  // sheet_path is already `operator/...`, which is exactly what REF_PATH_RE
  // accepts, so it signs and submits like any uploaded photo — Seedance 2.5,
  // no BytePlus, no asset:// passthrough.
  function attachCharacter(character) {
    if (submitting || !character?.sheet_path) return;
    if (refsRef.current.some((row) => row.path === character.sheet_path)) { setSheet(''); return; }
    if (refsRef.current.filter((row) => row.kind === 'image').length >= modelSettings.photoLimit) { setError('photo_limit'); return; }
    const prefix = referenceTagPrefix('reference_image');
    tagSequence.current[prefix] = (Number(tagSequence.current[prefix]) || 0) + 1;
    const row = {
      id: crypto.randomUUID(), tag: '@' + prefix + tagSequence.current[prefix],
      name: character.name, kind: 'image', role: 'reference_image', lastFrame: false,
      character: true, status: 'ready', percent: 100, seconds: 0, width: 0, height: 0,
      preview: character.sheet_url || '', thumb: character.sheet_url || '', path: character.sheet_path,
    };
    refsRef.current = refsRef.current.concat(row); setRefs(refsRef.current);
    setSheet('');
    promptInput.current?.insert(row.tag);
  }
  // Save an already-uploaded photo as a reusable character sheet.
  async function saveAsCharacter(row, name) {
    const clean = String(name || '').trim();
    if (!row?.path || working) return;
    if (clean.length < 2 || clean.length > 60) { setError('invalid_operator_character_name'); return; }
    setWorking('character');
    try {
      const body = await post('ai_video_character_save', { name: clean, sheet_path: row.path });
      if (body?.character) setCharacters((list) => [body.character, ...list.filter((item) => item.id !== body.character.id)]);
      else await loadCharacters();
      setSavingCharacter(''); setCharacterName('');
    } catch (problem) { setError(problem.message || 'character_save_failed'); }
    finally { setWorking(''); }
  }
  function removeRef(row) {
    uploads.current.get(row.id)?.abort(); uploads.current.delete(row.id); payloadDrafts.current.delete(row.id);
    if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview);
    if (row.lastFrame) setPrompt((value) => withLastFrameSentence(value, row.tag, false));
    refsRef.current = refsRef.current.filter((item) => item.id !== row.id); setRefs(refsRef.current);
  }
  function chooseReplacement(row) {
    replaceTarget.current = row.id; replaceInput.current.accept = acceptForKind(row.kind); replaceInput.current.click();
  }
  function setFirstFrame(row) {
    const next = row.role === 'first_frame' ? 'reference_image' : 'first_frame';
    setRefs((rows) => rows.map((item) => {
      if (item.id === row.id) return { ...item, role: next, lastFrame: false };
      if (next === 'first_frame' && item.role === 'first_frame') return { ...item, role: 'reference_image' };
      return item;
    }));
    if (row.lastFrame) setPrompt((value) => withLastFrameSentence(value, row.tag, false));
    if (next === 'first_frame' && ratio === '21:9') setRatio('16:9');
  }
  function setLastFrame(row) {
    const on = !row.lastFrame;
    setRefs((rows) => rows.map((item) => {
      if (item.id === row.id) return { ...item, lastFrame: on, role: on ? 'reference_image' : item.role };
      if (on && item.lastFrame) return { ...item, lastFrame: false };
      return item;
    }));
    setPrompt((value) => {
      let next = value;
      if (on) refs.filter((item) => item.lastFrame && item.id !== row.id).forEach((item) => { next = withLastFrameSentence(next, item.tag, false); });
      return withLastFrameSentence(next, row.tag, on);
    });
  }
  async function replaceFile(file) {
    const row = refsRef.current.find((item) => item.id === replaceTarget.current);
    if (!row || !file || submittingRef.current) return;
    if (mediaKind(file) !== row.kind) { setError('unsupported_media'); return; }
    uploads.current.get(row.id)?.abort(); payloadDrafts.current.set(row.id, file);
    patchRef(row.id, { name: file.name, path: '', status: 'uploading', error: '', percent: 0, seconds: 0 });
    await uploadOne(row, file);
  }
  async function uploadOne(row, file) {
    const controller = new AbortController(); uploads.current.set(row.id, controller);
    if (!refsRef.current.some((item) => item.id === row.id)) { uploads.current.delete(row.id); return; }
    patchRef(row.id, { status: 'uploading', error: '', percent: 0 });
    try {
      const prepared = await prepareMedia(file);
      if (controller.signal.aborted) return;
      if (modelRef.current === 'wan3.0' && prepared.kind === 'video' && /\.webm$/i.test(prepared.file.name)) throw new Error('video_format');
      if (prepared.kind === 'audio' || prepared.kind === 'video') {
        const ready = refsRef.current.filter((item) => item.id !== row.id && item.status === 'ready');
        const referenceError = simpleReferenceError(modelRef.current, ready.concat({ role: 'reference_' + prepared.kind, seconds: prepared.seconds }), duration);
        if (referenceError) throw new Error(referenceError);
      }
      const preview = prepared.kind === 'video' ? prepared.thumb : URL.createObjectURL(prepared.file);
      if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview);
      patchRef(row.id, { preview, thumb: prepared.thumb, seconds: prepared.seconds, width: prepared.width || 0, height: prepared.height || 0 });
      const response = await post('ai_video_generate_upload', { filenames: [prepared.file.name] }, controller.signal);
      const slot = response.uploads?.[0]; if (!slot?.path || !(slot.signed_url || slot.signedUrl)) throw new Error('upload_failed');
      await uploadMedia(slot, prepared.file, rafProgress((percent) => patchRef(row.id, { percent })), controller.signal);
      if (controller.signal.aborted) return;
      patchRef(row.id, { path: slot.path, status: 'ready', percent: 100, name: file.name, kind: prepared.kind });
    } catch (problem) { if (!controller.signal.aborted) patchRef(row.id, { status: 'failed', error: errorText(problem.message, modelRef.current) }); }
    finally { if (uploads.current.get(row.id) === controller) uploads.current.delete(row.id); }
  }
  async function attachFiles(files, extras = {}) {
    if (submittingRef.current) return [];
    setError('');
    let photos = refsRef.current.filter((row) => row.kind === 'image').length;
    let audio = refsRef.current.filter((row) => row.kind === 'audio').length;
    let videos = refsRef.current.filter((row) => row.kind === 'video').length;
    const added = [];
    for (const file of Array.from(files || [])) {
      const kind = mediaKind(file);
      if (!kind) { setError('unsupported_media'); continue; }
      if (kind === 'image' && photos >= modelSettings.photoLimit) { setError('photo_limit'); continue; }
      if (kind === 'audio' && audio >= modelSettings.audioLimit) { setError('audio_limit'); continue; }
      if (kind === 'video' && videos >= modelSettings.videoLimit) { setError('video_limit'); continue; }
      if (kind === 'image') photos++; else if (kind === 'audio') audio++; else videos++;
      const prefix = referenceTagPrefix('reference_' + kind);
      tagSequence.current[prefix] = (Number(tagSequence.current[prefix]) || 0) + 1;
      const role = extras.role && kind === 'image' ? imageRole(extras.role) : 'reference_' + kind;
      const row = { id: crypto.randomUUID(), tag: '@' + prefix + tagSequence.current[prefix], name: file.name, kind, role, lastFrame: false, status: 'uploading', percent: 0, seconds: 0, width: 0, height: 0, preview: '', thumb: '', path: '' };
      added.push({ row, file }); payloadDrafts.current.set(row.id, file);
    }
    if (extras.role === 'first_frame') {
      added.forEach(({ row }) => { row.role = 'first_frame'; });
      refsRef.current = refsRef.current.map((item) => item.role === 'first_frame' ? { ...item, role: 'reference_image' } : item);
      if (ratio === '21:9') setRatio('16:9');
    }
    refsRef.current = refsRef.current.concat(added.map(({ row }) => row));
    setRefs(refsRef.current);
    const preparedRows = [];
    for (const { row, file } of added) {
      const controller = new AbortController(); uploads.current.set(row.id, controller);
      if (!refsRef.current.some((item) => item.id === row.id)) { uploads.current.delete(row.id); continue; }
      patchRef(row.id, { status: 'uploading', error: '', percent: 0 });
      try {
        const prepared = await prepareMedia(file);
        if (controller.signal.aborted) continue;
        if (modelRef.current === 'wan3.0' && prepared.kind === 'video' && /\.webm$/i.test(prepared.file.name)) throw new Error('video_format');
        if (prepared.kind === 'audio' || prepared.kind === 'video') {
          const ready = refsRef.current.filter((item) => item.id !== row.id && item.status === 'ready');
          const referenceError = simpleReferenceError(modelRef.current, ready.concat({ role: 'reference_' + prepared.kind, seconds: prepared.seconds }), duration);
          if (referenceError) throw new Error(referenceError);
        }
        const preview = prepared.kind === 'video' ? prepared.thumb : URL.createObjectURL(prepared.file);
        if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview);
        patchRef(row.id, { preview, thumb: prepared.thumb, seconds: prepared.seconds, width: prepared.width || 0, height: prepared.height || 0 });
        preparedRows.push({ row, file, prepared, controller });
      } catch (problem) {
        if (!controller.signal.aborted) patchRef(row.id, { status: 'failed', error: errorText(problem.message, modelRef.current) });
        if (uploads.current.get(row.id) === controller) uploads.current.delete(row.id);
      }
    }
    if (preparedRows.length) {
      try {
        const response = await post('ai_video_generate_upload', { filenames: preparedRows.map((item) => item.prepared.file.name) });
        for (let i = 0; i < preparedRows.length; i++) {
          const item = preparedRows[i];
          const slot = response.uploads?.[i];
          try {
            if (item.controller.signal.aborted) continue;
            if (!slot?.path || !(slot.signed_url || slot.signedUrl)) throw new Error('upload_failed');
            await uploadMedia(slot, item.prepared.file, rafProgress((percent) => patchRef(item.row.id, { percent })), item.controller.signal);
            if (item.controller.signal.aborted) continue;
            patchRef(item.row.id, { path: slot.path, status: 'ready', percent: 100, name: item.file.name, kind: item.prepared.kind });
          } catch (problem) {
            if (!item.controller.signal.aborted) patchRef(item.row.id, { status: 'failed', error: errorText(problem.message, modelRef.current) });
          } finally {
            if (uploads.current.get(item.row.id) === item.controller) uploads.current.delete(item.row.id);
          }
        }
      } catch (problem) {
        for (const item of preparedRows) {
          if (!item.controller.signal.aborted) patchRef(item.row.id, { status: 'failed', error: errorText(problem.message, modelRef.current) });
          if (uploads.current.get(item.row.id) === item.controller) uploads.current.delete(item.row.id);
        }
      }
    }
    return added.map(({ row }) => row);
  }
  const orderedRefs = refs.filter((row) => isRemotePath(row.path)).concat(refs.filter((row) => !isRemotePath(row.path)));
  const roleList = orderedRefs.map((row) => row.role);
  const clipSeconds = refs.filter((row) => row.kind !== 'image').reduce((sum, row) => sum + (row.seconds || 0), 0);
  const estimate = simpleEstimate(duration, clipSeconds, model, sentResolution, hasCharacter ? 'byteplus_modelark' : 'monid');
  const activeJob = (isActiveJob(job) ? job : studio?.jobs?.find(isActiveJob)) || (submitting ? { id: '' } : null);
  const busyRefs = refs.some((row) => row.status === 'uploading');
  const failedRefs = refs.some((row) => row.status === 'failed');
  const missingTags = missingReferenceTags(prompt, refs.map((row) => row.tag));
  const readyPhotos = refs.filter((row) => row.kind === 'image' && row.status === 'ready');
  const firstFrameSheets = refs.filter((row) => row.role === 'first_frame' && looksLikeSheet(row));
  const nextVideoTag = '@Video' + ((Number(tagSequence.current.Video) || 0) + 1);
  let binding, bindingError = '';
  try { binding = bindReferenceTags(prompt, roleList, orderedRefs.map((row) => row.tag)); } catch (problem) { bindingError = problem.message; }
  const length = compileSimplePrompt(binding?.prompt || prompt, roleList).length;
  const referenceError = simpleReferenceError(model, refs, duration);
  let blocker = '';
  if ((job?.error_code === 'monid_submission_unknown' || job?.error_code === 'modelark_submission_unknown') && checkedRun !== job.id) blocker = 'Periksa pengiriman sebelumnya sebelum membuat ulang.';
  else if (hasCharacter && model !== 'seedance-2.5') blocker = errorText('invalid_operator_ref_url');
  else if (busyRefs) blocker = 'Menyiapkan referensi…';
  else if (failedRefs) blocker = 'Upload ulang atau hapus file yang gagal.';
  else if (missingTags.length) blocker = 'Tag ' + missingTags.join(', ') + ' belum terhubung. Pilih referensi atau hapus tag.';
  else if (bindingError) blocker = errorText(bindingError, model);
  else if (referenceError) blocker = errorText(referenceError, model);
  else if (model === 'wan3.0' && refs.some((row) => row.role === 'first_frame') && refs.length > 1) blocker = errorText('invalid_operator_ref_combination', model);
  else if (length > SIMPLE_PROMPT_LIMIT) blocker = errorText('monid_prompt_limit');
  else if (studio && !studio.enabled) blocker = errorText('operator_probe_required');
  else if (studio?.wallet?.value != null && studio.wallet.value < estimate) blocker = 'Saldo belum cukup.';
  const state = jobState(job, clock);
  const canSync = Boolean(state.canSync);
  const disabled = Boolean(submitting || pendingId || activeJob || blocker || canSync || prompt.trim().length < 3);
  async function start(event) {
    event?.preventDefault();
    if (disabled || submittingRef.current || pendingRef.current) return;
    if (firstFrameSheets.length && !preflightRef.current) { setSheet('preflight'); return; }
    const requestId = crypto.randomUUID();
    if (writePending(requestId) === false) setPersistNotice(true);
    rememberRequest(requestId);
    clearSelectedJob();
    submittingRef.current = true; setSubmitting(true); setError('');
    // asset:// rides in ref_urls next to https: refs; only storage paths go to ref_paths.
    const remote = refs.filter((row) => isRemotePath(row.path)), local = refs.filter((row) => !isRemotePath(row.path));
    const ordered = remote.concat(local);
    const sentRatio = firstFrameOn && ratio === '21:9' ? '16:9' : ratio;
    const optimistic = { id: '', status: 'queued', created_at: new Date().toISOString(), model, ratio: sentRatio, duration_seconds: duration, estimate_usd: estimate, provider: hasCharacter ? 'byteplus_modelark' : 'monid' };
    setJob(optimistic); setView('result'); window.scrollTo({ top: 0, behavior: 'instant' });
    try {
      const body = await post('ai_video_generate_start', { prompt_mode: 'simple', prompt, model, ratio: sentRatio, duration_seconds: duration, resolution: sentResolution, generate_audio: generateAudio, tid: tid || null, client_request_id: requestId, ref_urls: remote.map((row) => row.path), ref_paths: local.map((row) => row.path), ref_roles: ordered.map((row) => row.role), ref_tags: ordered.map((row) => row.tag), ref_durations: ordered.map((row) => row.seconds || 0) });
      if (!body.job?.id) throw Object.assign(new Error('submission_unknown'), { uncertain: true });
      rememberRequest(''); chooseJob(body.job);
      if (body.worker_warning) setConnection('delayed');
      if (body.job.status === 'queued' && body.job.provider !== 'byteplus_modelark') {
        try {
          const sent = await post('ai_video_generate_submit', { job_id: body.job.id });
          if (sent.job) chooseJob(sent.job);
        } catch { setConnection('delayed'); }
      }
    } catch (problem) {
      if (problem.uncertain && !pendingRef.current) return;
      if (!problem.uncertain) rememberRequest('');
      setJob(null); setView('create'); setError(problem.message);
    } finally { submittingRef.current = false; setSubmitting(false); pollRef.current?.(); }
  }
  async function reuse(row) {
    teardownVideo(player.current);
    setWorking('reuse'); setError('');
    let current = row;
    try {
      if ((row.ref_paths?.length || 0) + (row.ref_urls?.length || 0) > 0) {
        const response = await fetch('/api/admin/customer-data?resource=ai-video-generate&simple=1&include_refs=1&job_id=' + encodeURIComponent(row.id), { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('operator_reference_unavailable');
        const body = await response.json(); if (body.job?.id !== row.id) throw new Error('operator_reference_unavailable'); current = body.job;
      }
      const attached = refsFromJob(current, identities);
      refsRef.current.forEach((item) => { if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview); });
      const nextModel = simpleModelSettings(current.model).id;
      const allowed = nextModel === 'wan3.0' || attached.some((item) => item.role === 'first_frame') ? RATIOS.filter((item) => item !== '21:9') : RATIOS;
      setRefs(attached); setPrompt(jobPrompt(current)); setModel(nextModel);
      setRatio(allowed.includes(current.ratio) ? current.ratio : '16:9');
      setDuration(current.duration_seconds || 6);
      setGenerateAudio(current.generate_audio !== false);
      setResolution(RESOLUTIONS.includes(current.resolution) && attached.some((item) => item.asset) ? current.resolution : '720p');
      setView('create'); setSheet(''); window.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => scrollIntoVisual(document.getElementById('studio-prompt')));
    } catch (problem) { setError(problem.message); }
    finally { setWorking(''); }
  }
  async function recover() {
    if (!job?.id || working) return;
    setWorking('sync'); setError('');
    try { const body = await post('ai_video_generate_submit', { job_id: job.id }); if (body.job) chooseJob(body.job); await loadStudio(); }
    catch (problem) { setError(problem.message); } finally { setWorking(''); }
  }
  async function cancel() {
    if (!mayCancelJob(job) || working) return;
    setWorking('cancel');
    try { const body = await post('ai_video_generate_cancel', { job_id: job.id }); if (body.job) chooseJob(body.job); }
    catch (problem) { setError(problem.message); } finally { setWorking(''); }
  }
  async function refreshVideo() {
    if (working) return; setWorking('player');
    cache.current.clear(); setPlaybackError(false); await loadStudio(); setWorking('');
  }
  async function saveVideo() {
    if (!job?.result_path || !job.result_url || downloadState === 'loading') return;
    setDownloadState('loading');
    try {
      const parsed = new URL(job.result_url, window.location.origin);
      if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('download_failed');
      const response = await fetch(parsed.href, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('download_failed');
      const blob = await response.blob();
      const file = new File([blob], 'weuseai-' + job.id.slice(0, 8) + '.mp4', { type: 'video/mp4' });
      const result = await saveVideoFile(file);
      setDownloadState(result && result.ok ? 'started' : 'failed');
    } catch { setDownloadState('failed'); }
  }
  async function attachResultVideo() {
    if (!job?.result_url || working) return;
    setWorking('attach-video'); setError('');
    try {
      const parsed = new URL(job.result_url, window.location.origin);
      if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('download_failed');
      const response = await fetch(parsed.href, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('download_failed');
      const blob = await response.blob();
      const file = new File([blob], 'weuseai-' + job.id.slice(0, 8) + '.mp4', { type: 'video/mp4' });
      await attachFiles([file]);
      showCreate();
    } catch (problem) { setError(problem.message); }
    finally { setWorking(''); }
  }
  async function attachLastFrame() {
    if (!player.current || working) return;
    setWorking('attach-frame'); setError('');
    try {
      const file = await captureVideoFrame(player.current, true);
      await attachFiles([file], { role: 'first_frame' });
      showCreate();
    } catch (problem) { setError(problem.message); }
    finally { setWorking(''); }
  }
  const resultReady = state.phase === 'ready';
  const canPlay = Boolean(job?.result_url) && (resultReady || state.phase === 'saving');
  const heading = state.label;
  const resultDetail = state.phase === 'failed' ? errorText(job?.error_code, job?.model) : state.detail;
  const unknown = pendingId && !submitting;
  const awaitingStatus = !job && Boolean(selectedId) && studio === null;
  const settingsLabel = (firstFrameOn ? 'ikut frame' : ratio) + (generateAudio ? '' : ' senyap') + ' ' + duration + ' dtk';
  const connectionCopy = [connection === 'offline' ? 'Koneksi terputus.' : connection === 'delayed' ? 'Pembaruan status terlambat.' : '', canSync ? 'Cek run yang sama sebelum membuat video baru.' : ''].filter(Boolean).join(' ');
  return <div className="sv-app" data-view={view}>
    <header className="sv-header"><a className="sv-brand" href="/admin" aria-label="Kembali ke admin"><img src="/assets/ads/logo-cat-mark.png" alt=""/><span>Video</span></a><div className="sv-header-actions">{view === 'result' ? <button className="sv-text-button sv-mobile-only" onClick={showCreate}>Prompt</button> : null}{job && view === 'create' ? <button className="sv-text-button sv-mobile-only" onClick={() => setView('result')}>{isActiveJob(job) ? <Icon name="spin" size={16}/> : null}Hasil</button> : null}<button className="sv-text-button" onClick={() => setSheet('history')}><Icon name="history" size={18}/>Riwayat</button></div></header>
    {connection === 'offline' || connection === 'delayed' || canSync ? <div className="sv-connection" role="status"><Icon name="warning" size={17}/><span>{connectionCopy}</span>{canSync ? <button type="button" disabled={Boolean(working)} onClick={recover}>Cek run yang sama</button> : null}{connection === 'offline' || connection === 'delayed' ? <button type="button" onClick={() => pollRef.current?.()}>Cek lagi</button> : null}</div> : null}
    {persistNotice ? <div className="sv-notice" role="status"><span>Status bisa hilang jika tab ditutup.</span><button className="sv-icon-button" aria-label="Tutup pesan" onClick={() => setPersistNotice(false)}><Icon name="close" size={18}/></button></div> : null}
    {error && !unknown ? <div className="sv-notice" role="alert"><span>{errorText(error, model)}</span><button className="sv-icon-button" aria-label="Tutup pesan" onClick={() => setError('')}><Icon name="close" size={18}/></button></div> : null}
    {unknown ? <div className="sv-uncertain" role="alert"><Icon name="warning"/><div><strong>Pengiriman belum terkonfirmasi</strong><p>Cek status sebelum membuat ulang.</p><button className="sv-small-button" onClick={() => pollRef.current?.()}>Cek status</button><button className="sv-text-button" onClick={() => setSheet('history')}>Lihat riwayat</button><details><summary>Opsi lain</summary><p>Permintaan sebelumnya mungkin sudah memakai saldo.</p><button className="sv-text-button" onClick={() => { rememberRequest(''); setError(''); }}>Mulai permintaan baru</button></details></div></div> : null}
    <main className="sv-workspace">
      <section className="sv-composer" aria-label="Buat video">
        <h1>Buat video</h1>
        {tid ? <p className="sv-order-label">Pesanan {tid}</p> : null}
        <form onSubmit={start}>
          <div className={'sv-prompt-box' + (dropOver ? ' is-dragging' : '')} onDragOver={(event) => { event.preventDefault(); setDropOver(true); }} onDragLeave={() => setDropOver(false)} onDrop={(event) => { event.preventDefault(); setDropOver(false); attachFiles(event.dataTransfer.files); }}>
            {refs.length ? <div className="sv-references" aria-label="Referensi terpasang">{refs.map((row) => <div className={'sv-reference ' + row.kind + (row.status === 'failed' ? ' is-failed' : '') + (row.asset ? ' is-asset' : '')} key={row.id} data-status={row.status} data-tag={row.tag} data-role={row.role} data-last-frame={row.lastFrame ? '1' : '0'} data-asset={row.asset ? '1' : '0'}>
              <button type="button" className="sv-reference-preview" aria-label={'Sisipkan ' + row.tag} disabled={submitting || row.status !== 'ready'} onClick={() => promptInput.current?.insert(row.tag)}>{row.asset ? <img className="sv-ref-avatar" src={ASSET_AVATAR} alt=""/> : row.kind !== 'audio' && row.preview ? <img src={row.preview} alt={row.name}/> : <Icon name={row.kind === 'audio' ? 'audio' : row.kind === 'video' ? 'film' : 'photo'} size={20}/>}<span className="sv-ref-tag">{row.tag}</span></button>
              {row.asset ? <span className="sv-ref-name" title={row.name}><span>{row.name}</span></span> : <button type="button" className="sv-ref-name" aria-label={'Ganti ' + row.name} title={'Ganti ' + row.name} disabled={submitting || row.status === 'uploading'} onClick={() => chooseReplacement(row)}><span>{row.name}</span><Icon name="edit" size={13}/></button>}
              {row.kind === 'image' && row.status === 'ready' && !row.asset ? <div className="sv-ref-roles"><button type="button" aria-pressed={row.role === 'first_frame'} disabled={submitting} onClick={() => setFirstFrame(row)}>Frame awal</button><button type="button" aria-pressed={row.lastFrame === true} disabled={submitting} onClick={() => setLastFrame(row)}>Frame akhir</button></div> : null}
              {row.kind === 'image' && row.status === 'ready' && !row.asset && !row.character ? (savingCharacter === row.id
                ? <div className="sv-character-save"><input value={characterName} onChange={(event) => setCharacterName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveAsCharacter(row, characterName); } }} autoFocus maxLength={60} placeholder="Nama karakter" aria-label="Nama karakter"/><button type="button" className="sv-text-button" disabled={working === 'character'} onClick={() => saveAsCharacter(row, characterName)}>{working === 'character' ? 'Menyimpan…' : 'Simpan'}</button><button type="button" className="sv-text-button" onClick={() => { setSavingCharacter(''); setCharacterName(''); }}>Batal</button></div>
                : <button type="button" className="sv-text-button" disabled={submitting} onClick={() => setSavingCharacter(row.id)}>Simpan karakter</button>) : null}
              {row.status === 'uploading' ? <small role="status">{row.percent ? 'Upload ' + row.percent + '%' : 'Menyiapkan…'}</small> : row.status === 'failed' ? <small>{row.error}</small> : row.asset ? <small>Karakter terverifikasi</small> : row.character ? <small>Karakter tersimpan</small> : row.kind !== 'image' ? <small>{Number(row.seconds || 0).toFixed(1)} dtk</small> : row.role === 'first_frame' ? <small>Frame awal</small> : row.lastFrame ? <small>Frame akhir</small> : null}
              {row.kind === 'audio' && row.preview && row.status === 'ready' ? <audio controls preload="none" src={row.preview} aria-label={'Putar ' + row.name}/> : null}
              {row.status === 'failed' && payloadDrafts.current.has(row.id) ? <button type="button" className="sv-text-button" disabled={submitting} onClick={() => uploadOne(row, payloadDrafts.current.get(row.id))}>Ulangi</button> : null}
              <button type="button" className="sv-icon-button sv-ref-remove" aria-label={'Hapus ' + row.name} disabled={submitting} onClick={() => removeRef(row)}><Icon name="close" size={16}/></button>
              {row.status === 'uploading' ? <div className="sv-upload-progress" style={{ width: row.percent + '%' }}/> : null}
            </div>)}</div> : null}
            <ReferencePrompt ref={promptInput} value={prompt} onChange={setPrompt} references={refs} disabled={submitting} onSubmit={start} onFiles={attachFiles}/>
            <div className="sv-attach-bar"><button type="button" className="sv-attach-button" disabled={submitting || refs.filter((row) => row.kind === 'image').length >= modelSettings.photoLimit} onClick={() => photoInput.current.click()}><Icon name="photo"/>Foto</button><button type="button" className="sv-attach-button" disabled={submitting || refs.filter((row) => row.kind === 'video').length >= modelSettings.videoLimit} onClick={() => videoInput.current.click()}><Icon name="film"/>Video</button><button type="button" className="sv-attach-button" disabled={submitting || refs.filter((row) => row.kind === 'audio').length >= modelSettings.audioLimit} onClick={() => audioInput.current.click()}><Icon name="audio"/>Audio</button><button type="button" className="sv-attach-button sv-attach-character" disabled={submitting || refs.filter((row) => row.kind === 'image').length >= modelSettings.photoLimit} onClick={() => setSheet('library')}><Icon name="person"/>Karakter{characters.length ? <span className="sv-attach-count">{characters.length}</span> : null}</button>{identities?.length ? <button type="button" className="sv-attach-button sv-attach-character" aria-pressed={hasCharacter} disabled={submitting} onClick={() => setSheet('karakter')}><Icon name="person"/>BytePlus{hasCharacter ? <span className="sv-attach-count">{refs.filter((row) => row.asset).length}</span> : null}</button> : null}{length > SIMPLE_PROMPT_LIMIT * .8 ? <span className={'sv-count' + (length > SIMPLE_PROMPT_LIMIT ? ' is-error' : '')}>{length.toLocaleString('id-ID')} / 6.000</span> : null}</div>
          </div>
          <input ref={replaceInput} className="sv-sr-only" type="file" tabIndex={-1} aria-label="Ganti file referensi" onChange={(event) => { replaceFile(event.target.files?.[0]); event.target.value = ''; }}/>
          <input ref={photoInput} className="sv-sr-only" type="file" accept={PHOTO_ACCEPT} multiple tabIndex={-1} aria-label="Upload foto" onChange={(event) => { attachFiles(event.target.files); event.target.value = ''; }}/>
          <input ref={videoInput} className="sv-sr-only" type="file" accept={VIDEO_ACCEPT} multiple tabIndex={-1} aria-label="Upload video" onChange={(event) => { attachFiles(event.target.files); event.target.value = ''; }}/>
          <input ref={audioInput} className="sv-sr-only" type="file" accept={AUDIO_ACCEPT} multiple tabIndex={-1} aria-label="Upload audio" onChange={(event) => { attachFiles(event.target.files); event.target.value = ''; }}/>
          <div className="sv-options"><div className="sv-model"><select aria-label="Model video" value={model} disabled={submitting} onChange={(event) => changeModel(event.target.value)}>{SIMPLE_MODELS.map((id) => <option key={id} value={id} disabled={hasCharacter && id !== 'seedance-2.5'}>{simpleModelSettings(id).label}</option>)}</select><Icon name="chevron" size={16}/></div><button type="button" className="sv-text-button" onClick={() => setSheet('settings')} disabled={submitting}><Icon name="settings" size={18}/>{settingsLabel}</button></div>
          {hasCharacter ? <p className="sv-hint">Karakter terverifikasi dirender lewat BytePlus. Resolusi 1080p tersedia di pengaturan. Lepas Karakter untuk generate lewat Seedance 2.5 sekarang.</p> : <p className="sv-hint">Foto dan audio memakai @Image1 / @Audio1 lewat Seedance 2.5. Karakter BytePlus tidak wajib.</p>}
          {readyPhotos.length >= 2 ? <p className="sv-hint">@Image1 = wajah, jangan campur background.</p> : null}
          {readyPhotos.length ? <p className="sv-hint">Foto wajah nyata bisa ditolak Seedance. Character sheet hasil generate biasanya aman.</p> : null}
          {firstFrameSheets.length ? <p className="sv-hint is-warn">Frame awal memakai gambar yang mirip character sheet.</p> : null}
          {blocker ? <p className="sv-blocker" role={failedRefs ? 'alert' : 'status'}>{blocker}</p> : null}
          <button className="sv-generate" type="submit" disabled={disabled}>{submitting ? <><Icon name="spin"/>Mengirim…</> : activeJob ? <><Icon name="spin"/>Video sedang dibuat</> : <><span>Generate video</span><span className="sv-generate-price">Est. {money(estimate)}</span></>}</button>
          {activeJob && view === 'create' && job?.id ? <button type="button" className="sv-text-button sv-show-result" onClick={() => setView('result')}>Lihat prosesnya</button> : null}
        </form>
      </section>
      <section className={'sv-result' + (!job && !awaitingStatus ? ' is-empty' : '')} id="studio-result" aria-label="Hasil video" aria-busy={Boolean(state.active || awaitingStatus)}>
        {job ? <>
          <div className="sv-result-heading"><h2>{heading}</h2>{job.provider === 'byteplus_modelark' ? <span className="sv-chip">Lewat BytePlus</span> : null}{resultReady ? <Icon className="sv-success" name="check" size={22}/> : null}</div>
          {state.step >= 0 ? <ol className="sv-hint">{JOB_STEPS.map((label, index) => <li key={label} aria-current={index === state.step ? 'step' : undefined}>{label}</li>)}</ol> : null}
          {canPlay ? <div className={'sv-player-frame ratio-' + String(job.ratio || '9:16').replace(':', '-')}><video ref={player} className="job-player" src={job.result_url} playsInline {...playerProps()} onError={() => setPlaybackError(true)}/>{playbackError ? <div className="sv-player-error" role="alert"><p>Video belum bisa diputar.</p><button className="sv-small-button" disabled={working === 'player'} onClick={refreshVideo}>Muat ulang video</button></div> : null}</div> : <div className={'sv-result-placeholder ' + (state.phase === 'failed' ? 'is-error' : '')}><div className="sv-state-icon"><Icon name={state.active ? 'spin' : state.phase === 'failed' || state.canSync ? 'warning' : 'film'} size={38}/></div><p role="status">{resultDetail}</p>{state.active ? <small>{elapsedTime(job.created_at, clock)}</small> : null}{state.canSync ? <button className="sv-small-button" disabled={Boolean(working)} onClick={recover}>{working === 'sync' ? 'Memeriksa…' : 'Cek lagi'}</button> : null}</div>}
          {job.status === 'queued' && job.provider === 'byteplus_modelark' ? <p className="sv-hint is-warn">Karakter ini menunggu BytePlus. Lepas Karakter di prompt, lalu generate lagi lewat Seedance 2.5.</p> : null}
          {state.phase === 'unconfirmed' ? <div className="sv-provider-check">{job.provider === 'byteplus_modelark' ? <a className="sv-small-button sv-full" href="https://console.byteplus.com/" target="_blank" rel="noreferrer">Periksa di BytePlus</a> : <a className="sv-small-button sv-full" href="https://app.monid.ai" target="_blank" rel="noreferrer">Periksa di Monid</a>}<details><summary>Sudah diperiksa?</summary><button className="sv-text-button" onClick={() => { setCheckedRun(job.id); setView('create'); }}>Buat permintaan baru</button></details></div> : resultReady ? <div className="sv-result-actions"><button className="sv-download" onClick={saveVideo} disabled={!job.result_url || downloadState === 'loading'}><Icon name={downloadState === 'loading' ? 'spin' : 'download'}/>{downloadState === 'loading' ? 'Menyiapkan unduhan…' : 'Simpan video'}</button><button className="sv-small-button" onClick={showCreate}>Lihat prompt</button><button className="sv-small-button" disabled={Boolean(working)} onClick={() => reuse(job)}>Gunakan lagi</button><details className="sv-full"><summary>Opsi lain</summary><button className="sv-small-button" disabled={Boolean(working)} onClick={attachResultVideo}>{working === 'attach-video' ? 'Memasang…' : 'Pasang sebagai ' + nextVideoTag}</button><button className="sv-small-button" disabled={Boolean(working)} onClick={attachLastFrame}>{working === 'attach-frame' ? 'Mengambil frame…' : 'Ambil frame terakhir → frame awal'}</button></details></div> : state.phase === 'failed' || state.phase === 'cancelled' ? <button className="sv-small-button sv-full" disabled={Boolean(working)} onClick={() => reuse(job)}>Ubah prompt</button> : <div className="sv-result-tools"><button className="sv-text-button" onClick={() => pollRef.current?.()}>Cek status</button>{job.status === 'queued' && job.provider !== 'byteplus_modelark' ? <button className="sv-small-button" disabled={Boolean(working)} onClick={recover}>{working === 'sync' ? 'Mengirim…' : 'Kirim ke Seedance'}</button> : null}{mayCancelJob(job) ? <button className="sv-text-button" disabled={Boolean(working)} onClick={cancel}>Batalkan</button> : null}<button className="sv-text-button sv-mobile-only" onClick={showCreate}>Lihat prompt</button></div>}
          {downloadState === 'started' ? <p className="sv-download-note" role="status">Unduhan dimulai.</p> : null}
          {downloadState === 'failed' ? <p className="sv-download-note is-error" role="alert">Unduhan gagal. <a href={job.result_url} target="_blank" rel="noreferrer">Buka video</a></p> : null}
          {resultReady && !job.result_url ? <button className="sv-small-button" onClick={refreshVideo}>Muat video</button> : null}
          {state.phase === 'failed' || state.canSync ? <details className="sv-error-details"><summary>Detail error</summary><code>{job.error_code}</code><span>{job.id}</span></details> : null}
        </> : awaitingStatus ? <div className="sv-result-placeholder"><div className="sv-state-icon"><Icon name="spin" size={38}/></div><p role="status">Memuat status…</p></div> : <div className="sv-empty-preview"><Icon name="film" size={44}/><span>Videomu tampil di sini</span></div>}
      </section>
    </main>
    {sheet === 'settings' ? <Sheet title="Pengaturan video" close={() => setSheet('')}><fieldset><legend>Format</legend><div className="sv-choice-row">{firstFrameOn ? <button type="button" aria-pressed={true} disabled><span className="sv-format-shape ratio-adaptive"/><span>ikut frame</span></button> : formatOptions.map((item) => <button type="button" key={item} aria-pressed={ratio === item} onClick={() => setRatio(item)}><span className={'sv-format-shape ratio-' + item.replace(':', '-')}/><span>{item}</span></button>)}</div></fieldset><fieldset><legend>Durasi</legend><div className="sv-duration-row">{DURATIONS.map((item) => <button key={item} type="button" aria-pressed={duration === item} onClick={() => setDuration(item)}>{item} dtk</button>)}</div></fieldset><fieldset><legend>Suara</legend><button type="button" className="sv-toggle" aria-pressed={generateAudio} onClick={() => setGenerateAudio(!generateAudio)}>{generateAudio ? 'Suara hidup' : 'Tanpa suara'}</button>{refs.some((row) => row.kind === 'audio') ? <p className="sv-hint">Audio terpasang memaksa suara tetap hidup saat generate.</p> : null}</fieldset><fieldset><legend>Resolusi</legend><div className="sv-duration-row sv-resolution-row">{RESOLUTIONS.map((item) => <button key={item} type="button" aria-pressed={sentResolution === item} disabled={item === '1080p' && !hasCharacter} onClick={() => setResolution(item)}>{item}</button>)}</div>{hasCharacter ? null : <p className="sv-hint">1080p tersedia saat Karakter terpasang.</p>}</fieldset><div className="sv-settings-note"><span>{modelSettings.label} · {sentResolution}</span>{studio?.wallet?.value != null ? <span>Saldo {money(studio.wallet.value)}</span> : null}</div><button className="sv-download sv-full" onClick={() => setSheet('')}>Selesai</button></Sheet> : null}
    {sheet === 'library' ? <Sheet title="Karakter" close={() => setSheet('')}><p className="sv-hint">Karakter tersimpan dipakai ulang sebagai referensi wajah lewat Seedance 2.5. Ketuk untuk memasang ke prompt.</p>{characters.length ? <div className="sv-character-grid">{characters.map((item) => <button key={item.id} type="button" className="sv-character-pick" disabled={submitting} onClick={() => attachCharacter(item)}>{item.sheet_url ? <img src={item.sheet_url} alt=""/> : <Icon name="photo" size={20}/>}<span>{item.name}</span></button>)}</div> : <p className="sv-hint">Belum ada karakter tersimpan. Upload foto — sheet karakter lebih aman daripada wajah asli — lalu pilih <strong>Simpan karakter</strong> pada foto itu.</p>}<button className="sv-download sv-full" onClick={() => setSheet('')}>Selesai</button></Sheet> : null}
    {sheet === 'karakter' ? <Sheet title="Karakter BytePlus" close={() => setSheet('')}><p className="sv-hint">Wajah dan suara terverifikasi. Ketuk aset untuk memasang atau melepas.</p><div className="sv-characters">{(identities || []).map((identity) => <div className="sv-character" key={identity.id}><div className="sv-character-head"><img className="sv-ref-avatar" src={ASSET_AVATAR} alt=""/><span><strong>{identity.display_name}</strong><small>{identity.owner_kind === 'founder' ? 'Founder' : 'Pelanggan'}</small></span></div><div className="sv-character-assets">{identity.assets.map((asset) => { const on = Boolean(assetRef(asset)); return <button key={asset.id} type="button" className={assetKind(asset.asset_type)} aria-pressed={on} disabled={submitting} onClick={() => toggleAsset(identity, asset)}><Icon name={asset.asset_type === 'Audio' ? 'audio' : asset.asset_type === 'Video' ? 'film' : 'photo'} size={16}/><span>{asset.slot}</span></button>; })}</div></div>)}</div><button className="sv-download sv-full" onClick={() => setSheet('')}>Selesai</button></Sheet> : null}
    {sheet === 'preflight' ? <Sheet title="Periksa referensi" close={() => setSheet('')}><p className="sv-hint is-warn">Frame awal memakai gambar yang mirip character sheet. Seedance bisa merender plat panel, bukan shot.</p><button className="sv-download sv-full" onClick={() => { preflightRef.current = true; setSheet(''); start(); }}>Lanjut generate</button></Sheet> : null}
    {sheet === 'history' ? <Sheet title="Riwayat video" close={() => setSheet('')}><div className="sv-history">{studio?.jobs?.length ? studio.jobs.map((row) => { const status = jobState(row); return <button key={row.id} className="sv-history-row" onClick={() => chooseJob(row)}><span className={'sv-history-symbol ' + status.tone}><Icon name={status.active ? 'spin' : status.phase === 'ready' ? 'play' : status.phase === 'failed' ? 'warning' : 'film'}/></span><span className="sv-history-copy"><span>{jobPrompt(row).slice(0, 100) || 'Video'}</span><small>{historyLabel(row)}</small></span><span className="sv-history-duration">{row.duration_seconds} dtk</span></button>; }) : <p className="sv-no-history">Belum ada video.</p>}</div><button className="sv-download sv-full" onClick={() => setSheet('')}>Tutup</button></Sheet> : null}
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<StudioApp/>);
