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
function four(bytes, i) { return String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]); }
function be16(bytes, i) { return (bytes[i] << 8) | bytes[i + 1]; }
function be32(bytes, i) { return ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0; }
function le16(bytes, i) { return bytes[i] | (bytes[i + 1] << 8); }
function le32(bytes, i) { return bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24); }
function photoCap() {
  const memory = typeof navigator !== 'undefined' ? Number(navigator.deviceMemory) : 0;
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 680px)').matches;
  return (memory > 0 && memory <= 4) || phone ? 2048 : 4096;
}
function isHeic(bytes) {
  if (bytes.length < 12 || four(bytes, 4) !== 'ftyp') return false;
  const end = Math.min(bytes.length, be32(bytes, 0) || 32);
  for (let i = 8; i + 4 <= end; i += 4) {
    if (i !== 12 && /^(heic|heix|mif1|msf1)$/.test(four(bytes, i))) return true;
  }
  return false;
}
function jpegOrientation(bytes) {
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
    const size = be16(bytes, i + 2);
    if (marker === 0xE1 && size > 8 && i + 10 < bytes.length && four(bytes, i + 4) === 'Exif') {
      const tiff = i + 10, little = bytes[tiff] === 0x49;
      const u16 = (o) => little ? le16(bytes, o) : be16(bytes, o);
      const u32 = (o) => little ? le32(bytes, o) : be32(bytes, o);
      if (tiff + 8 < bytes.length) {
        const ifd = tiff + u32(tiff + 4), count = ifd + 2 < bytes.length ? u16(ifd) : 0;
        for (let t = 0; t < count; t++) {
          const entry = ifd + 2 + t * 12;
          if (entry + 12 <= bytes.length && u16(entry) === 0x0112) return u16(entry + 8);
        }
      }
    }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) break;
    i += 2 + size;
  }
  return 1;
}
function imageSize(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
      const size = be16(bytes, i + 2);
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC && size >= 7) {
        let width = be16(bytes, i + 7), height = be16(bytes, i + 5);
        if (jpegOrientation(bytes) >= 5) { const swap = width; width = height; height = swap; }
        return width && height ? { width, height } : null;
      }
      i += 2 + size;
    }
    return null;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 && four(bytes, 12) === 'IHDR') {
    const width = be32(bytes, 16), height = be32(bytes, 20);
    return width && height ? { width, height } : null;
  }
  if (four(bytes, 0) === 'RIFF' && four(bytes, 8) === 'WEBP') {
    const kind = four(bytes, 12);
    if (kind === 'VP8X' && bytes.length >= 30) return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (kind === 'VP8 ' && bytes.length >= 30) return { width: bytes[26] | ((bytes[27] & 0x3f) << 8), height: bytes[28] | ((bytes[29] & 0x3f) << 8) };
    if (kind === 'VP8L' && bytes.length >= 25) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (isHeic(bytes)) {
    let width = 0, height = 0, rotated = false;
    for (let i = 8; i + 16 < bytes.length; i++) {
      if (four(bytes, i) === 'ispe' && !width) {
        const nextWidth = be32(bytes, i + 8), nextHeight = be32(bytes, i + 12);
        if (nextWidth > 0 && nextHeight > 0 && nextWidth < 65536 && nextHeight < 65536) { width = nextWidth; height = nextHeight; }
      }
      if (four(bytes, i) === 'irot' && ((bytes[i + 8] & 3) === 1 || (bytes[i + 8] & 3) === 3)) rotated = true;
    }
    if (width && height) return rotated ? { width: height, height: width } : { width, height };
  }
  return null;
}
function photoFits(width, height, cap) {
  return width >= 240 && height >= 240 && Math.max(width / height, height / width) <= 8 && Math.max(width, height) <= cap;
}
function keepNamed(file, name, type) {
  return file.name === name ? file : new File([file], name, { type: type || file.type });
}
function signName(file, ext) {
  return new RegExp('^[A-Za-z0-9._-]{1,80}\\' + ext + '$', 'i').test(file.name) ? file.name : stem(file) + ext;
}
async function readImageElement(file) {
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
async function readImage(file, width, height) {
  const cap = photoCap();
  if (typeof createImageBitmap === 'function' && width && height) {
    const scale = Math.min(1, cap / Math.max(width, height));
    try {
      return await createImageBitmap(file, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        imageOrientation: 'from-image',
      });
    } catch {}
  }
  return readImageElement(file);
}
async function jpegThumb(source, width, height) {
  const scale = 128 / Math.max(width, height || 1);
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(width * scale)); thumb.height = Math.max(1, Math.round(height * scale));
  const context = thumb.getContext('2d');
  if (typeof Blob !== 'undefined' && source instanceof Blob && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, { resizeWidth: thumb.width, resizeHeight: thumb.height, imageOrientation: 'from-image' });
      try { context.drawImage(bitmap, 0, 0, thumb.width, thumb.height); }
      finally { if (bitmap.close) bitmap.close(); }
      return thumb.toDataURL('image/jpeg', .72);
    } catch {}
    const image = await readImageElement(source);
    try { context.drawImage(image, 0, 0, thumb.width, thumb.height); }
    finally { if (image.close) image.close(); }
    return thumb.toDataURL('image/jpeg', .72);
  }
  context.drawImage(source, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/jpeg', .72);
}
async function preparePhoto(file) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('photo_size');
  const cap = photoCap();
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 131072)).arrayBuffer());
  const heic = isHeic(head);
  const parsed = imageSize(head);
  const jpeg = !heic && file.type === 'image/jpeg' && head[0] === 0xFF && head[1] === 0xD8;
  if (parsed && (Math.min(parsed.width, parsed.height) < 240 || Math.max(parsed.width / parsed.height, parsed.height / parsed.width) > 8)) {
    throw new Error('photo_dimensions');
  }
  if (jpeg && parsed && photoFits(parsed.width, parsed.height, cap)) {
    return { file: keepNamed(file, stem(file) + '.jpg', 'image/jpeg'), thumb: await jpegThumb(file, parsed.width, parsed.height), seconds: 0, width: parsed.width, height: parsed.height };
  }
  const image = await readImage(file, parsed?.width || 0, parsed?.height || 0);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  try {
    if (Math.min(width, height) < 240 || Math.max(width / height, height / width) > 8) throw new Error('photo_dimensions');
    const scale = Math.min(1, cap / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .93));
    if (!blob) throw new Error('photo_decode');
    return { file: new File([blob], stem(file) + '.jpg', { type: 'image/jpeg' }), thumb: await jpegThumb(canvas, width, height), seconds: 0, width: parsed?.width || width, height: parsed?.height || height };
  } finally { if (image.close) image.close(); }
}
function wavSeconds(bytes) {
  if (bytes.length < 44 || four(bytes, 0) !== 'RIFF' || four(bytes, 8) !== 'WAVE') return 0;
  let byteRate = 0, data = 0, i = 12;
  while (i + 8 <= bytes.length) {
    const id = four(bytes, i), size = le32(bytes, i + 4);
    if (id === 'fmt ' && size >= 16 && i + 28 <= bytes.length) byteRate = le32(bytes, i + 16);
    else if (id === 'data') data = size;
    const step = 8 + size + (size & 1);
    if (step <= 0) break;
    i += step;
  }
  return byteRate > 0 && data > 0 ? data / byteRate : 0;
}
async function metadataSeconds(file, error) {
  const url = URL.createObjectURL(file);
  const node = document.createElement('audio');
  node.preload = 'metadata';
  try {
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error(error));
      node.addEventListener('loadedmetadata', () => resolve(), { once: true });
      node.addEventListener('error', fail, { once: true });
      node.src = url;
    });
    let seconds = node.duration;
    if (!Number.isFinite(seconds)) {
      await new Promise((resolve) => {
        node.addEventListener('seeked', () => resolve(), { once: true });
        window.setTimeout(resolve, 800);
        node.currentTime = 1e101;
      });
      seconds = node.duration;
    }
    return seconds;
  } finally { node.removeAttribute('src'); node.load(); URL.revokeObjectURL(url); }
}
async function prepareAudio(file) {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('audio_size');
  if (file.type === 'audio/wav') {
    const seconds = wavSeconds(new Uint8Array(await file.slice(0, Math.min(file.size, 262144)).arrayBuffer()));
    if (seconds >= 1 && seconds <= 30) return { file: keepNamed(file, stem(file) + '.wav', 'audio/wav'), seconds, thumb: '' };
  }
  const hinted = await metadataSeconds(file, 'audio_decode').catch(() => 0);
  // Decode the supported range; the composer applies the currently selected model's limits.
  if (Number.isFinite(hinted) && hinted > 0 && (hinted < 1 || hinted > 30)) throw new Error('audio_duration');
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('audio_decode');
  const context = new Context();
  let audio;
  try {
    await context.resume();
    audio = await context.decodeAudioData(await file.arrayBuffer());
  } catch { throw new Error('audio_decode'); }
  finally { await context.close(); }
  const seconds = audio.duration;
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
    if (header.length < 12 || four(header, 4) !== 'ftyp') throw new Error('video_decode');
  }
  const ext = /\.mov$/i.test(name) ? '.mov' : /\.webm$/i.test(name) ? '.webm' : '.mp4';
  const type = ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4';
  const meta = await readVideoMeta(file);
  const nextName = signName(file, ext);
  return { file: file.name === nextName ? file : new File([file], nextName, { type }), ...meta };
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
function withTimeout(task, ms, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), ms);
    Promise.resolve(task).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
export async function prepareMedia(file) {
  const kind = mediaKind(file);
  if (kind === 'image') return { ...(await withTimeout(preparePhoto(file), 30000, 'upload_timeout')), kind };
  if (kind === 'audio') return { ...(await withTimeout(prepareAudio(file), 30000, 'upload_timeout')), kind };
  if (kind === 'video') return { ...(await withTimeout(prepareVideo(file), 30000, 'upload_timeout')), kind };
  throw new Error('unsupported_media');
}
export function uploadMedia(slot, file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const tick = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    const stop = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    let frame = 0, percent = -1;
    const finish = (error) => {
      if (frame) { stop(frame); frame = 0; }
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    if (signal?.aborted) { reject(new Error('upload_cancelled')); return; }
    xhr.open('PUT', slot.signed_url || slot.signedUrl);
    xhr.timeout = 90000;
    xhr.setRequestHeader('content-type', file.type);
    if (slot.token) xhr.setRequestHeader('authorization', 'Bearer ' + slot.token);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      percent = Math.min(99, Math.round(event.loaded / event.total * 100));
      if (frame) return;
      frame = tick(() => { frame = 0; if (percent >= 0) onProgress(percent); });
    };
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
  if (header.length < 12 || four(header, 4) !== 'ftyp') throw new Error('download_failed');
  const local = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = local; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(local), 0);
  return blob;
}
