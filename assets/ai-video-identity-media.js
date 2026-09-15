// Client-side media checks for the Karakter page. Reads dimensions from the
// file header (JPEG, PNG, WEBP, HEIC) so the phone never has to decode a
// 30 MB photo, then falls back to the browser decoder when the header is
// unreadable. The original bytes are uploaded untouched.

export const IMAGE_MAX_BYTES = 30 * 1024 * 1024
export const AUDIO_MAX_BYTES = 15 * 1024 * 1024
export const IMAGE_MIN_SIDE = 300
export const IMAGE_MAX_SIDE = 6000
export const IMAGE_MIN_RATIO = 0.4
export const IMAGE_MAX_RATIO = 2.5
export const AUDIO_MIN_SECONDS = 2
export const AUDIO_MAX_SECONDS = 30

const IMAGE_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}
const AUDIO_MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

export const imageKind = (file) => {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (type === 'image/jpeg' || type === 'image/jpg' || /\.jpe?g$/.test(name)) return 'jpeg'
  if (type === 'image/png' || /\.png$/.test(name)) return 'png'
  if (type === 'image/webp' || /\.webp$/.test(name)) return 'webp'
  if (type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/.test(name)) return 'heic'
  return ''
}

export const audioKind = (file) => {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (type === 'audio/mpeg' || type === 'audio/mp3' || /\.mp3$/.test(name)) return 'mp3'
  if (type === 'audio/wav' || type === 'audio/x-wav' || type === 'audio/wave' || /\.wav$/.test(name)) return 'wav'
  return ''
}

export const imageMime = (kind) => IMAGE_MIME[kind] || ''
export const audioMime = (kind) => AUDIO_MIME[kind] || ''

const four = (bytes, i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3])
const be16 = (bytes, i) => (bytes[i] << 8) | bytes[i + 1]
const be32 = (bytes, i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
const le16 = (bytes, i) => bytes[i] | (bytes[i + 1] << 8)
const le32 = (bytes, i) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)

const isHeic = (bytes) => {
  if (bytes.length < 12 || four(bytes, 4) !== 'ftyp') return false
  const end = Math.min(bytes.length, be32(bytes, 0) || 32)
  for (let i = 8; i + 4 <= end; i += 4) {
    if (i !== 12 && /^(heic|heix|mif1|msf1)$/.test(four(bytes, i))) return true
  }
  return false
}

const jpegOrientation = (bytes) => {
  let i = 2
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue }
    const marker = bytes[i + 1]
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue }
    const size = be16(bytes, i + 2)
    if (marker === 0xE1 && size > 8 && i + 10 < bytes.length && four(bytes, i + 4) === 'Exif') {
      const tiff = i + 10
      const little = bytes[tiff] === 0x49
      const u16 = (o) => (little ? le16(bytes, o) : be16(bytes, o))
      const u32 = (o) => (little ? le32(bytes, o) : be32(bytes, o))
      if (tiff + 8 < bytes.length) {
        const ifd = tiff + u32(tiff + 4)
        const count = ifd + 2 < bytes.length ? u16(ifd) : 0
        for (let t = 0; t < count; t++) {
          const entry = ifd + 2 + t * 12
          if (entry + 12 <= bytes.length && u16(entry) === 0x0112) return u16(entry + 8)
        }
      }
    }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) break
    i += 2 + size
  }
  return 1
}

const headerSize = (bytes) => {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue }
      const marker = bytes[i + 1]
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue }
      const size = be16(bytes, i + 2)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC && size >= 7) {
        let width = be16(bytes, i + 7)
        let height = be16(bytes, i + 5)
        if (jpegOrientation(bytes) >= 5) { const swap = width; width = height; height = swap }
        return width && height ? { width, height } : null
      }
      i += 2 + size
    }
    return null
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 && four(bytes, 12) === 'IHDR') {
    const width = be32(bytes, 16)
    const height = be32(bytes, 20)
    return width && height ? { width, height } : null
  }
  if (four(bytes, 0) === 'RIFF' && four(bytes, 8) === 'WEBP') {
    const kind = four(bytes, 12)
    if (kind === 'VP8X' && bytes.length >= 30) {
      return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }
    }
    if (kind === 'VP8 ' && bytes.length >= 30) {
      return { width: bytes[26] | ((bytes[27] & 0x3f) << 8), height: bytes[28] | ((bytes[29] & 0x3f) << 8) }
    }
    if (kind === 'VP8L' && bytes.length >= 25) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  if (isHeic(bytes)) {
    let width = 0
    let height = 0
    let rotated = false
    for (let i = 8; i + 16 < bytes.length; i++) {
      if (four(bytes, i) === 'ispe' && width === 0) {
        const nextWidth = be32(bytes, i + 8)
        const nextHeight = be32(bytes, i + 12)
        if (nextWidth > 0 && nextHeight > 0 && nextWidth < 65536 && nextHeight < 65536) { width = nextWidth; height = nextHeight }
      }
      if (four(bytes, i) === 'irot' && ((bytes[i + 8] & 3) === 1 || (bytes[i + 8] & 3) === 3)) rotated = true
    }
    if (width && height) return rotated ? { width: height, height: width } : { width, height }
  }
  return null
}

const decodedSize = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const size = { width: bitmap.width, height: bitmap.height }
      if (bitmap.close) bitmap.close()
      if (size.width && size.height) return size
    } catch { /* fall through to the image element */ }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve(null)
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Returns { width, height } or null when the browser cannot read the file.
export const inspectImage = async (file) => {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 262144)).arrayBuffer())
  const parsed = headerSize(head)
  if (parsed) return parsed
  return decodedSize(file)
}

const wavSeconds = (bytes) => {
  if (bytes.length < 44 || four(bytes, 0) !== 'RIFF' || four(bytes, 8) !== 'WAVE') return 0
  let byteRate = 0
  let data = 0
  let i = 12
  while (i + 8 <= bytes.length) {
    const id = four(bytes, i)
    const size = le32(bytes, i + 4)
    if (id === 'fmt ' && size >= 16 && i + 28 <= bytes.length) byteRate = le32(bytes, i + 16)
    else if (id === 'data') data = size
    const step = 8 + size + (size & 1)
    if (step <= 0) break
    i += step
  }
  return byteRate > 0 && data > 0 ? data / byteRate : 0
}

// Returns the clip length in seconds, or 0 when it cannot be read.
export const inspectAudio = async (file) => {
  if (audioKind(file) === 'wav') {
    const seconds = wavSeconds(new Uint8Array(await file.slice(0, Math.min(file.size, 262144)).arrayBuffer()))
    if (seconds > 0) return seconds
  }
  const url = URL.createObjectURL(file)
  const node = document.createElement('audio')
  node.preload = 'metadata'
  try {
    const seconds = await new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(0), 4000)
      node.addEventListener('loadedmetadata', () => { window.clearTimeout(timer); resolve(node.duration) }, { once: true })
      node.addEventListener('error', () => { window.clearTimeout(timer); resolve(0) }, { once: true })
      node.src = url
    })
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  } finally {
    node.removeAttribute('src')
    node.load()
    URL.revokeObjectURL(url)
  }
}

// PUT the file to a signed URL with progress. Rejects with a stable code.
export const putWithProgress = (url, headers, file, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest()
  xhr.open('PUT', url)
  xhr.timeout = 120000
  for (const [key, value] of Object.entries(headers || {})) {
    if (typeof value === 'string') xhr.setRequestHeader(key, value)
  }
  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return
    onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
  }
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) resolve()
    else reject(new Error('upload_failed'))
  }
  xhr.onerror = () => reject(new Error('upload_failed'))
  xhr.ontimeout = () => reject(new Error('upload_timeout'))
  xhr.onabort = () => reject(new Error('upload_cancelled'))
  xhr.send(file)
})
