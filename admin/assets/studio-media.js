export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/x-m4a,.mp3,.wav,.m4a,.aac';
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export function mediaKind(file) {
  const value = (file.type || '') + ' ' + (file.name || '');
  if (/audio\/|\.(mp3|wav|m4a|aac)$/i.test(value)) return 'audio';
  if (/video\/|\.(mp4|mov|webm)$/i.test(value)) return 'video';
  if (/image\/|\.(jpe?g|png|webp|heic|heif)$/i.test(value)) return 'image';
  return '';
}
export function acceptForKind(kind) {
  return kind === 'audio' ? AUDIO_ACCEPT : kind === 'video' ? VIDEO_ACCEPT : PHOTO_ACCEPT;
}
export function looksLikeSheet(row) {
  if (!row || row.kind !== 'image') return false;
  if (/(sheet|collage|panel|grid)/i.test(row.name || '')) return true;
  const width = Number(row.width) || 0, height = Number(row.height) || 0;
  return width >= 240 && height >= 240 && Math.max(width / height, height / width) >= 2.2;
}
export function withLastFrameSentence(prompt, tag, on) {
  const mark = tag + ' is the last frame';
  const cleaned = String(prompt || '').replace(new RegExp('(?:\\s*' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' is the last frame\\.?)+', 'gi'), '').replace(/[ \t]+$/g, '');
  if (!on) return cleaned;
  return new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' is the last frame', 'i').test(prompt || '') ? String(prompt) : (cleaned ? cleaned + ' ' : '') + mark;
}
function stem(file) { return (file.name || 'reference').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50) || 'reference'; }
async function readImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('photo_decode'));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
async function preparePhoto(file) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('photo_size');
  const image = await readImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  try {
    if (Math.min(width, height) < 240 || Math.max(width / height, height / width) > 8) throw new Error('photo_dimensions');
    const scale = Math.min(1, 4096 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .93));
    if (!blob) throw new Error('photo_decode');
    const thumb = document.createElement('canvas');
    const thumbScale = 128 / Math.max(width, height);
    thumb.width = Math.round(width * thumbScale); thumb.height = Math.round(height * thumbScale);
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return { file: new File([blob], stem(file) + '.jpg', { type: 'image/jpeg' }), thumb: thumb.toDataURL('image/jpeg', .72), seconds: 0, width, height };
  } finally { if (image.close) image.close(); }
}
async function prepareAudio(file) {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('audio_size');
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('audio_decode');
  const context = new Context();
  let audio;
  try { audio = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('audio_decode'); }
  finally { await context.close(); }
  const seconds = audio.duration;
  // Decode the supported range; the composer applies the currently selected model's limits.
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) throw new Error('audio_duration');
  // Upload a real WAV rather than relabeling an iPhone M4A or relying on upstream decoding.
  const channels = Math.min(audio.numberOfChannels, 2);
  const size = audio.length * channels * 2;
  const buffer = new ArrayBuffer(44 + size);
  const view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, size, true);
  const samples = Array.from({ length: channels }, (_, i) => audio.getChannelData(i));
  let offset = 44;
  for (let i = 0; i < audio.length; i++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, samples[channel][i]));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2;
  }
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error('audio_size');
  return { file: new File([buffer], stem(file) + '.wav', { type: 'audio/wav' }), seconds, thumb: '' };
}
async function readVideoMeta(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.playsInline = true;
  try {
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error('video_decode'));
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', fail, { once: true });
      video.src = url;
    });
    const seconds = video.duration;
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) throw new Error('video_duration');
    const target = Math.min(0.12, Math.max(0, seconds - 0.05));
    if (Math.abs((video.currentTime || 0) - target) > 0.01) {
      await new Promise((resolve) => {
        const done = () => resolve();
        video.addEventListener('seeked', done, { once: true });
        window.setTimeout(done, 800);
        video.currentTime = target;
      });
    }
    const width = video.videoWidth || 320, height = video.videoHeight || 180;
    const thumb = document.createElement('canvas');
    const scale = 128 / Math.max(width, height || 1);
    thumb.width = Math.max(1, Math.round(width * scale)); thumb.height = Math.max(1, Math.round(height * scale));
    thumb.getContext('2d').drawImage(video, 0, 0, thumb.width, thumb.height);
    return { seconds, thumb: thumb.toDataURL('image/jpeg', .72), width, height };
  } finally {
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
}
async function prepareVideo(file) {
  if (!file.size || file.size > VIDEO_MAX_BYTES) throw new Error('video_size');
  const name = file.name || 'reference.mp4';
  if (/\.mp4$/i.test(name) || file.type === 'video/mp4') {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (header.length < 12 || String.fromCharCode(...header.slice(4, 8)) !== 'ftyp') throw new Error('video_decode');
  }
  const ext = /\.mov$/i.test(name) ? '.mov' : /\.webm$/i.test(name) ? '.webm' : '.mp4';
  const type = ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4';
  const meta = await readVideoMeta(file);
  return { file: new File([file], stem(file) + ext, { type }), ...meta };
}
export async function captureVideoFrame(video, atEnd = true) {
  if (!video || !video.videoWidth) throw new Error('photo_decode');
  const target = atEnd ? Math.max(0, (Number(video.duration) || 0) - 0.05) : 0;
  if (Math.abs((video.currentTime || 0) - target) > 0.02) {
    await new Promise((resolve, reject) => {
      const done = () => { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.addEventListener('error', () => reject(new Error('photo_decode')), { once: true });
      window.setTimeout(done, 800);
      video.currentTime = target;
    });
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .93));
  if (!blob) throw new Error('photo_decode');
  return new File([blob], 'frame-awal.jpg', { type: 'image/jpeg' });
}
export async function prepareMedia(file) {
  const kind = mediaKind(file);
  if (kind === 'image') return { ...(await preparePhoto(file)), kind };
  if (kind === 'audio') return { ...(await prepareAudio(file)), kind };
  if (kind === 'video') return { ...(await prepareVideo(file)), kind };
  throw new Error('unsupported_media');
}
export function uploadMedia(slot, file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error) => {
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    if (signal?.aborted) { reject(new Error('upload_cancelled')); return; }
    xhr.open('PUT', slot.signed_url || slot.signedUrl);
    xhr.timeout = 90000;
    xhr.setRequestHeader('content-type', file.type);
    if (slot.token) xhr.setRequestHeader('authorization', 'Bearer ' + slot.token);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? null : new Error('upload_failed'));
    xhr.onerror = () => finish(new Error('upload_failed'));
    xhr.ontimeout = () => finish(new Error('upload_timeout'));
    xhr.onabort = () => finish(new Error('upload_cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}
export async function downloadVideo(url, filename) {
  const parsed = new URL(url, window.location.origin);
  if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('download_failed');
  const response = await fetch(parsed.href, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('download_failed');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('download_failed');
  const chunks = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > 80 * 1024 * 1024) { await reader.cancel(); throw new Error('download_failed'); }
    chunks.push(next.value);
  }
  const blob = new Blob(chunks, { type: 'video/mp4' });
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (header.length < 12 || String.fromCharCode(...header.slice(4, 8)) !== 'ftyp') throw new Error('download_failed');
  const local = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = local; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(local), 60000);
  return blob;
}
