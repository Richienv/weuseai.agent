import { jobState, isActiveJob, mayCancelJob, elapsedTime } from './studio-job-state.js';
import { referenceTagPrefix, missingReferenceTags, bindReferenceTags, SIMPLE_MODEL, SIMPLE_MODELS, SIMPLE_PROMPT_LIMIT, simpleModelSettings, simpleReferenceError, compileSimplePrompt, simplePromptText, simpleEstimate } from '../../api/_shared/ai-video-operator.ts';
import { ReferencePrompt } from './studio-reference-editor.jsx';
import { PHOTO_ACCEPT, AUDIO_ACCEPT, mediaKind, prepareMedia, uploadMedia, downloadVideo } from './studio-media.js';

const { useEffect, useRef, useState } = React;
const DRAFT_KEY = 'weuseai.studio.draft';
const REFS_KEY = 'weuseai.studio.refs';
const RATIOS = ['9:16', '16:9', '1:1'];
const DURATIONS = [5, 6, 10, 15, 20, 30];
const money = (value) => '$' + Number(value || 0).toFixed(2);
function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function errorText(code, model = SIMPLE_MODEL) {
  const settings = simpleModelSettings(model);
  const clipRange = settings.minClipSeconds + '–' + settings.maxClipSeconds;
  const messages = {
    photo_size: 'Foto maksimal 20 MB.', photo_decode: 'Foto tidak terbaca. Coba JPG atau PNG.',
    photo_dimensions: 'Foto minimal 240 piksel per sisi dan tidak terlalu memanjang.',
    audio_size: 'Audio maksimal 15 MB.', audio_decode: 'Audio tidak terbaca. Coba MP3 atau WAV.',
    audio_duration: 'Gunakan audio berdurasi ' + clipRange + ' detik.', audio_total: 'Total audio maksimal ' + settings.maxClipSeconds + ' detik.',
    video_duration: 'Gunakan referensi video berdurasi ' + clipRange + ' detik.', video_total: 'Total referensi video maksimal ' + settings.maxClipSeconds + ' detik.',
    media_total: 'Total referensi audio dan video maksimal 15 detik.', video_output_total: 'Durasi video dan referensi videonya maksimal 30 detik jika dijumlahkan.',
    unsupported_media: 'Pilih foto atau audio.', photo_limit: 'Maksimal ' + settings.photoLimit + ' foto.', audio_limit: 'Maksimal ' + settings.audioLimit + ' audio.', video_limit: 'Maksimal ' + settings.videoLimit + ' referensi video.',
    upload_failed: 'Upload gagal. Coba lagi.', upload_timeout: 'Upload terlalu lama. Coba lagi.',
    monid_privacy: 'Provider menolak referensi wajah ini. Ganti referensinya.',
    monid_rejected: 'Prompt atau referensi ditolak. Periksa lalu ubah.',
    monid_blocked: 'Saldo atau batas pemakaian tidak mencukupi.', monid_unauthorized: 'Koneksi ke layanan video perlu diperbaiki.',
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
    invalid_operator_ref_combination: 'Referensi ini tidak bisa digabung. Upload ulang sebagai foto.',
    download_failed: 'Unduhan gagal. Coba lagi atau buka videonya.',
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
function refsFromJob(job) {
  const values = [...(job.ref_urls || []), ...(job.ref_paths || [])];
  return taggedReferences(values.map((path, i) => {
    const media = (job.reference_media || []).find((item) => item.path === path);
    const old = readLocal(REFS_KEY, []).find((item) => item.path === path);
    const role = job.ref_roles?.[i] || 'reference_image';
    const kind = role === 'reference_audio' ? 'audio' : role === 'reference_video' ? 'video' : 'image';
    return { id: crypto.randomUUID(), tag: job.ref_tags?.[i], path, name: path.split('/').pop().split('?')[0], kind, role: kind === 'image' ? 'reference_image' : role, seconds: job.ref_durations?.[i] || old?.seconds || 0, preview: media?.url || old?.thumb || (/^https:/.test(path) ? path : ''), thumb: old?.thumb || '', status: 'ready', percent: 100 };
  }));
}
function StudioApp() {
  const [initial] = useState(() => readLocal(DRAFT_KEY, {}));
  const [prompt, setPrompt] = useState(() => simplePromptText(String(initial.prompt || '')));
  const [model, setModel] = useState(SIMPLE_MODELS.includes(initial.selectedModel) ? initial.selectedModel : SIMPLE_MODEL);
  const modelRef = useRef(model);
  modelRef.current = model;
  const modelSettings = simpleModelSettings(model);
  const [ratio, setRatio] = useState(RATIOS.includes(initial.ratio) ? initial.ratio : '9:16');
  const [duration, setDuration] = useState(Number(initial.duration) >= 4 && Number(initial.duration) <= 30 ? Number(initial.duration) : 6);
  const [refs, setRefs] = useState(() => taggedReferences(readLocal(REFS_KEY, []).filter((row) => row && (row.path || row.name)).map((row) => ({ ...row, id: crypto.randomUUID(), status: row.status === 'failed' || !row.path || /^pending:/.test(row.path) ? 'failed' : 'ready', error: row.error || 'Upload belum selesai. Hapus dan pilih ulang file.', preview: row.thumb || '', role: row.kind === 'audio' || row.role === 'reference_audio' ? 'reference_audio' : row.role === 'reference_video' ? 'reference_video' : 'reference_image', kind: row.kind || (row.role === 'reference_audio' ? 'audio' : row.role === 'reference_video' ? 'video' : 'image') }))));
  const tagSequence = useRef({ ...initial.tagSequence });
  for (const tag of refs.map((row) => row.tag)) {
    const match = /^@(Image|Audio|Video)([1-9]\d{0,5})$/.exec(tag || '');
    if (match) tagSequence.current[match[1]] = Math.max(Number(tagSequence.current[match[1]]) || 0, Number(match[2]));
  }
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('job_id') || initial.jobId || '');
  const [view, setView] = useState(selectedId ? 'result' : 'create');
  const [studio, setStudio] = useState(null);
  const [job, setJob] = useState(null);
  const [connection, setConnection] = useState('loading');
  const [error, setError] = useState(initial.pendingRequestId ? 'submission_unknown' : '');
  const [pendingId, setPendingId] = useState(initial.pendingRequestId || '');
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState('');
  const [working, setWorking] = useState('');
  const [checkedRun, setCheckedRun] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const [downloadState, setDownloadState] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [dropOver, setDropOver] = useState(false);
  const photoInput = useRef(null), audioInput = useRef(null), promptInput = useRef(null), replaceInput = useRef(null), replaceTarget = useRef(null);
  const submittingRef = useRef(false), pendingRef = useRef(pendingId), selectedRef = useRef(selectedId);
  const refsRef = useRef(refs), cache = useRef(new Map()), uploads = useRef(new Map()), payloadDrafts = useRef(new Map());
  const loadRef = useRef(null), pollRef = useRef(null), failures = useRef(0), serial = useRef(0), alive = useRef(true);
  const tid = new URLSearchParams(location.search).get('tid') || '';
  selectedRef.current = selectedId; refsRef.current = refs;
  function rememberRequest(id) { pendingRef.current = id; setPendingId(id); writeLocal(DRAFT_KEY, { ...readLocal(DRAFT_KEY, {}), pendingRequestId: id }); }
  function chooseJob(row) { selectedRef.current = row.id; setSelectedId(row.id); setJob(row); setView('result'); setSheet(''); setError(''); setDownloadState(''); }
  useEffect(() => {
    writeLocal(DRAFT_KEY, { ...readLocal(DRAFT_KEY, {}), prompt, selectedModel: model, ratio, duration, jobId: selectedId, tid, pendingRequestId: pendingRef.current, tagSequence: tagSequence.current, version: 4 });
    const url = new URL(location.href);
    selectedId ? url.searchParams.set('job_id', selectedId) : url.searchParams.delete('job_id');
    history.replaceState({}, '', url.pathname + url.search);
  }, [prompt, model, ratio, duration, selectedId]);
  useEffect(() => {
    writeLocal(REFS_KEY, refs.map(({ path, name, kind, role, tag, seconds, thumb, status }) => ({ path, name, kind, role, tag, seconds, thumb, status: status === 'ready' ? 'ready' : 'failed' })));
  }, [refs]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { alive.current = false; uploads.current.forEach((controller) => controller.abort()); refsRef.current.forEach((row) => { if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview); }); }, []);
  useEffect(() => { setPlaybackError(false); setDownloadState(''); }, [job?.id, job?.result_url]);
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
      else if (selected) {
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
    addEventListener('online', wake); document.addEventListener('visibilitychange', wake);
    return () => { stopped = true; clearTimeout(timer); removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); };
  }, []);
  useEffect(() => { loadRef.current(); }, [selectedId]);
  function patchRef(id, patch) { setRefs((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function removeRef(row) {
    uploads.current.get(row.id)?.abort(); uploads.current.delete(row.id); payloadDrafts.current.delete(row.id);
    if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview);
    refsRef.current = refsRef.current.filter((item) => item.id !== row.id); setRefs(refsRef.current);
  }
  function chooseReplacement(row) {
    replaceTarget.current = row.id; replaceInput.current.accept = row.kind === 'audio' ? AUDIO_ACCEPT : PHOTO_ACCEPT; replaceInput.current.click();
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
      if (prepared.kind === 'audio') {
        const ready = refsRef.current.filter((item) => item.id !== row.id && item.status === 'ready');
        const referenceError = simpleReferenceError(modelRef.current, ready.concat({ role: 'reference_audio', seconds: prepared.seconds }), duration);
        if (referenceError) throw new Error(referenceError);
      }
      const preview = URL.createObjectURL(prepared.file);
      if (row.preview?.startsWith('blob:')) URL.revokeObjectURL(row.preview);
      patchRef(row.id, { preview, thumb: prepared.thumb, seconds: prepared.seconds });
      const response = await post('ai_video_generate_upload', { filenames: [prepared.file.name] }, controller.signal);
      const slot = response.uploads?.[0]; if (!slot?.path || !(slot.signed_url || slot.signedUrl)) throw new Error('upload_failed');
      await uploadMedia(slot, prepared.file, (percent) => patchRef(row.id, { percent }), controller.signal);
      if (controller.signal.aborted) return;
      patchRef(row.id, { path: slot.path, status: 'ready', percent: 100, name: file.name, kind: prepared.kind });
    } catch (problem) { if (!controller.signal.aborted) patchRef(row.id, { status: 'failed', error: errorText(problem.message, modelRef.current) }); }
    finally { if (uploads.current.get(row.id) === controller) uploads.current.delete(row.id); }
  }
  async function attachFiles(files) {
    if (submittingRef.current) return;
    setError('');
    let photos = refsRef.current.filter((row) => row.kind === 'image').length;
    let audio = refsRef.current.filter((row) => row.kind === 'audio').length;
    const added = [];
    for (const file of Array.from(files || [])) {
      const kind = mediaKind(file);
      if (!kind) { setError('unsupported_media'); continue; }
      if (kind === 'image' && photos >= modelSettings.photoLimit) { setError('photo_limit'); continue; }
      if (kind === 'audio' && audio >= modelSettings.audioLimit) { setError('audio_limit'); continue; }
      kind === 'image' ? photos++ : audio++;
      const prefix = referenceTagPrefix('reference_' + kind);
      tagSequence.current[prefix] = (Number(tagSequence.current[prefix]) || 0) + 1;
      const row = { id: crypto.randomUUID(), tag: '@' + prefix + tagSequence.current[prefix], name: file.name, kind, role: 'reference_' + kind, status: 'uploading', percent: 0, seconds: 0, preview: '', thumb: '', path: '' };
      added.push({ row, file }); payloadDrafts.current.set(row.id, file);
    }
    writeLocal(DRAFT_KEY, { ...readLocal(DRAFT_KEY, {}), tagSequence: tagSequence.current });
    refsRef.current = refsRef.current.concat(added.map(({ row }) => row));
    setRefs((rows) => rows.concat(added.map(({ row }) => row)));
    // Bound concurrent memory use for full-resolution phone photos and decoded audio.
    for (const { row, file } of added) await uploadOne(row, file);
  }
  const orderedRefs = refs.filter((row) => /^https:/.test(row.path)).concat(refs.filter((row) => !/^https:/.test(row.path)));
  const roleList = orderedRefs.map((row) => row.role);
  const clipSeconds = refs.filter((row) => row.kind !== 'image').reduce((sum, row) => sum + (row.seconds || 0), 0);
  const estimate = simpleEstimate(duration, clipSeconds, model);
  const activeJob = (isActiveJob(job) ? job : studio?.jobs?.find(isActiveJob)) || (submitting ? { id: '' } : null);
  const busyRefs = refs.some((row) => row.status === 'uploading');
  const failedRefs = refs.some((row) => row.status === 'failed');
  const missingTags = missingReferenceTags(prompt, refs.map((row) => row.tag));
  let binding, bindingError = '';
  try { binding = bindReferenceTags(prompt, roleList, orderedRefs.map((row) => row.tag)); } catch (problem) { bindingError = problem.message; }
  const length = compileSimplePrompt(binding?.prompt || prompt, roleList).length;
  const referenceError = simpleReferenceError(model, refs, duration);
  let blocker = '';
  if (job?.error_code === 'monid_submission_unknown' && checkedRun !== job.id) blocker = 'Periksa pengiriman sebelumnya sebelum membuat ulang.';
  else if (busyRefs) blocker = 'Menyiapkan referensi…';
  else if (failedRefs) blocker = 'Upload ulang atau hapus file yang gagal.';
  else if (missingTags.length) blocker = 'Tag ' + missingTags.join(', ') + ' belum terhubung. Pilih referensi atau hapus tag.';
  else if (bindingError) blocker = errorText(bindingError, model);
  else if (referenceError) blocker = errorText(referenceError, model);
  else if (length > SIMPLE_PROMPT_LIMIT) blocker = errorText('monid_prompt_limit');
  else if (studio && !studio.enabled) blocker = errorText('operator_probe_required');
  else if (studio?.wallet?.value != null && studio.wallet.value < estimate) blocker = 'Saldo belum cukup.';
  const disabled = Boolean(submitting || pendingId || activeJob || blocker || connection !== 'online' || prompt.trim().length < 3);
  async function start(event) {
    event?.preventDefault();
    if (disabled || submittingRef.current || pendingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setError('');
    const requestId = crypto.randomUUID(); rememberRequest(requestId);
    const remote = refs.filter((row) => /^https:/.test(row.path)), local = refs.filter((row) => !/^https:/.test(row.path));
    const ordered = remote.concat(local);
    const optimistic = { id: '', status: 'queued', created_at: new Date().toISOString(), model, ratio, duration_seconds: duration, estimate_usd: estimate };
    setJob(optimistic); setView('result'); window.scrollTo({ top: 0, behavior: 'instant' });
    try {
      const body = await post('ai_video_generate_start', { prompt_mode: 'simple', prompt, model, ratio, duration_seconds: duration, resolution: '720p', generate_audio: true, tid: tid || null, client_request_id: requestId, ref_urls: remote.map((row) => row.path), ref_paths: local.map((row) => row.path), ref_roles: ordered.map((row) => row.role), ref_tags: ordered.map((row) => row.tag), ref_durations: ordered.map((row) => row.seconds || 0) });
      if (!body.job?.id) throw Object.assign(new Error('submission_unknown'), { uncertain: true });
      rememberRequest(''); chooseJob(body.job);
      if (body.worker_warning) setConnection('delayed');
    } catch (problem) {
      if (problem.uncertain && !pendingRef.current) return;
      if (!problem.uncertain) rememberRequest('');
      setJob(null); setView('create'); setError(problem.message);
    } finally { submittingRef.current = false; setSubmitting(false); pollRef.current?.(); }
  }
  async function reuse(row) {
    setWorking('reuse'); setError('');
    let current = row;
    try {
      if ((row.ref_paths?.length || 0) + (row.ref_urls?.length || 0) > 0) {
        const response = await fetch('/api/admin/customer-data?resource=ai-video-generate&simple=1&include_refs=1&job_id=' + encodeURIComponent(row.id), { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('operator_reference_unavailable');
        const body = await response.json(); if (body.job?.id !== row.id) throw new Error('operator_reference_unavailable'); current = body.job;
      }
      const attached = refsFromJob(current);
      refsRef.current.forEach((item) => { if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview); });
      setRefs(attached); setPrompt(jobPrompt(current)); setModel(simpleModelSettings(current.model).id);
      setRatio(RATIOS.includes(current.ratio) ? current.ratio : '9:16'); setDuration(current.duration_seconds || 6);
      setView('create'); setSheet(''); window.scrollTo({ top: 0, behavior: 'instant' });
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
    try { await downloadVideo(job.result_url, 'weuseai-' + job.id.slice(0, 8) + '.mp4'); setDownloadState('started'); }
    catch { setDownloadState('failed'); }
  }
  const state = jobState(job, clock);
  const resultReady = state.phase === 'ready';
  const heading = resultReady ? 'Video siap' : state.phase === 'failed' ? 'Video gagal' : state.phase === 'unconfirmed' ? 'Periksa pengiriman' : state.canSync ? 'Cek status video' : state.phase === 'cancelled' ? 'Dibatalkan' : state.phase === 'saving' ? 'Menyimpan video' : job ? 'Membuat video' : 'Hasil video';
  const resultDetail = state.phase === 'unconfirmed' ? 'Permintaan mungkin sudah diterima dan memakai saldo.' : state.phase === 'failed' ? errorText(job?.error_code, job?.model) : state.canSync ? 'Status belum terkonfirmasi.' : state.phase === 'stale' ? 'Masih menunggu kabar terbaru.' : state.phase === 'saving' ? 'Hasil render sedang disimpan.' : state.active ? 'Biasanya beberapa menit.' : '';
  const unknown = pendingId && !submitting;
  return <div className="sv-app" data-view={view}>
    <header className="sv-header"><a className="sv-brand" href="/admin" aria-label="Kembali ke admin"><img src="/assets/ads/logo-cat-mark.png" alt=""/><span>Video</span></a><div className="sv-header-actions">{job && view === 'create' ? <button className="sv-text-button sv-mobile-only" onClick={() => setView('result')}>{isActiveJob(job) ? <Icon name="spin" size={16}/> : null}Hasil</button> : null}<button className="sv-text-button" onClick={() => setSheet('history')}><Icon name="history" size={18}/>Riwayat</button></div></header>
    {connection === 'offline' || connection === 'delayed' ? <div className="sv-connection" role="status"><Icon name="warning" size={17}/><span>{connection === 'offline' ? 'Koneksi terputus.' : 'Pembaruan status terlambat.'}</span><button onClick={() => pollRef.current?.()}>Cek lagi</button></div> : null}
    {error && !unknown ? <div className="sv-notice" role="alert"><span>{errorText(error, model)}</span><button className="sv-icon-button" aria-label="Tutup pesan" onClick={() => setError('')}><Icon name="close" size={18}/></button></div> : null}
    {unknown ? <div className="sv-uncertain" role="alert"><Icon name="warning"/><div><strong>Pengiriman belum terkonfirmasi</strong><p>Cek status sebelum membuat ulang.</p><button className="sv-small-button" onClick={() => pollRef.current?.()}>Cek status</button><button className="sv-text-button" onClick={() => setSheet('history')}>Lihat riwayat</button><details><summary>Opsi lain</summary><p>Permintaan sebelumnya mungkin sudah memakai saldo.</p><button className="sv-text-button" onClick={() => { rememberRequest(''); setError(''); }}>Mulai permintaan baru</button></details></div></div> : null}
    <main className="sv-workspace">
      <section className="sv-composer" aria-label="Buat video">
        <h1>Buat video</h1>
        {tid ? <p className="sv-order-label">Pesanan {tid}</p> : null}
        <form onSubmit={start}>
          <div className={'sv-prompt-box' + (dropOver ? ' is-dragging' : '')} onDragOver={(event) => { event.preventDefault(); setDropOver(true); }} onDragLeave={() => setDropOver(false)} onDrop={(event) => { event.preventDefault(); setDropOver(false); attachFiles(event.dataTransfer.files); }}>
            {refs.length ? <div className="sv-references" aria-label="Referensi terpasang">{refs.map((row) => <div className={'sv-reference ' + row.kind + (row.status === 'failed' ? ' is-failed' : '')} key={row.id} data-status={row.status} data-tag={row.tag}>
              <button type="button" className="sv-reference-preview" aria-label={'Sisipkan ' + row.tag} disabled={submitting || row.status !== 'ready'} onClick={() => promptInput.current?.insert(row.tag)}>{row.kind === 'image' && row.preview ? <img src={row.preview} alt={row.name}/> : <Icon name={row.kind === 'audio' ? 'audio' : 'photo'} size={20}/>}<span className="sv-ref-tag">{row.tag}</span></button>
              <button type="button" className="sv-ref-name" aria-label={'Ganti ' + row.name} title={'Ganti ' + row.name} disabled={submitting || row.status === 'uploading' || row.kind === 'video'} onClick={() => chooseReplacement(row)}><span>{row.name}</span><Icon name="edit" size={13}/></button>
              {row.status === 'uploading' ? <small role="status">{row.percent ? 'Upload ' + row.percent + '%' : 'Menyiapkan…'}</small> : row.status === 'failed' ? <small>{row.error}</small> : row.kind !== 'image' ? <small>{Number(row.seconds || 0).toFixed(1)} dtk</small> : null}
              {row.kind === 'audio' && row.preview && row.status === 'ready' ? <audio controls preload="none" src={row.preview} aria-label={'Putar ' + row.name}/> : null}
              {row.status === 'failed' && payloadDrafts.current.has(row.id) ? <button type="button" className="sv-text-button" disabled={submitting} onClick={() => uploadOne(row, payloadDrafts.current.get(row.id))}>Ulangi</button> : null}
              <button type="button" className="sv-icon-button sv-ref-remove" aria-label={'Hapus ' + row.name} disabled={submitting} onClick={() => removeRef(row)}><Icon name="close" size={16}/></button>
              {row.status === 'uploading' ? <div className="sv-upload-progress" style={{ width: row.percent + '%' }}/> : null}
            </div>)}</div> : null}
            <ReferencePrompt ref={promptInput} value={prompt} onChange={setPrompt} references={refs} disabled={submitting} onSubmit={start} onFiles={attachFiles}/>
            <div className="sv-attach-bar"><button type="button" className="sv-attach-button" disabled={submitting || refs.filter((row) => row.kind === 'image').length >= modelSettings.photoLimit} onClick={() => photoInput.current.click()}><Icon name="photo"/>Foto</button><button type="button" className="sv-attach-button" disabled={submitting || refs.filter((row) => row.kind === 'audio').length >= modelSettings.audioLimit} onClick={() => audioInput.current.click()}><Icon name="audio"/>Audio</button>{length > SIMPLE_PROMPT_LIMIT * .8 ? <span className={'sv-count' + (length > SIMPLE_PROMPT_LIMIT ? ' is-error' : '')}>{length.toLocaleString('id-ID')} / 6.000</span> : null}</div>
          </div>
          <input ref={replaceInput} className="sv-sr-only" type="file" tabIndex={-1} aria-label="Ganti file referensi" onChange={(event) => { replaceFile(event.target.files?.[0]); event.target.value = ''; }}/>
          <input ref={photoInput} className="sv-sr-only" type="file" accept={PHOTO_ACCEPT} multiple tabIndex={-1} aria-label="Upload foto" onChange={(event) => { attachFiles(event.target.files); event.target.value = ''; }}/>
          <input ref={audioInput} className="sv-sr-only" type="file" accept={AUDIO_ACCEPT} multiple tabIndex={-1} aria-label="Upload audio" onChange={(event) => { attachFiles(event.target.files); event.target.value = ''; }}/>
          <div className="sv-options"><div className="sv-model"><select aria-label="Model video" value={model} disabled={submitting} onChange={(event) => setModel(event.target.value)}>{SIMPLE_MODELS.map((id) => <option key={id} value={id}>{simpleModelSettings(id).label}</option>)}</select><Icon name="chevron" size={16}/></div><button type="button" className="sv-text-button" onClick={() => setSheet('settings')} disabled={submitting}><Icon name="settings" size={18}/>{ratio}<span className="sv-option-divider"/>{duration} dtk</button></div>
          {blocker ? <p className="sv-blocker" role={failedRefs ? 'alert' : 'status'}>{blocker}</p> : null}
          <button className="sv-generate" type="submit" disabled={disabled}>{submitting ? <><Icon name="spin"/>Mengirim…</> : activeJob ? <><Icon name="spin"/>Video sedang dibuat</> : <><span>Generate video</span><span className="sv-generate-price">Est. {money(estimate)}</span></>}</button>
          {activeJob && view === 'create' && job?.id ? <button type="button" className="sv-text-button sv-show-result" onClick={() => setView('result')}>Lihat prosesnya</button> : null}
        </form>
      </section>
      <section className={'sv-result' + (!job ? ' is-empty' : '')} id="studio-result" aria-label="Hasil video" aria-busy={Boolean(state.active)}>
        {job ? <>
          <div className="sv-result-heading"><h2>{heading}</h2>{resultReady ? <Icon className="sv-success" name="check" size={22}/> : null}</div>
          {resultReady && job.result_url ? <div className="sv-player-frame"><video className="job-player" src={job.result_url} controls playsInline preload="metadata" onError={() => setPlaybackError(true)}/>{playbackError ? <div className="sv-player-error" role="alert"><p>Video belum bisa diputar.</p><button className="sv-small-button" disabled={working === 'player'} onClick={refreshVideo}>Muat ulang video</button></div> : null}</div> : <div className={'sv-result-placeholder ' + (state.phase === 'failed' ? 'is-error' : '')}><div className="sv-state-icon"><Icon name={state.active ? 'spin' : state.phase === 'failed' || state.canSync ? 'warning' : 'film'} size={38}/></div><p role="status">{resultDetail}</p>{state.active ? <small>{elapsedTime(job.created_at, clock)}</small> : null}{state.canSync ? <button className="sv-small-button" disabled={Boolean(working)} onClick={recover}>{working === 'sync' ? 'Memeriksa…' : 'Cek lagi'}</button> : null}</div>}
          {state.phase === 'unconfirmed' ? <div className="sv-provider-check"><a className="sv-small-button sv-full" href="https://app.monid.ai" target="_blank" rel="noreferrer">Periksa di Monid</a><details><summary>Sudah diperiksa?</summary><button className="sv-text-button" onClick={() => { setCheckedRun(job.id); setView('create'); }}>Buat permintaan baru</button></details></div> : resultReady ? <div className="sv-result-actions"><button className="sv-download" onClick={saveVideo} disabled={!job.result_url || downloadState === 'loading'}><Icon name={downloadState === 'loading' ? 'spin' : 'download'}/>{downloadState === 'loading' ? 'Menyiapkan unduhan…' : 'Simpan video'}</button><button className="sv-small-button" disabled={Boolean(working)} onClick={() => reuse(job)}>Gunakan lagi</button></div> : state.phase === 'failed' || state.phase === 'cancelled' ? <button className="sv-small-button sv-full" disabled={Boolean(working)} onClick={() => reuse(job)}>Ubah prompt</button> : <div className="sv-result-tools"><button className="sv-text-button" onClick={() => pollRef.current?.()}>Cek status</button>{mayCancelJob(job) ? <button className="sv-text-button" disabled={Boolean(working)} onClick={cancel}>Batalkan</button> : null}<button className="sv-text-button sv-mobile-only" onClick={() => setView('create')}>Lihat prompt</button></div>}
          {downloadState === 'started' ? <p className="sv-download-note" role="status">Unduhan dimulai.</p> : null}
          {downloadState === 'failed' ? <p className="sv-download-note is-error" role="alert">Unduhan gagal. <a href={job.result_url} target="_blank" rel="noreferrer">Buka video</a></p> : null}
          {resultReady && !job.result_url ? <button className="sv-small-button" onClick={refreshVideo}>Muat video</button> : null}
          {state.phase === 'failed' || state.canSync ? <details className="sv-error-details"><summary>Detail error</summary><code>{job.error_code}</code><span>{job.id}</span></details> : null}
        </> : <div className="sv-empty-preview"><Icon name="film" size={44}/><span>Videomu tampil di sini</span></div>}
      </section>
    </main>
    {sheet === 'settings' ? <Sheet title="Pengaturan video" close={() => setSheet('')}><fieldset><legend>Format</legend><div className="sv-choice-row">{RATIOS.map((item) => <button type="button" key={item} aria-pressed={ratio === item} onClick={() => setRatio(item)}><span className={'sv-format-shape ratio-' + item.replace(':', '-')}/><span>{item}</span></button>)}</div></fieldset><fieldset><legend>Durasi</legend><div className="sv-duration-row">{DURATIONS.map((item) => <button key={item} type="button" aria-pressed={duration === item} onClick={() => setDuration(item)}>{item} dtk</button>)}</div></fieldset><div className="sv-settings-note"><span>{modelSettings.label} · 720p</span>{studio?.wallet?.value != null ? <span>Saldo {money(studio.wallet.value)}</span> : null}</div><button className="sv-download sv-full" onClick={() => setSheet('')}>Selesai</button></Sheet> : null}
    {sheet === 'history' ? <Sheet title="Riwayat video" close={() => setSheet('')}><div className="sv-history">{studio?.jobs?.length ? studio.jobs.map((row) => { const status = jobState(row); return <button key={row.id} className="sv-history-row" onClick={() => chooseJob(row)}><span className={'sv-history-symbol ' + status.tone}><Icon name={status.active ? 'spin' : status.phase === 'ready' ? 'play' : status.phase === 'failed' ? 'warning' : 'film'}/></span><span className="sv-history-copy"><span>{jobPrompt(row).slice(0, 100) || 'Video'}</span><small>{status.phase === 'ready' ? 'Selesai' : status.phase === 'failed' ? 'Gagal' : status.active ? 'Diproses' : status.label}</small></span><span className="sv-history-duration">{row.duration_seconds} dtk</span></button>; }) : <p className="sv-no-history">Belum ada video.</p>}</div></Sheet> : null}
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<StudioApp/>);
