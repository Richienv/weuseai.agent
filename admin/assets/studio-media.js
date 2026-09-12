export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/x-m4a,.mp3,.wav,.m4a,.aac';
export function mediaKind(file) {
  const value = (file.type || '') + ' ' + (file.name || '');
  if (/audio\/|\.(mp3|wav|m4a|aac)$/i.test(value)) return 'audio';
  if (/image\/|\.(jpe?g|png|webp|heic|heif)$/i.test(value)) return 'image';
  return '';
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
    return { file: new File([blob], stem(file) + '.jpg', { type: 'image/jpeg' }), thumb: thumb.toDataURL('image/jpeg', .72), seconds: 0 };
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
export async function prepareMedia(file) {
  const kind = mediaKind(file);
  if (kind === 'image') return { ...(await preparePhoto(file)), kind };
  if (kind === 'audio') return { ...(await prepareAudio(file)), kind };
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
}
